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
  amount: bigint
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

  instructions.push(
    createTransferInstruction(
      relayerAta,
      stealthAta,
      relayerKeypair.publicKey,
      amount,
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
  return sendAndConfirmTx(connection, tx, [relayerKeypair]);
}
