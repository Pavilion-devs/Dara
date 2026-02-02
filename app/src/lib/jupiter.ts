import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { JUPITER_QUOTE_URL, JUPITER_SWAP_URL } from "./constants";
import { sendAndConfirmTx } from "./relayer";

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: unknown[];
  [key: string]: unknown;
}

export async function getQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps = 300
): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountLamports.toString(),
    slippageBps: slippageBps.toString(),
  });

  const res = await fetch(`${JUPITER_QUOTE_URL}?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter quote failed: ${text}`);
  }
  return res.json();
}

export async function getSwapTransaction(
  quoteResponse: JupiterQuote,
  userPublicKey: string
): Promise<string> {
  const res = await fetch(JUPITER_SWAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter swap failed: ${text}`);
  }

  const data = await res.json();
  return data.swapTransaction;
}

export async function executeRelayerSwap(
  connection: Connection,
  relayerKeypair: Keypair,
  quoteResponse: JupiterQuote
): Promise<{ signature: string; outputAmount: string }> {
  const swapTxBase64 = await getSwapTransaction(
    quoteResponse,
    relayerKeypair.publicKey.toBase58()
  );

  const txBuf = Buffer.from(swapTxBase64, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([relayerKeypair]);

  const signature = await sendAndConfirmTx(connection, tx);
  return { signature, outputAmount: quoteResponse.outAmount };
}

export async function transferTokensToStealth(
  connection: Connection,
  relayerKeypair: Keypair,
  tokenMint: PublicKey,
  stealthPubkey: PublicKey,
  amount: bigint,
  maxRetries = 8
): Promise<string> {
  const relayerAta = getAssociatedTokenAddressSync(
    tokenMint,
    relayerKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const stealthAta = getAssociatedTokenAddressSync(
    tokenMint,
    stealthPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const instructions: TransactionInstruction[] = [];

      // Create stealth ATA if it doesn't exist
      try {
        await getAccount(connection, stealthAta);
      } catch {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            relayerKeypair.publicKey,
            stealthAta,
            stealthPubkey,
            tokenMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // Check relayer balance and use available amount
      let transferAmount = amount;
      try {
        const balanceInfo = await connection.getTokenAccountBalance(relayerAta);
        const available = BigInt(balanceInfo.value.amount);
        if (available <= BigInt(0)) {
          // Tokens may still be settling, wait and retry
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        transferAmount = available < amount ? available : amount;
      } catch {
        // ATA might not exist yet, wait for swap to settle
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      instructions.push(
        createTransferInstruction(
          relayerAta,
          stealthAta,
          relayerKeypair.publicKey,
          transferAmount,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const messageV0 = new TransactionMessage({
        payerKey: relayerKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      return await sendAndConfirmTx(connection, tx, [relayerKeypair]);
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw new Error(`Transfer failed after ${maxRetries} attempts`);
}
