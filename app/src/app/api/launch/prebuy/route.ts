import { NextRequest, NextResponse } from "next/server";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { getRelayerKeypair, getMainnetConnection, sendAndConfirmTx } from "@/lib/relayer";
import { getQuote, executeRelayerSwap, transferTokensToStealth } from "@/lib/jupiter";
import { SOL_MINT } from "@/lib/constants";

export const maxDuration = 60;

const ANON_API_URL = "https://api.dubdub.tv/thirdParty/v1/createToken";
const ANON_API_KEY = process.env.ANON_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const {
      name,
      symbol,
      description,
      imageUrl,
      twitter,
      telegram,
      totalSolLamports,
      numWallets,
      depositTxSignature,
    } = await req.json();

    if (!name || !symbol || !totalSolLamports || !numWallets || !depositTxSignature) {
      return NextResponse.json(
        { error: "name, symbol, totalSolLamports, numWallets, and depositTxSignature are required" },
        { status: 400 }
      );
    }

    if (!ANON_API_KEY) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const connection = getMainnetConnection();
    const relayer = getRelayerKeypair();

    // 1. Verify deposit tx
    const txInfo = await connection.getTransaction(depositTxSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!txInfo) {
      return NextResponse.json({ error: "Deposit transaction not found" }, { status: 400 });
    }

    // 2. Create token via Anoncoin API
    const formData = new FormData();
    formData.append("tickerName", name);
    formData.append("tickerSymbol", symbol);
    formData.append("description", description || "");
    formData.append("twitterLink", twitter || "https://x.com");
    formData.append("telegramLink", telegram || "https://t.me");

    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        const blob = await imgRes.blob();
        formData.append("files", blob, "token-image.png");
      } catch {
        // continue without image
      }
    }

    const apiRes = await fetch(ANON_API_URL, {
      method: "POST",
      headers: { "x-api-key": ANON_API_KEY },
      body: formData,
    });

    const apiData = await apiRes.json();
    if (!apiRes.ok) {
      return NextResponse.json(
        { error: apiData.message || "Token creation failed" },
        { status: apiRes.status }
      );
    }

    const tokenData = apiData.data || apiData;
    const { mintAddress, signedTransaction } = tokenData;

    // 3. Broadcast the signed token creation tx
    const txBuf = Buffer.from(signedTransaction, "base64");
    const deployTx = VersionedTransaction.deserialize(txBuf);
    const deployTxSig = await sendAndConfirmTx(connection, deployTx);

    // 4. Wait for Jupiter indexing
    await new Promise((r) => setTimeout(r, 3000));

    // 5. Pre-buy into stealth wallets
    const walletCount = Math.min(Math.max(1, numWallets), 5);
    const perWalletLamports = Math.floor(Number(totalSolLamports) / walletCount);
    const wallets: {
      publicKey: string;
      secretKey: string;
      tokenAmount: string;
      txSig: string;
    }[] = [];

    for (let i = 0; i < walletCount; i++) {
      try {
        // Get quote
        const quote = await getQuote(SOL_MINT, mintAddress, perWalletLamports, 500);

        // Execute swap via relayer
        const { signature, outputAmount } = await executeRelayerSwap(connection, relayer, quote);

        // Generate stealth wallet
        const stealth = Keypair.generate();

        // Transfer tokens to stealth
        await transferTokensToStealth(
          connection,
          relayer,
          new PublicKey(mintAddress),
          stealth.publicKey,
          BigInt(outputAmount)
        );

        wallets.push({
          publicKey: stealth.publicKey.toBase58(),
          secretKey: bs58.encode(stealth.secretKey),
          tokenAmount: outputAmount,
          txSig: signature,
        });
      } catch (err) {
        console.error(`Pre-buy wallet ${i + 1} failed:`, err);
        // Continue with remaining wallets
      }
    }

    return NextResponse.json({
      mintAddress,
      deployTxSig,
      wallets,
    });
  } catch (error) {
    console.error("launch/prebuy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Launch failed" },
      { status: 500 }
    );
  }
}
