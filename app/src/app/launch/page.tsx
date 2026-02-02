"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Rocket, Check, Copy, Loader2, Wallet, ArrowRight, ArrowLeft } from "lucide-react";
import { saveStealthWallet } from "@/lib/stealth";
import { RELAYER_ADDRESS } from "@/lib/constants";

type WizardStep = 1 | 2 | 3;

interface LaunchResult {
  mintAddress: string;
  deployTxSig: string;
  wallets: {
    publicKey: string;
    secretKey: string;
    tokenAmount: string;
    txSig: string;
  }[];
}

export default function LaunchPage() {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [wizardStep, setWizardStep] = useState<WizardStep>(1);

  // Step 1: Token details
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");

  // Step 2: Pre-buy config
  const [totalSol, setTotalSol] = useState("0.01");
  const [numWallets, setNumWallets] = useState(2);

  // Step 3: Execution
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedWallets, setSavedWallets] = useState(false);

  const perWalletSol = numWallets > 0 ? (Number(totalSol) / numWallets).toFixed(4) : "0";

  const handleExecute = useCallback(async () => {
    if (!publicKey || !connected) return;

    setError("");
    setExecuting(true);

    try {
      // Deposit SOL to relayer
      setProgress("Depositing SOL to relayer...");
      const lamports = Math.floor(Number(totalSol) * LAMPORTS_PER_SOL);
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

      // Call launch API
      setProgress("Creating token & executing pre-buys...");
      const res = await fetch("/api/launch/prebuy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          symbol,
          description,
          imageUrl,
          twitter,
          telegram,
          totalSolLamports: lamports,
          numWallets,
          depositTxSignature: depositSig,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Launch failed");

      setResult(data);
      setProgress("");
      setWizardStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
      setProgress("");
    }
    setExecuting(false);
  }, [publicKey, connected, totalSol, name, symbol, description, imageUrl, twitter, telegram, numWallets, sendTransaction, connection]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSaveAllWallets = () => {
    if (!result) return;
    result.wallets.forEach((w, i) => {
      saveStealthWallet({
        id: Math.random().toString(36).substring(2, 10) + Date.now().toString(36),
        label: `${symbol} Pre-Buy #${i + 1}`,
        publicKey: w.publicKey,
        secretKey: w.secretKey,
        createdAt: Date.now(),
        source: "prebuy",
        sourceToken: result.mintAddress,
        sourceTxSig: w.txSig,
      });
    });
    setSavedWallets(true);
  };

  if (!connected) {
    return (
      <main className="pt-28 px-4 md:px-8 pb-20 max-w-2xl mx-auto">
        <div className="bg-neutral-50 rounded-2xl p-12 text-center border border-neutral-200">
          <Wallet className="w-10 h-10 text-neutral-400 mx-auto mb-4" />
          <p className="text-neutral-600 font-medium">Connect your wallet to launch a token</p>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-28 px-4 md:px-8 pb-20 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Rocket className="w-6 h-6 text-indigo-500" />
        <h1 className="text-3xl font-semibold tracking-tight">Stealth Token Launch</h1>
      </div>
      <p className="text-neutral-500 mb-8">
        Create a token via Anoncoin + immediately pre-buy into stealth wallets.
      </p>

      {/* Wizard steps indicator */}
      <div className="flex items-center gap-4 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                wizardStep >= s
                  ? "bg-indigo-500 text-white"
                  : "bg-neutral-100 text-neutral-400"
              }`}
            >
              {wizardStep > s ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 3 && (
              <div
                className={`w-16 h-0.5 ml-2 ${
                  wizardStep > s ? "bg-indigo-500" : "bg-neutral-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Token Details */}
      {wizardStep === 1 && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Token Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Token"
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">Symbol *</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="TKN"
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your token..."
              rows={3}
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">Image URL</label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">Twitter</label>
              <input
                type="text"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                placeholder="https://x.com/..."
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">Telegram</label>
              <input
                type="text"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="https://t.me/..."
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <button
            onClick={() => setWizardStep(2)}
            disabled={!name || !symbol}
            className="w-full py-3.5 bg-neutral-900 text-white font-semibold rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            Next: Pre-Buy Config <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 2: Pre-Buy Config */}
      {wizardStep === 2 && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Pre-Buy Configuration</h2>

          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
              Total SOL for Pre-Buy
            </label>
            <input
              type="number"
              value={totalSol}
              onChange={(e) => setTotalSol(e.target.value)}
              step="0.001"
              min="0.001"
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
              Number of Stealth Wallets ({numWallets})
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={numWallets}
              onChange={(e) => setNumWallets(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-neutral-400 mt-1">
              <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            </div>
          </div>

          <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-neutral-500">SOL per wallet</span>
              <span className="font-mono font-semibold">{perWalletSol} SOL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Total wallets</span>
              <span className="font-mono font-semibold">{numWallets}</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setWizardStep(1)}
              className="px-6 py-3.5 border border-neutral-200 font-semibold rounded-xl hover:bg-neutral-50 transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleExecute}
              disabled={executing || !totalSol}
              className="flex-1 py-3.5 bg-neutral-900 text-white font-semibold rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {executing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {progress || "Processing..."}
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" /> Launch & Pre-Buy
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {wizardStep === 3 && result && (
        <div className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-4">
              <Check className="w-5 h-5" />
              Token Launched Successfully
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-neutral-500 mb-1">Mint Address</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white px-3 py-2 rounded-lg border flex-1 truncate">
                    {result.mintAddress}
                  </code>
                  <button
                    onClick={() => copyToClipboard(result.mintAddress, "mint")}
                    className="p-2 hover:bg-white rounded-lg"
                  >
                    {copied === "mint" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <a
                href={`https://solscan.io/tx/${result.deployTxSig}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:underline"
              >
                View deploy tx on Solscan
              </a>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-2xl p-6">
            <h3 className="font-semibold mb-4">
              Pre-Buy Stealth Wallets ({result.wallets.length})
            </h3>

            <div className="space-y-4">
              {result.wallets.map((w, i) => (
                <div key={i} className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold">Wallet #{i + 1}</span>
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      {w.tokenAmount} tokens
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-neutral-400 mb-0.5">Public Key</p>
                      <div className="flex items-center gap-1">
                        <code className="text-xs truncate flex-1">{w.publicKey}</code>
                        <button onClick={() => copyToClipboard(w.publicKey, `pub-${i}`)} className="p-1 hover:bg-white rounded">
                          {copied === `pub-${i}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-400 mb-0.5">Private Key</p>
                      <div className="flex items-center gap-1">
                        <code className="text-xs truncate flex-1">{w.secretKey}</code>
                        <button onClick={() => copyToClipboard(w.secretKey, `sec-${i}`)} className="p-1 hover:bg-white rounded">
                          {copied === `sec-${i}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleSaveAllWallets}
              disabled={savedWallets}
              className="w-full mt-4 py-3 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-600 transition-colors disabled:opacity-60"
            >
              {savedWallets ? "All Wallets Saved" : "Save All to Wallet Manager"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
