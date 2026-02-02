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

    // Anoncoin requires an image - use provided URL or a default placeholder
    const imgSource = imageUrl || "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
    try {
      const imgRes = await fetch(imgSource);
      const blob = await imgRes.blob();
      formData.append("files", blob, "token-image.png");
    } catch {
      // If image fetch fails, create a minimal placeholder
      const placeholder = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
      formData.append("files", new Blob([placeholder], { type: "image/png" }), "token-image.png");
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
    // Try base58 first, fall back to base64 if it fails
    let deployTx: VersionedTransaction;
    try {
      const txBuf = bs58.decode(signedTransaction);
      deployTx = VersionedTransaction.deserialize(txBuf);
    } catch {
      // Fallback to base64 encoding
      const txBuf = Buffer.from(signedTransaction, "base64");
      deployTx = VersionedTransaction.deserialize(txBuf);
    }
    const deployTxSig = await sendAndConfirmTx(connection, deployTx);

    // 4. Wait for Jupiter indexing (new tokens need time to be indexed)
    // Note: Jupiter may not index new tokens immediately - pre-buys might fail
    await new Promise((r) => setTimeout(r, 5000));

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
        console.log(`Pre-buy ${i + 1}/${walletCount}: Getting quote...`);
        
        // Get quote
        const quote = await getQuote(SOL_MINT, mintAddress, perWalletLamports, 500);

        console.log(`Pre-buy ${i + 1}/${walletCount}: Executing swap...`);
        
        // Execute swap via relayer
        const { signature, outputAmount } = await executeRelayerSwap(connection, relayer, quote);

        // Generate stealth wallet
        const stealth = Keypair.generate();

        console.log(`Pre-buy ${i + 1}/${walletCount}: Transferring to stealth...`);
        
        // Transfer tokens to stealth (with built-in retry logic)
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

        console.log(`Pre-buy ${i + 1}/${walletCount}: Success!`);

        // Delay between buys to let blockchain settle
        if (i < walletCount - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
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
