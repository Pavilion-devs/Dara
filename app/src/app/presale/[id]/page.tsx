"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import Link from "next/link";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { useProgram } from "@/hooks/useProgram";
import {
  PROGRAM_ID,
  getPresalePDA,
  getCommitmentPDA,
} from "@/lib/program";
import {
  generateBurnerKeypair,
  generateSecret,
  computeCommitmentHash,
  uint8ArrayToHex,
  hexToUint8Array,
  saveBurnerData,
  getBurnerDataForPresale,
  getBurnerKeypair,
} from "@/lib/burner";
import {
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  ArrowLeft,
  Loader2,
  Shield,
  Copy,
  Check,
  Users,
  Clock,
  Coins,
  AlertTriangle,
} from "lucide-react";

interface PresaleOnChain {
  creator: PublicKey;
  mint: PublicKey;
  totalSolCommitted: { toNumber: () => number };
  hardCap: { toNumber: () => number };
  tokensForSale: { toNumber: () => number };
  startTime: { toNumber: () => number };
  endTime: { toNumber: () => number };
  isFinalized: boolean;
  commitmentCount: number;
  bump: number;
  vaultAuthBump: number;
}

export default function PresaleDetailPage() {
  const params = useParams();
  const presaleId = params.id as string;
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const router = useRouter();
  const program = useProgram();

  const [presale, setPresale] = useState<PresaleOnChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Commit state
  const [commitAmount, setCommitAmount] = useState("0.5");
  const [claimWalletInput, setClaimWalletInput] = useState("");
  const [burnerGenerated, setBurnerGenerated] = useState(false);
  const [burnerAddress, setBurnerAddress] = useState("");
  const [burnerBalance, setBurnerBalance] = useState<number | null>(null);
  const [burnerFunded, setBurnerFunded] = useState(false);

  // Claim state
  const [claimSecret, setClaimSecret] = useState("");
  const [claimWallet, setClaimWallet] = useState("");
  const [claimed, setClaimed] = useState(false);

  // Copy state
  const [copied, setCopied] = useState("");

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState("");

  // Existing burner data
  const existingBurner = typeof window !== "undefined" ? getBurnerDataForPresale(presaleId) : undefined;

  // Initialize burner address from saved data so balance checker works on resume
  useEffect(() => {
    if (existingBurner && !burnerAddress) {
      const kp = Keypair.fromSecretKey(bs58.decode(existingBurner.burnerSecretKey));
      setBurnerAddress(kp.publicKey.toBase58());
    }
  }, [existingBurner, burnerAddress]);

  const loadPresale = useCallback(async () => {
    if (!program) return;
    // Only show skeleton on first load, not on refreshes
    if (!presale) setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await (program.account as any).presale.fetch(
        new PublicKey(presaleId)
      );
      setPresale(account);
    } catch (err) {
      console.error("Failed to load presale:", err);
      setError("Presale not found on-chain");
    } finally {
      setLoading(false);
    }
  }, [program, presaleId]);

  useEffect(() => {
    if (!connected) {
      router.push("/");
      return;
    }
    loadPresale();
  }, [connected, router, loadPresale]);

  // Check burner balance periodically
  useEffect(() => {
    if (!burnerAddress) return;
    const check = async () => {
      try {
        const bal = await connection.getBalance(new PublicKey(burnerAddress));
        setBurnerBalance(bal / LAMPORTS_PER_SOL);
        if (bal > 0) setBurnerFunded(true);
      } catch {
        // ignore
      }
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [burnerAddress, connection]);

  // Countdown timer
  const [timerEnded, setTimerEnded] = useState(false);

  useEffect(() => {
    if (!presale) return;
    const endTimeSec = presale.endTime.toNumber();

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = endTimeSec - now;
      if (diff <= 0) {
        setTimeLeft("Ended");
        // Only reload once when timer first reaches 0
        if (!timerEnded) {
          setTimerEnded(true);
          loadPresale();
        }
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      if (h > 0) {
        setTimeLeft(`${h}h ${m}m ${s}s`);
      } else if (m > 0) {
        setTimeLeft(`${m}m ${s}s`);
      } else {
        setTimeLeft(`${s}s`);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presale]);

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  async function handleGenerateBurner() {
    if (!claimWalletInput) {
      setError("Enter a claim wallet address first");
      return;
    }

    try {
      new PublicKey(claimWalletInput);
    } catch {
      setError("Invalid claim wallet address");
      return;
    }

    const burner = generateBurnerKeypair();
    const secret = generateSecret();
    const claimPubkey = new PublicKey(claimWalletInput);
    const commitHash = computeCommitmentHash(secret, claimPubkey.toBytes());

    setBurnerAddress(burner.publicKey.toBase58());
    setBurnerGenerated(true);
    setError("");

    // Save to localStorage
    saveBurnerData({
      presaleId,
      burnerSecretKey: bs58.encode(burner.secretKey),
      secret: uint8ArrayToHex(secret),
      claimWallet: claimWalletInput,
      commitmentHash: uint8ArrayToHex(commitHash),
      solAmount: Math.floor(parseFloat(commitAmount) * LAMPORTS_PER_SOL),
      createdAt: Date.now(),
    });
  }

  async function handleFundBurner() {
    if (!publicKey || !burnerAddress) return;
    setActionLoading(true);
    setError("");
    try {
      // Use saved amount from localStorage if resuming, otherwise from input
      const data = getBurnerDataForPresale(presaleId);
      const solLamports = data ? data.solAmount : Math.floor(parseFloat(commitAmount) * LAMPORTS_PER_SOL);
      const amount = solLamports + 10_000_000; // extra for fees
      const tx = new Transaction();
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(burnerAddress),
          lamports: amount,
        })
      );
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setBurnerFunded(true);
      setSuccess("Burner wallet funded!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fund burner");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCommit() {
    if (!program || !presale) return;
    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = getBurnerDataForPresale(presaleId);
      if (!data) throw new Error("No burner data found. Generate a burner first.");

      const burner = getBurnerKeypair(data);
      const commitHash = hexToUint8Array(data.commitmentHash);
      const presalePubkey = new PublicKey(presaleId);
      const solAmount = new BN(data.solAmount);

      // Build transaction — IDL account name is "participant", commitment PDA auto-derived
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (program.methods as any)
        .commitToPresale(Array.from(commitHash), solAmount)
        .accounts({
          participant: burner.publicKey,
          presale: presalePubkey,
        })
        .transaction();

      tx.feePayer = burner.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(burner);

      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      setSuccess("Committed anonymously! Your deposit is unlinkable to your main wallet.");
      loadPresale();
    } catch (err: unknown) {
      console.error("commit error:", err);
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaim() {
    if (!program || !presale) return;
    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = existingBurner;
      const secretHex = claimSecret || data?.secret;
      const claimAddr = claimWallet || data?.claimWallet;

      if (!secretHex || !claimAddr) {
        throw new Error("Enter secret and claim wallet address");
      }

      const secret = hexToUint8Array(secretHex);
      const claimPubkey = new PublicKey(claimAddr);
      const presalePubkey = new PublicKey(presaleId);

      // Recompute commitment hash to find the PDA
      const commitHash = computeCommitmentHash(secret, claimPubkey.toBytes());
      const [commitmentPDA] = getCommitmentPDA(presalePubkey, commitHash);

      // Only pass accounts Anchor can't auto-derive from IDL
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (program.methods as any)
        .claimTokens(Array.from(secret))
        .accounts({
          claimer: publicKey!,
          presale: presalePubkey,
          commitment: commitmentPDA,
          claimWallet: claimPubkey,
          mint: presale.mint,
        })
        .rpc();

      await connection.confirmTransaction(tx, "confirmed");
      setClaimed(true);
      setSuccess(`Tokens claimed to ${claimAddr.slice(0, 8)}...! Check your claim wallet.`);
      loadPresale();
    } catch (err: unknown) {
      console.error("claim error:", err);
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFinalize() {
    if (!program || !publicKey) return;
    setActionLoading(true);
    setError("");
    try {
      const presalePubkey = new PublicKey(presaleId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (program.methods as any)
        .finalizePresale()
        .accounts({
          creator: publicKey,
          presale: presalePubkey,
        })
        .rpc();
      await connection.confirmTransaction(tx, "confirmed");
      setSuccess("Presale finalized! Participants can now claim tokens.");
      loadPresale();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Finalize failed");
    } finally {
      setActionLoading(false);
    }
  }

  if (!connected) return null;

  if (loading) {
    return (
      <main className="pt-28 px-4 md:px-8 pb-20 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-neutral-100 rounded w-1/3" />
          <div className="h-48 bg-neutral-100 rounded-2xl" />
          <div className="h-48 bg-neutral-100 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (!presale) {
    return (
      <main className="pt-28 px-4 md:px-8 pb-20 max-w-3xl mx-auto text-center">
        <p className="text-neutral-500 text-lg">Presale not found</p>
        <Link
          href="/dashboard"
          className="inline-block mt-4 text-sm text-indigo-600 hover:underline"
        >
          Back to Dashboard
        </Link>
      </main>
    );
  }

  const raised = presale.totalSolCommitted.toNumber() / LAMPORTS_PER_SOL;
  const cap = presale.hardCap.toNumber() / LAMPORTS_PER_SOL;
  const progress = cap > 0 ? (raised / cap) * 100 : 0;
  const isCreator = publicKey?.equals(presale.creator);
  const isActive = !presale.isFinalized && Date.now() / 1000 < presale.endTime.toNumber();
  const hasEnded = Date.now() / 1000 >= presale.endTime.toNumber();

  return (
    <main className="pt-28 px-4 md:px-8 pb-20 max-w-3xl mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-black transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Dashboard
      </Link>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-4 mb-6 text-sm">
          {success}
        </div>
      )}

      {/* Presale Info */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Presale
            </h1>
            <p className="text-xs text-neutral-400 font-mono mt-1 break-all">
              {presaleId}
            </p>
          </div>
          <span
            className={`text-xs px-3 py-1 rounded-full border font-medium ${
              presale.isFinalized
                ? "bg-neutral-100 text-neutral-500 border-neutral-200"
                : isActive
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-amber-50 text-amber-600 border-amber-200"
            }`}
          >
            {presale.isFinalized ? "Finalized" : isActive ? "Active" : "Ended"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-neutral-50 rounded-xl p-3">
            <p className="text-xs text-neutral-500 mb-1">Raised</p>
            <p className="font-semibold text-lg">{raised.toFixed(2)} SOL</p>
          </div>
          <div className="bg-neutral-50 rounded-xl p-3">
            <p className="text-xs text-neutral-500 mb-1">Hard Cap</p>
            <p className="font-semibold text-lg">{cap.toFixed(2)} SOL</p>
          </div>
          <div className="bg-neutral-50 rounded-xl p-3">
            <p className="text-xs text-neutral-500 mb-1">Commits</p>
            <p className="font-semibold text-lg flex items-center gap-1">
              <Users className="w-4 h-4 text-neutral-400" />
              {presale.commitmentCount}
            </p>
          </div>
          <div className={`rounded-xl p-3 ${timeLeft === "Ended" ? "bg-amber-50" : "bg-neutral-50"}`}>
            <p className="text-xs text-neutral-500 mb-1">
              {timeLeft === "Ended" ? "Status" : "Time Left"}
            </p>
            <p className={`font-semibold text-lg flex items-center gap-1 ${
              timeLeft === "Ended" ? "text-amber-600" : timeLeft.startsWith("0") || (!timeLeft.includes("h") && !timeLeft.includes("m")) ? "text-red-600" : "text-neutral-900"
            }`}>
              <Clock className="w-4 h-4" />
              {timeLeft || "..."}
            </p>
            <p className="text-[10px] text-neutral-400 mt-1">
              {new Date(presale.endTime.toNumber() * 1000).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-medium text-neutral-600">
            <span>Progress</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-neutral-400 font-mono mt-4 break-all">
          Mint: {presale.mint.toBase58()}
        </p>
      </div>

      {/* Creator Actions */}
      {isCreator && !presale.isFinalized && (hasEnded || raised >= cap) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-800 mb-1">
                Finalize Required
              </h3>
              <p className="text-sm text-amber-700 mb-4">
                {hasEnded
                  ? "The presale has ended."
                  : "Hard cap reached!"}{" "}
                Finalize to allow token claims and withdraw raised SOL.
              </p>
              <button
                onClick={handleFinalize}
                disabled={actionLoading}
                className="px-5 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-full hover:bg-amber-700 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {actionLoading && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Finalize Presale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commit Section */}
      {isActive && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold">Commit Anonymously</h2>
          </div>

          {(() => {
            // Derive burner address from saved data if exists
            const savedBurnerAddr = existingBurner
              ? Keypair.fromSecretKey(bs58.decode(existingBurner.burnerSecretKey)).publicKey.toBase58()
              : "";
            // If there's saved burner data AND the on-chain commit count > 0, show "already committed"
            const onChainCommitted = presale.commitmentCount > 0 && existingBurner;
            // If there's saved burner data but NO on-chain commit, resume the flow
            const resumeBurner = existingBurner && !onChainCommitted;
            const activeBurnerAddress = burnerAddress || savedBurnerAddr;
            const showBurnerFlow = burnerGenerated || resumeBurner;
            const displayCommitAmount = resumeBurner
              ? (existingBurner.solAmount / LAMPORTS_PER_SOL).toString()
              : commitAmount;

            if (onChainCommitted) return (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm">
                <p className="font-semibold text-emerald-800 mb-2">
                  Commitment submitted on-chain
                </p>
                <p className="text-emerald-600 text-xs font-mono break-all">
                  Burner: {savedBurnerAddr}
                </p>
                <p className="text-emerald-600 text-xs mt-1">
                  Amount: {existingBurner.solAmount / LAMPORTS_PER_SOL} SOL
                </p>
              </div>
            );

            return (
              <div className="space-y-4">
                {resumeBurner && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                    <p className="font-semibold text-amber-800 mb-1">
                      Burner generated but not committed yet
                    </p>
                    <p className="text-amber-600 text-xs">
                      Complete the steps below to finish your anonymous commit.
                    </p>
                  </div>
                )}
                {!showBurnerFlow && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                        Claim Wallet Address *
                      </label>
                      <input
                        type="text"
                        value={claimWalletInput}
                        onChange={(e) => setClaimWalletInput(e.target.value)}
                        placeholder="Fresh wallet to receive tokens (not your connected wallet)"
                        className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors font-mono"
                      />
                      <p className="text-xs text-neutral-400 mt-1">
                        Use a fresh address that can&apos;t be linked to your main wallet
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                        SOL Amount
                      </label>
                      <input
                        type="number"
                        value={commitAmount}
                        onChange={(e) => setCommitAmount(e.target.value)}
                        step="0.1"
                        min="0.01"
                        className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors"
                      />
                    </div>
                  </>
                )}

                {!showBurnerFlow ? (
                  <button
                    onClick={handleGenerateBurner}
                    className="w-full py-3 bg-indigo-600 text-white text-sm font-bold rounded-full hover:bg-indigo-700 transition-all"
                  >
                    Generate Burner Wallet
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                      <p className="text-xs text-neutral-500 mb-1">
                        Burner Address
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-xs text-neutral-700 break-all flex-1">
                          {activeBurnerAddress}
                        </p>
                        <button
                          onClick={() => handleCopy(activeBurnerAddress, "burner")}
                          className="shrink-0"
                        >
                          {copied === "burner" ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-neutral-400" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-neutral-500 mt-2">
                        Balance: {burnerBalance !== null ? `${burnerBalance.toFixed(4)} SOL` : "checking..."}
                      </p>
                    </div>

                    {!burnerFunded ? (
                      <button
                        onClick={handleFundBurner}
                        disabled={actionLoading}
                        className="w-full py-3 bg-neutral-900 text-white text-sm font-bold rounded-full hover:bg-neutral-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        {actionLoading && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        Fund Burner ({displayCommitAmount} SOL + fees)
                      </button>
                    ) : (
                      <button
                        onClick={handleCommit}
                        disabled={actionLoading}
                        className="w-full py-3 bg-indigo-600 text-white text-sm font-bold rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        {actionLoading && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        <Shield className="w-4 h-4" />
                        Commit Anonymously
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Claim Section */}
      {presale.isFinalized && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <Coins className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold">Claim Tokens</h2>
          </div>

          {claimed ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
              <p className="font-semibold text-emerald-800 mb-1">
                Tokens Claimed Successfully
              </p>
              <p className="text-emerald-600 text-sm">
                Tokens sent to {claimWallet.slice(0, 8)}...{claimWallet.slice(-4)}
              </p>
              <p className="text-neutral-400 text-xs mt-3">
                The commitment has been consumed and cannot be claimed again.
              </p>
            </div>
          ) : (
          <>
          {existingBurner && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-4 text-sm">
              <p className="text-neutral-600 mb-2">
                Found saved commitment data.
              </p>
              {(!claimSecret || !claimWallet) && (
                <button
                  onClick={() => {
                    setClaimSecret(existingBurner.secret);
                    setClaimWallet(existingBurner.claimWallet);
                  }}
                  className="text-indigo-600 text-xs font-semibold hover:underline"
                >
                  Auto-fill secret &amp; claim wallet
                </button>
              )}
              {claimSecret && claimWallet && (
                <p className="text-emerald-600 text-xs font-medium">Fields filled from saved data</p>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Secret (hex)
              </label>
              <input
                type="text"
                value={claimSecret}
                onChange={(e) => setClaimSecret(e.target.value)}
                placeholder="Your 32-byte secret in hex"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Claim Wallet Address
              </label>
              <input
                type="text"
                value={claimWallet}
                onChange={(e) => setClaimWallet(e.target.value)}
                placeholder="Wallet to receive tokens"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-colors font-mono"
              />
            </div>
            <button
              onClick={handleClaim}
              disabled={actionLoading || !claimSecret || !claimWallet}
              className="w-full py-3 bg-emerald-600 text-white text-sm font-bold rounded-full hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {actionLoading && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              Claim Tokens
            </button>
          </div>
          </>
          )}
        </div>
      )}
    </main>
  );
}
