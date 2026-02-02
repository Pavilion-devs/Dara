import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { getRelayerKeypair, getMainnetConnection } from "@/lib/relayer";
import { getQuote, executeRelayerSwap, transferTokensToStealth } from "@/lib/jupiter";
import { SOL_MINT } from "@/lib/constants";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { inputMint, outputMint, amount, slippageBps, depositTxSignature } = await req.json();

    if (!outputMint || !amount || !depositTxSignature) {
      return NextResponse.json(
        { error: "outputMint, amount, and depositTxSignature are required" },
        { status: 400 }
      );
    }

    const connection = getMainnetConnection();
    const relayer = getRelayerKeypair();

    // 1. Verify deposit tx on-chain
    const txInfo = await connection.getTransaction(depositTxSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo) {
      return NextResponse.json(
        { error: "Deposit transaction not found. Please wait and retry." },
        { status: 400 }
      );
    }

    // 2. Get Jupiter quote
    const effectiveInputMint = inputMint || SOL_MINT;
    const quote = await getQuote(effectiveInputMint, outputMint, Number(amount), slippageBps || 300);

    // 3. Execute swap via relayer (user wallet NOT in this tx)
    const { signature: swapSignature, outputAmount } = await executeRelayerSwap(
      connection,
      relayer,
      quote
    );

    // 4. Generate stealth keypair
    const stealthKeypair = Keypair.generate();

    // 5. Transfer swapped tokens to stealth ATA
    const transferSignature = await transferTokensToStealth(
      connection,
      relayer,
      new PublicKey(outputMint),
      stealthKeypair.publicKey,
      BigInt(outputAmount)
    );

    return NextResponse.json({
      stealthPublicKey: stealthKeypair.publicKey.toBase58(),
      stealthSecretKey: bs58.encode(stealthKeypair.secretKey),
      swapSignature,
      transferSignature,
      outputAmount,
    });
  } catch (error) {
    console.error("swap execute error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Swap execution failed" },
      { status: 500 }
    );
  }
}
