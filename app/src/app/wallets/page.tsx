"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Wallet,
  Copy,
  Check,
  Trash2,
  Download,
  Send,
  RefreshCw,
  Plus,
  Eye,
  EyeOff,
  Loader2,
  Key,
} from "lucide-react";
import {
  getAllStealthWallets,
  removeStealthWallet,
  importStealthWallet,
  getKeypairFromStealth,
  StealthWallet,
} from "@/lib/stealth";

interface WalletBalance {
  sol: number;
  tokens: { mint: string; amount: string; decimals: number }[];
}

export default function WalletsPage() {
  const { connection } = useConnection();

  const [wallets, setWallets] = useState<StealthWallet[]>([]);
  const [balances, setBalances] = useState<Record<string, WalletBalance>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [importLabel, setImportLabel] = useState("");
  const [importError, setImportError] = useState("");

  // Sweep
  const [sweepWalletId, setSweepWalletId] = useState<string | null>(null);
  const [sweepDest, setSweepDest] = useState("");
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState("");

  useEffect(() => {
    setWallets(getAllStealthWallets());
  }, []);

  const fetchBalances = useCallback(async () => {
    if (wallets.length === 0) return;
    setLoadingBalances(true);

    const newBalances: Record<string, WalletBalance> = {};

    for (const w of wallets) {
      try {
        const pubkey = new PublicKey(w.publicKey);
        const sol = await connection.getBalance(pubkey);

        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
          programId: TOKEN_PROGRAM_ID,
        });

        const tokens = tokenAccounts.value.map((ta) => ({
          mint: ta.account.data.parsed.info.mint as string,
          amount: ta.account.data.parsed.info.tokenAmount.uiAmountString as string,
          decimals: ta.account.data.parsed.info.tokenAmount.decimals as number,
        }));

        newBalances[w.id] = { sol: sol / LAMPORTS_PER_SOL, tokens };
      } catch {
        newBalances[w.id] = { sol: 0, tokens: [] };
      }
    }

    setBalances(newBalances);
    setLoadingBalances(false);
  }, [wallets, connection]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleRevealKey = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRemove = (id: string) => {
    removeStealthWallet(id);
    setWallets(getAllStealthWallets());
  };

  const handleImport = () => {
    setImportError("");
    try {
      importStealthWallet(importKey, importLabel || "Imported Wallet");
      setWallets(getAllStealthWallets());
      setImportKey("");
      setImportLabel("");
      setShowImport(false);
    } catch {
      setImportError("Invalid private key");
    }
  };

  const handleSweep = useCallback(async () => {
    if (!sweepWalletId || !sweepDest) return;
    const wallet = wallets.find((w) => w.id === sweepWalletId);
    if (!wallet) return;

    setSweeping(true);
    setSweepResult("");

    try {
      const keypair = getKeypairFromStealth(wallet);
      const destPubkey = new PublicKey(sweepDest);
      const balance = balances[wallet.id];

      // Transfer all tokens first
      if (balance?.tokens.length) {
        for (const token of balance.tokens) {
          try {
            const mint = new PublicKey(token.mint);
            const sourceAta = getAssociatedTokenAddressSync(mint, keypair.publicKey);
            const destAta = getAssociatedTokenAddressSync(mint, destPubkey);

            const instructions = [];

            // Create dest ATA if needed
            try {
              await connection.getAccountInfo(destAta);
            } catch {
              instructions.push(
                // Can't pay from stealth if no SOL — skip in that case
              );
            }

            const rawAmount = BigInt(
              Math.floor(Number(token.amount) * 10 ** token.decimals)
            );

            instructions.push(
              createTransferInstruction(
                sourceAta,
                destAta,
                keypair.publicKey,
                rawAmount
              )
            );

            // Close token account to reclaim rent
            instructions.push(
              createCloseAccountInstruction(
                sourceAta,
                keypair.publicKey,
                keypair.publicKey
              )
            );

            if (instructions.length > 0) {
              const { blockhash } = await connection.getLatestBlockhash("confirmed");
              const msg = new TransactionMessage({
                payerKey: keypair.publicKey,
                recentBlockhash: blockhash,
                instructions,
              }).compileToV0Message();
              const tx = new VersionedTransaction(msg);
              tx.sign([keypair]);
              await connection.sendTransaction(tx);
            }
          } catch (err) {
            console.error(`Failed to sweep token ${token.mint}:`, err);
          }
        }
      }

      // Transfer remaining SOL
      const solBalance = await connection.getBalance(keypair.publicKey);
      if (solBalance > 5000) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: destPubkey,
            lamports: solBalance - 5000, // leave rent for tx fee
          })
        );
        tx.feePayer = keypair.publicKey;
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.sign(keypair);
        await connection.sendRawTransaction(tx.serialize());
      }

      setSweepResult("Sweep complete!");
      setSweepWalletId(null);
      setSweepDest("");
      fetchBalances();
    } catch (err) {
      setSweepResult(`Sweep failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setSweeping(false);
  }, [sweepWalletId, sweepDest, wallets, balances, connection, fetchBalances]);

  const sourceBadgeColor = (source: string) => {
    switch (source) {
      case "swap": return "bg-indigo-100 text-indigo-700";
      case "prebuy": return "bg-emerald-100 text-emerald-700";
      default: return "bg-neutral-100 text-neutral-600";
    }
  };

  return (
    <main className="pt-28 px-4 md:px-8 pb-20 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Key className="w-6 h-6 text-indigo-500" />
            <h1 className="text-3xl font-semibold tracking-tight">Stealth Wallets</h1>
          </div>
          <p className="text-neutral-500">Manage your anonymous wallet positions.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchBalances}
            disabled={loadingBalances}
            className="p-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingBalances ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-4 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-xl hover:bg-neutral-800 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Import
          </button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 mb-6 space-y-4">
          <h3 className="font-semibold">Import Wallet</h3>
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
              Private Key (base58)
            </label>
            <input
              type="password"
              value={importKey}
              onChange={(e) => setImportKey(e.target.value)}
              placeholder="Enter base58 private key..."
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
              Label
            </label>
            <input
              type="text"
              value={importLabel}
              onChange={(e) => setImportLabel(e.target.value)}
              placeholder="My Wallet"
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          {importError && <p className="text-red-600 text-sm">{importError}</p>}
          <button
            onClick={handleImport}
            disabled={!importKey}
            className="px-6 py-3 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-600 transition-colors disabled:opacity-40"
          >
            Import
          </button>
        </div>
      )}

      {/* Sweep panel */}
      {sweepWalletId && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6 space-y-4">
          <h3 className="font-semibold">Sweep Wallet</h3>
          <p className="text-sm text-neutral-600">
            Transfer all tokens and SOL to a destination address.
          </p>
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
              Destination Address
            </label>
            <input
              type="text"
              value={sweepDest}
              onChange={(e) => setSweepDest(e.target.value)}
              placeholder="Enter Solana address..."
              className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          {sweepResult && (
            <p className={`text-sm ${sweepResult.includes("failed") ? "text-red-600" : "text-emerald-600"}`}>
              {sweepResult}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => { setSweepWalletId(null); setSweepDest(""); setSweepResult(""); }}
              className="px-4 py-2.5 border border-neutral-200 text-sm font-semibold rounded-xl hover:bg-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSweep}
              disabled={sweeping || !sweepDest}
              className="px-6 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {sweeping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Sweep All
            </button>
          </div>
        </div>
      )}

      {/* Wallet grid */}
      {wallets.length === 0 ? (
        <div className="bg-neutral-50 rounded-2xl p-12 text-center border border-neutral-200">
          <Wallet className="w-10 h-10 text-neutral-400 mx-auto mb-4" />
          <p className="text-neutral-600 font-medium mb-2">No stealth wallets yet</p>
          <p className="text-neutral-400 text-sm">
            Stealth wallets are created when you perform anonymous swaps or token launches.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wallets.map((w) => {
            const bal = balances[w.id];
            const revealed = revealedKeys.has(w.id);
            return (
              <div
                key={w.id}
                className="bg-white border border-neutral-200 rounded-2xl p-5 hover:border-neutral-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{w.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sourceBadgeColor(w.source)}`}>
                      {w.source}
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-400">
                    {new Date(w.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Public key */}
                <div className="mb-3">
                  <p className="text-[10px] text-neutral-400 mb-0.5">Public Key</p>
                  <div className="flex items-center gap-1">
                    <code className="text-xs truncate flex-1 text-neutral-600">
                      {w.publicKey.slice(0, 16)}...{w.publicKey.slice(-8)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(w.publicKey, `pub-${w.id}`)}
                      className="p-1 hover:bg-neutral-50 rounded"
                    >
                      {copied === `pub-${w.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-neutral-400" />}
                    </button>
                  </div>
                </div>

                {/* Balances */}
                <div className="mb-3 bg-neutral-50 rounded-lg p-3">
                  {loadingBalances ? (
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                    </div>
                  ) : bal ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-500">SOL</span>
                        <span className="font-mono font-semibold">{bal.sol.toFixed(6)}</span>
                      </div>
                      {bal.tokens.map((t) => (
                        <div key={t.mint} className="flex justify-between text-xs">
                          <span className="text-neutral-500 truncate max-w-[120px]">{t.mint.slice(0, 8)}...</span>
                          <span className="font-mono font-semibold">{t.amount}</span>
                        </div>
                      ))}
                      {bal.tokens.length === 0 && bal.sol === 0 && (
                        <p className="text-xs text-neutral-400">No balances</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400">—</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleRevealKey(w.id)}
                    className="flex-1 py-2 text-xs font-semibold border border-neutral-200 rounded-lg hover:bg-neutral-50 flex items-center justify-center gap-1"
                  >
                    {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {revealed ? "Hide" : "Key"}
                  </button>
                  <button
                    onClick={() => { copyToClipboard(w.secretKey, `key-${w.id}`); }}
                    className="flex-1 py-2 text-xs font-semibold border border-neutral-200 rounded-lg hover:bg-neutral-50 flex items-center justify-center gap-1"
                  >
                    {copied === `key-${w.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Download className="w-3 h-3" />}
                    Export
                  </button>
                  <button
                    onClick={() => setSweepWalletId(w.id)}
                    className="flex-1 py-2 text-xs font-semibold border border-neutral-200 rounded-lg hover:bg-neutral-50 flex items-center justify-center gap-1"
                  >
                    <Send className="w-3 h-3" /> Sweep
                  </button>
                  <button
                    onClick={() => handleRemove(w.id)}
                    className="py-2 px-2 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50 flex items-center justify-center"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Revealed key */}
                {revealed && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-[10px] text-amber-600 font-semibold mb-1">PRIVATE KEY</p>
                    <code className="text-[10px] break-all text-amber-800">{w.secretKey}</code>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Phantom import instructions */}
      <div className="mt-8 bg-neutral-50 border border-neutral-200 rounded-2xl p-6">
        <h3 className="font-semibold mb-3">Import to Phantom Wallet</h3>
        <ol className="text-sm text-neutral-600 space-y-2 list-decimal list-inside">
          <li>Copy the private key of any stealth wallet above</li>
          <li>Open Phantom &rarr; Settings &rarr; Manage Accounts</li>
          <li>Tap &ldquo;Import Private Key&rdquo;</li>
          <li>Paste the base58 key and give it a name</li>
          <li>Your stealth tokens will appear in Phantom</li>
        </ol>
      </div>
    </main>
  );
}
