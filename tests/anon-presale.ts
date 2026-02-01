import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import * as crypto from "crypto";

const idl = require("../target/idl/anon_presale.json");
const PROGRAM_ID = new PublicKey(idl.address);

function getPresalePDA(mint: PublicKey, creator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("presale"), mint.toBuffer(), creator.toBuffer()],
    PROGRAM_ID
  );
}

function getTokenVaultPDA(presale: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault"), presale.toBuffer()],
    PROGRAM_ID
  );
}

function getVaultAuthorityPDA(presale: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_auth"), presale.toBuffer()],
    PROGRAM_ID
  );
}

function getCommitmentPDA(presale: PublicKey, commitmentHash: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("commitment"), presale.toBuffer(), commitmentHash],
    PROGRAM_ID
  );
}

describe("anon-presale", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl as any, provider);
  const creator = provider.wallet;
  const connection = provider.connection;

  let mint: PublicKey;
  let creatorTokenAccount: PublicKey;

  const hardCap = new BN(2 * LAMPORTS_PER_SOL);
  const tokensForSale = new BN(1_000_000_000);
  let startTime: BN;
  let endTime: BN;

  const burnerWallet = Keypair.generate();
  const claimWallet = Keypair.generate();
  const secret = crypto.randomBytes(32);
  let commitmentHash: Buffer;

  let presalePDA: PublicKey;
  let tokenVaultPDA: PublicKey;
  let vaultAuthorityPDA: PublicKey;
  let commitmentPDA: PublicKey;

  // Second participant data
  const burner2 = Keypair.generate();
  const claimWallet2 = Keypair.generate();
  const secret2 = crypto.randomBytes(32);
  let commitHash2: Buffer;
  let commitPDA2: PublicKey;

  before(async () => {
    console.log("Program ID:", PROGRAM_ID.toBase58());
    console.log("Creator:", creator.publicKey.toBase58());
    console.log("Burner wallet:", burnerWallet.publicKey.toBase58());
    console.log("Claim wallet:", claimWallet.publicKey.toBase58());

    // Fund burner wallets from main wallet
    const fundTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: burnerWallet.publicKey,
        lamports: 2 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: burner2.publicKey,
        lamports: 3 * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(fundTx);
    console.log("Funded burner wallets");

    // Create mint
    mint = await createMint(
      connection,
      (provider.wallet as any).payer,
      creator.publicKey,
      null,
      6
    );
    console.log("Mint:", mint.toBase58());

    // Create creator token account and mint tokens
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      (provider.wallet as any).payer,
      mint,
      creator.publicKey
    );
    creatorTokenAccount = ata.address;

    await mintTo(
      connection,
      (provider.wallet as any).payer,
      mint,
      creatorTokenAccount,
      creator.publicKey,
      2_000_000_000
    );

    // Compute PDAs
    [presalePDA] = getPresalePDA(mint, creator.publicKey);
    [tokenVaultPDA] = getTokenVaultPDA(presalePDA);
    [vaultAuthorityPDA] = getVaultAuthorityPDA(presalePDA);

    // Commitment hash for participant 1
    const hashInput = Buffer.concat([secret, claimWallet.publicKey.toBuffer()]);
    commitmentHash = crypto.createHash("sha256").update(hashInput).digest();
    [commitmentPDA] = getCommitmentPDA(presalePDA, commitmentHash);

    // Commitment hash for participant 2
    const hashInput2 = Buffer.concat([secret2, claimWallet2.publicKey.toBuffer()]);
    commitHash2 = crypto.createHash("sha256").update(hashInput2).digest();
    [commitPDA2] = getCommitmentPDA(presalePDA, commitHash2);

    // Time: start now, end in 10 min
    const slot = await connection.getSlot();
    const timestamp = await connection.getBlockTime(slot);
    startTime = new BN(timestamp! - 10);
    endTime = new BN(timestamp! + 600);

    console.log("Presale PDA:", presalePDA.toBase58());
    console.log("Token Vault PDA:", tokenVaultPDA.toBase58());
    console.log("Commitment Hash:", commitmentHash.toString("hex"));
  });

  it("1. Initializes a presale", async () => {
    const tx = await program.methods
      .initializePresale(hardCap, tokensForSale, startTime, endTime)
      .accounts({
        creator: creator.publicKey,
        mint,
        presale: presalePDA,
        tokenVault: tokenVaultPDA,
        vaultAuthority: vaultAuthorityPDA,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  tx:", tx);

    const presale = await program.account.presale.fetch(presalePDA);
    expect(presale.creator.toBase58()).to.equal(creator.publicKey.toBase58());
    expect(presale.mint.toBase58()).to.equal(mint.toBase58());
    expect(presale.hardCap.toNumber()).to.equal(hardCap.toNumber());
    expect(presale.tokensForSale.toNumber()).to.equal(tokensForSale.toNumber());
    expect(presale.totalSolCommitted.toNumber()).to.equal(0);
    expect(presale.isFinalized).to.equal(false);
    expect(presale.commitmentCount).to.equal(0);

    const vaultAccount = await getAccount(connection, tokenVaultPDA);
    expect(Number(vaultAccount.amount)).to.equal(tokensForSale.toNumber());
    console.log("  Presale initialized! Tokens in vault:", Number(vaultAccount.amount));
  });

  it("2. Burner wallet commits SOL to presale", async () => {
    const commitAmount = new BN(0.5 * LAMPORTS_PER_SOL);

    const tx = await program.methods
      .commitToPresale(Array.from(commitmentHash) as any, commitAmount)
      .accounts({
        participant: burnerWallet.publicKey,
        presale: presalePDA,
        commitment: commitmentPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([burnerWallet])
      .rpc();

    console.log("  tx:", tx);

    const commitment = await program.account.commitment.fetch(commitmentPDA);
    expect(commitment.presale.toBase58()).to.equal(presalePDA.toBase58());
    expect(Buffer.from(commitment.commitmentHash).toString("hex")).to.equal(commitmentHash.toString("hex"));
    expect(commitment.solAmount.toNumber()).to.equal(commitAmount.toNumber());
    expect(commitment.isClaimed).to.equal(false);

    const presale = await program.account.presale.fetch(presalePDA);
    expect(presale.totalSolCommitted.toNumber()).to.equal(commitAmount.toNumber());
    expect(presale.commitmentCount).to.equal(1);
    console.log("  SOL committed anonymously via burner wallet!");
  });

  it("3. Cannot commit more than hard cap", async () => {
    const overCommit = new BN(2 * LAMPORTS_PER_SOL);
    const badSecret = crypto.randomBytes(32);
    const badClaim = Keypair.generate();
    const badHashInput = Buffer.concat([badSecret, badClaim.publicKey.toBuffer()]);
    const badHash = crypto.createHash("sha256").update(badHashInput).digest();
    const [badCommitPDA] = getCommitmentPDA(presalePDA, badHash);

    try {
      await program.methods
        .commitToPresale(Array.from(badHash) as any, overCommit)
        .accounts({
          participant: burner2.publicKey,
          presale: presalePDA,
          commitment: badCommitPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([burner2])
        .rpc();
      expect.fail("Should have thrown HardCapExceeded");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.contain("HardCapExceeded");
      console.log("  Correctly rejected: hard cap would be exceeded.");
    }
  });

  it("4. Cannot finalize before end time (cap not reached)", async () => {
    try {
      await program.methods
        .finalizePresale()
        .accounts({
          creator: creator.publicKey,
          presale: presalePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown PresaleStillActive");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.contain("PresaleStillActive");
      console.log("  Correctly rejected: presale still active.");
    }
  });

  it("5. Cannot claim before finalization", async () => {
    const claimTokenATA = await anchor.utils.token.associatedAddress({
      mint,
      owner: claimWallet.publicKey,
    });

    try {
      await program.methods
        .claimTokens(Array.from(secret) as any)
        .accounts({
          claimer: burnerWallet.publicKey,
          presale: presalePDA,
          commitment: commitmentPDA,
          claimWallet: claimWallet.publicKey,
          mint,
          tokenVault: tokenVaultPDA,
          vaultAuthority: vaultAuthorityPDA,
          claimTokenAccount: claimTokenATA,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([burnerWallet])
        .rpc();
      expect.fail("Should have thrown NotFinalized");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.contain("NotFinalized");
      console.log("  Correctly rejected: presale not finalized.");
    }
  });

  it("6. Second burner commits to reach hard cap", async () => {
    const commitAmount2 = new BN(1.5 * LAMPORTS_PER_SOL);

    const tx = await program.methods
      .commitToPresale(Array.from(commitHash2) as any, commitAmount2)
      .accounts({
        participant: burner2.publicKey,
        presale: presalePDA,
        commitment: commitPDA2,
        systemProgram: SystemProgram.programId,
      })
      .signers([burner2])
      .rpc();

    console.log("  tx:", tx);

    const presale = await program.account.presale.fetch(presalePDA);
    expect(presale.totalSolCommitted.toNumber()).to.equal(2 * LAMPORTS_PER_SOL);
    expect(presale.commitmentCount).to.equal(2);
    console.log("  Hard cap reached! Total SOL:", presale.totalSolCommitted.toNumber() / LAMPORTS_PER_SOL);
  });

  it("7. Creator finalizes presale (hard cap reached)", async () => {
    const creatorBalBefore = await connection.getBalance(creator.publicKey);

    const tx = await program.methods
      .finalizePresale()
      .accounts({
        creator: creator.publicKey,
        presale: presalePDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  tx:", tx);

    const presale = await program.account.presale.fetch(presalePDA);
    expect(presale.isFinalized).to.equal(true);

    const creatorBalAfter = await connection.getBalance(creator.publicKey);
    const solReceived = (creatorBalAfter - creatorBalBefore) / LAMPORTS_PER_SOL;
    console.log("  Presale finalized! Creator received ~" + solReceived.toFixed(4) + " SOL");
  });

  it("8. Participant claims tokens with secret (anonymous claim)", async () => {
    const claimTokenATA = await anchor.utils.token.associatedAddress({
      mint,
      owner: claimWallet.publicKey,
    });

    const tx = await program.methods
      .claimTokens(Array.from(secret) as any)
      .accounts({
        claimer: burnerWallet.publicKey,
        presale: presalePDA,
        commitment: commitmentPDA,
        claimWallet: claimWallet.publicKey,
        mint,
        tokenVault: tokenVaultPDA,
        vaultAuthority: vaultAuthorityPDA,
        claimTokenAccount: claimTokenATA,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([burnerWallet])
      .rpc();

    console.log("  tx:", tx);

    const commitment = await program.account.commitment.fetch(commitmentPDA);
    expect(commitment.isClaimed).to.equal(true);

    const tokenAccount = await getAccount(connection, claimTokenATA);
    const tokensReceived = Number(tokenAccount.amount);
    // 0.5 SOL / 2 SOL = 25% of 1B = 250M
    expect(tokensReceived).to.equal(250_000_000);

    console.log("  Tokens claimed: " + tokensReceived);
    console.log("  Burner (depositor):", burnerWallet.publicKey.toBase58());
    console.log("  Claim wallet (receiver):", claimWallet.publicKey.toBase58());
    console.log("  These wallets are UNLINKABLE on-chain!");
  });

  it("9. Cannot double-claim", async () => {
    const claimTokenATA = await anchor.utils.token.associatedAddress({
      mint,
      owner: claimWallet.publicKey,
    });

    try {
      await program.methods
        .claimTokens(Array.from(secret) as any)
        .accounts({
          claimer: burnerWallet.publicKey,
          presale: presalePDA,
          commitment: commitmentPDA,
          claimWallet: claimWallet.publicKey,
          mint,
          tokenVault: tokenVaultPDA,
          vaultAuthority: vaultAuthorityPDA,
          claimTokenAccount: claimTokenATA,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([burnerWallet])
        .rpc();
      expect.fail("Should have thrown AlreadyClaimed");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.contain("AlreadyClaimed");
      console.log("  Correctly rejected: already claimed.");
    }
  });

  it("10. Wrong secret fails verification", async () => {
    // Use participant 2's commitment but with a wrong secret
    const wrongSecret = crypto.randomBytes(32);
    const claim2ATA = await anchor.utils.token.associatedAddress({
      mint,
      owner: claimWallet2.publicKey,
    });

    try {
      await program.methods
        .claimTokens(Array.from(wrongSecret) as any)
        .accounts({
          claimer: burner2.publicKey,
          presale: presalePDA,
          commitment: commitPDA2,
          claimWallet: claimWallet2.publicKey,
          mint,
          tokenVault: tokenVaultPDA,
          vaultAuthority: vaultAuthorityPDA,
          claimTokenAccount: claim2ATA,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([burner2])
        .rpc();
      expect.fail("Should have thrown InvalidProof");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.contain("InvalidProof");
      console.log("  Correctly rejected: wrong secret -> invalid proof.");
    }
  });
});
