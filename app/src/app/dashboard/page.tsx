"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useProgram } from "@/hooks/useProgram";
import { PROGRAM_ID } from "@/lib/program";
import { Plus, ArrowRight, Clock, Users, Coins } from "lucide-react";

interface PresaleMeta {
  id: string;
  name: string;
  symbol: string;
  description: string;
  mint: string;
  creator: string;
  imageUrl?: string;
  createdAt: number;
}

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
}

export default function DashboardPage() {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const router = useRouter();
  const program = useProgram();
  const [presales, setPresales] = useState<
    (PresaleMeta & { onChain?: PresaleOnChain })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) {
      router.push("/");
    }
  }, [connected, router]);

  const loadPresales = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch metadata from API
      const res = await fetch("/api/presales");
      const metas: PresaleMeta[] = await res.json();

      // Enrich with on-chain data
      if (program) {
        const enriched = await Promise.all(
          metas.map(async (meta) => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const account = await (program.account as any).presale.fetch(
                new PublicKey(meta.id)
              );
              return { ...meta, onChain: account };
            } catch {
              return meta;
            }
          })
        );
        setPresales(enriched);
      } else {
        setPresales(metas);
      }
    } catch (err) {
      console.error("Failed to load presales:", err);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    if (connected) {
      loadPresales();
    }
  }, [connected, loadPresales]);

  if (!connected) return null;

  return (
    <main className="pt-28 px-4 md:px-8 pb-20 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
        <div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-2">
            Dashboard
          </h1>
          <p className="text-neutral-500 text-lg">
            Active presales on Solana Devnet
          </p>
        </div>
        <Link
          href="/create"
          className="group flex items-center gap-2 px-5 py-3 bg-neutral-900 text-white rounded-full text-sm font-semibold hover:bg-neutral-700 transition-all duration-300 shadow-lg shadow-neutral-200/50"
        >
          <Plus className="w-4 h-4" />
          Create Presale
        </Link>
      </div>

      {/* Wallet Info */}
      {publicKey && (
        <div className="bg-neutral-50 rounded-2xl p-6 mb-8 border border-neutral-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-1">
                Connected Wallet
              </p>
              <p className="font-mono text-sm text-neutral-700">
                {publicKey.toBase58()}
              </p>
            </div>
            <WalletBalance
              connection={connection}
              publicKey={publicKey}
            />
          </div>
        </div>
      )}

      {/* Presale List */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-neutral-50 border border-neutral-100 rounded-2xl p-6 animate-pulse"
            >
              <div className="h-6 bg-neutral-200 rounded w-1/3 mb-4" />
              <div className="h-4 bg-neutral-100 rounded w-2/3 mb-6" />
              <div className="h-8 bg-neutral-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : presales.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Coins className="w-8 h-8 text-neutral-400" />
          </div>
          <p className="text-neutral-500 text-lg mb-2">No presales yet</p>
          <p className="text-neutral-400 text-sm mb-8">
            Create your first anonymous token presale
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white text-sm font-semibold rounded-full hover:bg-neutral-700 transition-all"
          >
            Create Presale
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {presales.map((presale) => {
            const onChain = presale.onChain;
            const raised = onChain
              ? onChain.totalSolCommitted.toNumber() / LAMPORTS_PER_SOL
              : 0;
            const cap = onChain
              ? onChain.hardCap.toNumber() / LAMPORTS_PER_SOL
              : 0;
            const progress = cap > 0 ? (raised / cap) * 100 : 0;
            const isActive =
              onChain && !onChain.isFinalized && Date.now() / 1000 < onChain.endTime.toNumber();

            return (
              <Link
                key={presale.id}
                href={`/presale/${presale.id}`}
                className="group bg-white border border-neutral-200 rounded-2xl p-6 hover:border-neutral-400 hover:shadow-md transition-all duration-300"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold group-hover:text-indigo-600 transition-colors">
                      {presale.name}
                    </h3>
                    <p className="text-sm text-neutral-500 font-mono">
                      ${presale.symbol}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-3 py-1 rounded-full border font-medium ${
                      onChain?.isFinalized
                        ? "bg-neutral-100 text-neutral-500 border-neutral-200"
                        : isActive
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : "bg-amber-50 text-amber-600 border-amber-200"
                    }`}
                  >
                    {onChain?.isFinalized
                      ? "Finalized"
                      : isActive
                      ? "Active"
                      : "Ended"}
                  </span>
                </div>

                {presale.description && (
                  <p className="text-sm text-neutral-500 mb-4 line-clamp-2">
                    {presale.description}
                  </p>
                )}

                {onChain && (
                  <>
                    <div className="space-y-1.5 mb-4">
                      <div className="flex justify-between text-xs font-medium text-neutral-600">
                        <span>
                          {raised.toFixed(2)} / {cap.toFixed(2)} SOL
                        </span>
                        <span>{progress.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex gap-4 text-xs text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {onChain.commitmentCount} commits
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(
                          onChain.endTime.toNumber() * 1000
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

function WalletBalance({
  connection,
  publicKey,
}: {
  connection: ReturnType<typeof useConnection>["connection"];
  publicKey: PublicKey;
}) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    connection.getBalance(publicKey).then((b) => setBalance(b / LAMPORTS_PER_SOL));
  }, [connection, publicKey]);

  return (
    <div className="bg-white rounded-xl px-4 py-2 border border-neutral-200">
      <span className="text-xs text-neutral-500 mr-2">Balance</span>
      <span className="font-mono text-sm font-semibold">
        {balance !== null ? `${balance.toFixed(4)} SOL` : "..."}
      </span>
    </div>
  );
}
