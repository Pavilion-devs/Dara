"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { ArrowDown, Shield, Copy, Check, AlertTriangle, Loader2, Wallet } from "lucide-react";
import { saveStealthWallet, StealthWallet } from "@/lib/stealth";
import { SOL_MINT, RELAYER_ADDRESS } from "@/lib/constants";

type SwapStep = "idle" | "quoting" | "depositing" | "swapping" | "transferring" | "done" | "error";

interface RiskAnalysis {
  riskScore: number;
  riskLevel: string;
  summary: string;
  flags: string[];
}

export default function SwapPage() {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [outputMint, setOutputMint] = useState("");
  const [solAmount, setSolAmount] = useState("");
  const [slippage, setSlippage] = useState("300");
  const [quote, setQuote] = useState<{ outAmount: string; priceImpactPct?: string } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [step, setStep] = useState<SwapStep>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    stealthPublicKey: string;
    stealthSecretKey: string;
    swapSignature: string;
    transferSignature: string;
    outputAmount: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Risk analysis state
  const [risk, setRisk] = useState<RiskAnalysis | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  // Debounced quote fetch
  useEffect(() => {
    if (!outputMint || !solAmount || isNaN(Number(solAmount)) || Number(solAmount) <= 0) {
      setQuote(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const lamports = Math.floor(Number(solAmount) * LAMPORTS_PER_SOL);
        const res = await fetch("/api/swap/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputMint: SOL_MINT,
            outputMint,
            amount: lamports,
            slippageBps: Number(slippage),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setQuote(data);
        } else {
          setQuote(null);
        }
      } catch {
        setQuote(null);
      }
      setQuoteLoading(false);
    }, 800);

    return () => clearTimeout(timeout);
  }, [outputMint, solAmount, slippage]);

  // Auto-fetch risk analysis when token mint changes
  useEffect(() => {
    if (!outputMint || outputMint.length < 32) {
      setRisk(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setRiskLoading(true);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mintAddress: outputMint }),
        });
        if (res.ok) {
          setRisk(await res.json());
        }
      } catch {
        // ignore
      }
      setRiskLoading(false);
    }, 500);

    return () => clearTimeout(timeout);
  }, [outputMint]);

  const handleSwap = useCallback(async () => {
    if (!publicKey || !connected || !outputMint || !solAmount) return;

    setError("");
    setResult(null);
    setSaved(false);

    try {
      // Step 1: Deposit SOL to relayer
      setStep("depositing");
      const lamports = Math.floor(Number(solAmount) * LAMPORTS_PER_SOL);
      const relayerPubkey = new PublicKey(RELAYER_ADDRESS);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: relayerPubkey,
          lamports,
        })
      );
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const depositSig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(depositSig, "confirmed");

      // Step 2: Execute swap via relayer
      setStep("swapping");
      const res = await fetch("/api/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMint: SOL_MINT,
          outputMint,
          amount: lamports,
          slippageBps: Number(slippage),
          depositTxSignature: depositSig,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Swap failed");

      setStep("done");
      setResult(data);
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Swap failed");
    }
  }, [publicKey, connected, outputMint, solAmount, slippage, sendTransaction, connection]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSaveWallet = () => {
    if (!result) return;
    const wallet: StealthWallet = {
      id: Math.random().toString(36).substring(2, 10) + Date.now().toString(36),
      label: `Swap ${outputMint.slice(0, 6)}...`,
      publicKey: result.stealthPublicKey,
      secretKey: result.stealthSecretKey,
      createdAt: Date.now(),
      source: "swap",
      sourceToken: outputMint,
      sourceTxSig: result.swapSignature,
    };
    saveStealthWallet(wallet);
    setSaved(true);
  };

  const riskColor = risk
    ? risk.riskScore >= 70 ? "text-red-500" : risk.riskScore >= 40 ? "text-amber-500" : "text-emerald-500"
    : "";
  const riskBg = risk
    ? risk.riskScore >= 70 ? "bg-red-50 border-red-200" : risk.riskScore >= 40 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
    : "";

  const steps: { key: SwapStep; label: string }[] = [
    { key: "depositing", label: "Deposit SOL" },
    { key: "swapping", label: "Swapping via Relayer" },
    { key: "transferring", label: "Transfer to Stealth" },
    { key: "done", label: "Complete" },
  ];

  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <main className="pt-28 px-4 md:px-8 pb-20 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="w-6 h-6 text-indigo-500" />
        <h1 className="text-3xl font-semibold tracking-tight">Anonymous Swap</h1>
      </div>
      <p className="text-neutral-500 mb-8">
        Swap tokens via relayer — your wallet never appears in the swap transaction.
      </p>

      {!connected ? (
        <div className="bg-neutral-50 rounded-2xl p-12 text-center border border-neutral-200">
          <Wallet className="w-10 h-10 text-neutral-400 mx-auto mb-4" />
          <p className="text-neutral-600 font-medium">Connect your wallet to start swapping</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Token input */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
                Token Mint Address
              </label>
              <input
                type="text"
                value={outputMint}
                onChange={(e) => setOutputMint(e.target.value.trim())}
                placeholder="Enter token mint address..."
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
              />
            </div>

            <div className="flex items-center justify-center">
              <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center">
                <ArrowDown className="w-4 h-4 text-neutral-500" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
                SOL Amount
              </label>
              <input
                type="number"
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                placeholder="0.00"
                step="0.001"
                min="0"
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
                Slippage (bps)
              </label>
              <input
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
              />
            </div>

            {/* Quote display */}
            {quoteLoading && (
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Fetching quote...
              </div>
            )}
            {quote && !quoteLoading && (
              <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">You receive (est.)</span>
                  <span className="font-mono font-semibold">{quote.outAmount} tokens</span>
                </div>
                {quote.priceImpactPct && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-neutral-500">Price impact</span>
                    <span className="font-mono">{Number(quote.priceImpactPct).toFixed(2)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Risk Analysis */}
          {riskLoading && (
            <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              <span className="text-sm text-neutral-500">Analyzing token risk...</span>
            </div>
          )}
          {risk && !riskLoading && (
            <div className={`rounded-2xl p-6 border ${riskBg}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-5 h-5 ${riskColor}`} />
                  <span className="text-sm font-semibold">AI Risk Analysis</span>
                </div>
                <span className={`text-2xl font-bold ${riskColor}`}>
                  {risk.riskScore}/100
                </span>
              </div>
              <p className="text-sm text-neutral-700 mb-3">{risk.summary}</p>
              {risk.flags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {risk.flags.map((flag, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-1 bg-white/80 border rounded-full text-neutral-600"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Progress stepper */}
          {step !== "idle" && step !== "error" && (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                {steps.map((s, i) => (
                  <div key={s.key} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        i <= stepIndex
                          ? "bg-indigo-500 text-white"
                          : "bg-neutral-100 text-neutral-400"
                      }`}
                    >
                      {i < stepIndex ? (
                        <Check className="w-4 h-4" />
                      ) : i === stepIndex && step !== "done" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className={`w-12 md:w-20 h-0.5 mx-1 ${
                          i < stepIndex ? "bg-indigo-500" : "bg-neutral-200"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2">
                {steps.map((s) => (
                  <span key={s.key} className="text-[10px] text-neutral-500 text-center max-w-[70px]">
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Swap button */}
          {step === "idle" || step === "error" ? (
            <button
              onClick={handleSwap}
              disabled={!outputMint || !solAmount || !quote || (risk?.riskScore ?? 0) >= 90}
              className="w-full py-4 bg-neutral-900 text-white font-semibold rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {(risk?.riskScore ?? 0) >= 90
                ? "Token Risk Too High"
                : "Swap Anonymously"}
            </button>
          ) : null}

          {/* Result */}
          {result && step === "done" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <Check className="w-5 h-5" />
                Swap Complete
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-neutral-500 mb-1">Stealth Public Key</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-white px-3 py-2 rounded-lg border flex-1 truncate">
                      {result.stealthPublicKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(result.stealthPublicKey, "pub")}
                      className="p-2 hover:bg-white rounded-lg"
                    >
                      {copied === "pub" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-neutral-500 mb-1">Stealth Private Key (import to Phantom)</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-white px-3 py-2 rounded-lg border flex-1 truncate">
                      {result.stealthSecretKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(result.stealthSecretKey, "sec")}
                      className="p-2 hover:bg-white rounded-lg"
                    >
                      {copied === "sec" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-neutral-500 mb-1">Tokens Received</p>
                  <p className="font-mono font-semibold">{result.outputAmount}</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveWallet}
                    disabled={saved}
                    className="flex-1 py-3 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-600 transition-colors disabled:opacity-60"
                  >
                    {saved ? "Saved to Wallet Manager" : "Save to Wallet Manager"}
                  </button>
                  <a
                    href={`https://solscan.io/tx/${result.swapSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-3 border border-neutral-200 text-sm font-semibold rounded-xl hover:bg-neutral-50 transition-colors"
                  >
                    View on Solscan
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
