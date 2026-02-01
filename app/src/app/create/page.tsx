"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import {
  PublicKey,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { useProgram } from "@/hooks/useProgram";
import {
  getPresalePDA,
} from "@/lib/program";
import { ArrowLeft, Loader2, CheckCircle, Rocket, Pencil } from "lucide-react";
import Link from "next/link";
import {
  getAssociatedTokenAddress,
} from "@solana/spl-token";

type Step = "token" | "presale" | "done";
type TokenMode = "anoncoin" | "manual";

export default function CreatePage() {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const router = useRouter();
  const program = useProgram();

  const [step, setStep] = useState<Step>("token");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tokenMode, setTokenMode] = useState<TokenMode>("anoncoin");

  // Token fields
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenDescription, setTokenDescription] = useState("");
  const [tokenImageUrl, setTokenImageUrl] = useState("");

  // Manual mint input
  const [manualMint, setManualMint] = useState("");

  // Created token info
  const [mintAddress, setMintAddress] = useState("");

  // Presale fields
  const [hardCap, setHardCap] = useState("2");
  const [tokensForSale, setTokensForSale] = useState("1000000000");
  const [durationHours, setDurationHours] = useState("1");
  const [durationMinutes, setDurationMinutes] = useState("0");

  // Result
  const [presaleId, setPresaleId] = useState("");

  // Fix: use useEffect for redirect instead of during render
  useEffect(() => {
    if (!connected) {
      router.push("/");
    }
  }, [connected, router]);

  if (!connected) return null;

  async function createToken() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/create-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tokenName,
          symbol: tokenSymbol,
          description: tokenDescription,
          imageUrl: tokenImageUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Broadcast the signed transaction to MAINNET (Anoncoin API creates tokens on mainnet)
      if (data.signedTransaction) {
        const mainnetConn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
        const txBytes = bs58.decode(data.signedTransaction);
        const sig = await mainnetConn.sendRawTransaction(txBytes, {
          skipPreflight: true,
        });
        // Use blockhash info from API response for reliable confirmation
        if (data.blockhash && data.lastValidBlockHeight) {
          await mainnetConn.confirmTransaction({
            signature: sig,
            blockhash: data.blockhash,
            lastValidBlockHeight: Number(data.lastValidBlockHeight),
          }, "confirmed");
        } else {
          await mainnetConn.confirmTransaction(sig, "confirmed");
        }
      }

      if (data.mintAddress) {
        setMintAddress(data.mintAddress);
      } else if (data.mint) {
        setMintAddress(data.mint);
      }

      setStep("presale");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setLoading(false);
    }
  }

  function useManualMint() {
    setError("");
    try {
      new PublicKey(manualMint); // validate
      setMintAddress(manualMint);
      setStep("presale");
    } catch {
      setError("Invalid mint address");
    }
  }

  async function initializePresale() {
    if (!program || !publicKey || !mintAddress) return;
    setLoading(true);
    setError("");

    try {
      const mint = new PublicKey(mintAddress);
      const [presalePDA] = getPresalePDA(mint, publicKey);
      const creatorAta = await getAssociatedTokenAddress(mint, publicKey);

      const hardCapLamports = new BN(
        Math.floor(parseFloat(hardCap) * LAMPORTS_PER_SOL)
      );
      // tokensForSale is the raw amount (already includes decimals)
      const tokensAmount = new BN(tokensForSale);

      // Program expects absolute timestamps (start_time, end_time), not duration
      const now = Math.floor(Date.now() / 1000);
      const startTime = new BN(now);
      const totalSeconds = Math.floor(parseFloat(durationHours) * 3600) + Math.floor(parseFloat(durationMinutes) * 60);
      const endTime = new BN(now + totalSeconds);

      // Anchor 0.30+ auto-resolves PDAs and known programs from the IDL.
      // We only need to pass accounts it can't derive: mint and creatorTokenAccount.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (program.methods as any)
        .initializePresale(hardCapLamports, tokensAmount, startTime, endTime)
        .accounts({
          creator: publicKey,
          mint,
          creatorTokenAccount: creatorAta,
        })
        .rpc();

      await connection.confirmTransaction(tx, "confirmed");

      // Store metadata
      await fetch("/api/presales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: presalePDA.toBase58(),
          name: tokenName || "Manual Token",
          symbol: tokenSymbol || "TOKEN",
          description: tokenDescription,
          mint: mintAddress,
          creator: publicKey.toBase58(),
          imageUrl: tokenImageUrl,
        }),
      });

      setPresaleId(presalePDA.toBase58());
      setStep("done");
    } catch (err: unknown) {
      console.error("initializePresale error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to initialize presale"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pt-28 px-4 md:px-8 pb-20 max-w-2xl mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-black transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-2">
        Create Presale
      </h1>
      <p className="text-neutral-500 text-lg mb-10">
        Launch a token via Anoncoin or use an existing mint, then set up an
        anonymous presale
      </p>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-10">
        {(["token", "presale", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s
                  ? "bg-neutral-900 text-white"
                  : i <
                    (["token", "presale", "done"] as Step[]).indexOf(step)
                  ? "bg-indigo-100 text-indigo-600"
                  : "bg-neutral-100 text-neutral-400"
              }`}
            >
              {i <
              (["token", "presale", "done"] as Step[]).indexOf(step) ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 2 && (
              <div
                className={`w-12 h-px ${
                  i <
                  (["token", "presale", "done"] as Step[]).indexOf(step)
                    ? "bg-indigo-300"
                    : "bg-neutral-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Create Token */}
      {step === "token" && (
        <div className="space-y-6">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setTokenMode("anoncoin")}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
                tokenMode === "anoncoin"
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              }`}
            >
              <Rocket className="w-4 h-4 inline mr-2" />
              Create via Anoncoin
            </button>
            <button
              onClick={() => setTokenMode("manual")}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
                tokenMode === "manual"
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              }`}
            >
              <Pencil className="w-4 h-4 inline mr-2" />
              Use Existing Mint
            </button>
          </div>

          {tokenMode === "anoncoin" ? (
            <>
              <div className="bg-white border border-neutral-200 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-6">Token Details</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Token Name *
                    </label>
                    <input
                      type="text"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      placeholder="e.g. AnonCat"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Symbol *
                    </label>
                    <input
                      type="text"
                      value={tokenSymbol}
                      onChange={(e) =>
                        setTokenSymbol(e.target.value.toUpperCase())
                      }
                      placeholder="e.g. ACAT"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={tokenDescription}
                      onChange={(e) => setTokenDescription(e.target.value)}
                      placeholder="A brief description of your token"
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Image URL
                    </label>
                    <input
                      type="url"
                      value={tokenImageUrl}
                      onChange={(e) => setTokenImageUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={createToken}
                disabled={loading || !tokenName || !tokenSymbol}
                className="w-full py-3.5 bg-neutral-900 text-white text-sm font-bold rounded-full hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )}
                {loading ? "Creating Token..." : "Create Token via Anoncoin"}
              </button>
            </>
          ) : (
            <>
              <div className="bg-white border border-neutral-200 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-2">
                  Existing Token Mint
                </h2>
                <p className="text-sm text-neutral-500 mb-6">
                  Paste the mint address of a token you already own. You must
                  hold the tokens in your connected wallet.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Mint Address *
                    </label>
                    <input
                      type="text"
                      value={manualMint}
                      onChange={(e) => setManualMint(e.target.value.trim())}
                      placeholder="e.g. So11111111111111111111111111111111111111112"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Token Name (for display)
                    </label>
                    <input
                      type="text"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      placeholder="e.g. My Token"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                      Symbol (for display)
                    </label>
                    <input
                      type="text"
                      value={tokenSymbol}
                      onChange={(e) =>
                        setTokenSymbol(e.target.value.toUpperCase())
                      }
                      placeholder="e.g. MTK"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={useManualMint}
                disabled={!manualMint}
                className="w-full py-3.5 bg-neutral-900 text-white text-sm font-bold rounded-full hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Use This Mint
              </button>
            </>
          )}
        </div>
      )}

      {/* Step 2: Initialize Presale */}
      {step === "presale" && (
        <div className="space-y-6">
          {mintAddress && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-emerald-800 mb-1">
                {tokenMode === "anoncoin"
                  ? "Token created successfully!"
                  : "Using existing mint"}
              </p>
              <p className="text-emerald-600 font-mono text-xs break-all">
                Mint: {mintAddress}
              </p>
            </div>
          )}

          <div className="bg-white border border-neutral-200 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-6">Presale Parameters</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Hard Cap (SOL)
                </label>
                <input
                  type="number"
                  value={hardCap}
                  onChange={(e) => setHardCap(e.target.value)}
                  step="0.1"
                  min="0.1"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                />
                <p className="text-xs text-neutral-400 mt-1">
                  Maximum SOL that can be raised
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Tokens for Sale
                </label>
                <input
                  type="number"
                  value={tokensForSale}
                  onChange={(e) => setTokensForSale(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                />
                <p className="text-xs text-neutral-400 mt-1">
                  Raw token amount including decimals (e.g. 1000000000 = 1000
                  tokens with 6 decimals)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Duration
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={durationHours}
                      onChange={(e) => setDurationHours(e.target.value)}
                      step="1"
                      min="0"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                    />
                    <p className="text-xs text-neutral-400 mt-1">Hours</p>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      step="1"
                      min="0"
                      max="59"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                    />
                    <p className="text-xs text-neutral-400 mt-1">Minutes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={initializePresale}
            disabled={loading}
            className="w-full py-3.5 bg-neutral-900 text-white text-sm font-bold rounded-full hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4" />
            )}
            {loading
              ? "Initializing Presale..."
              : "Initialize Anonymous Presale"}
          </button>
        </div>
      )}

      {/* Step 3: Done */}
      {step === "done" && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Presale Created!</h2>
          <p className="text-neutral-500 mb-2">
            Your anonymous presale is live on Solana Devnet
          </p>
          <p className="text-xs text-neutral-400 font-mono break-all mb-8 max-w-md mx-auto">
            {presaleId}
          </p>
          <div className="flex flex-col md:flex-row gap-3 justify-center">
            <Link
              href={`/presale/${presaleId}`}
              className="px-6 py-3 bg-neutral-900 text-white text-sm font-semibold rounded-full hover:bg-neutral-700 transition-all"
            >
              View Presale
            </Link>
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-neutral-100 text-neutral-700 text-sm font-semibold rounded-full hover:bg-neutral-200 transition-all"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
