"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletButton = dynamic(() => import("./wallet-button"), {
  ssr: false,
  loading: () => (
    <div className="w-24 h-9 bg-neutral-100 rounded-full animate-pulse" />
  ),
});

export default function Navbar() {
  const { connected } = useWallet();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-6 py-4 md:px-12 md:py-5 w-full max-w-[1800px] mx-auto bg-[#Fdfdfc]/80 backdrop-blur-md transition-all duration-300 border-b border-transparent">
      <Link
        href="/"
        className="text-xl font-semibold tracking-tight cursor-pointer hover:opacity-70 transition-opacity"
      >
        Anon<span className="text-indigo-500">Presale</span>
      </Link>
      <div className="flex items-center gap-8">
        {connected && (
          <div className="hidden md:flex gap-6 text-sm font-medium text-neutral-600">
            <Link href="/dashboard" className="hover:text-black transition-colors">
              Dashboard
            </Link>
            <Link href="/create" className="hover:text-black transition-colors">
              Create
            </Link>
          </div>
        )}
        <WalletButton />
      </div>
    </nav>
  );
}
