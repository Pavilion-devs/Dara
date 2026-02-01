"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export default function WalletButton() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  if (!connected) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="px-5 py-2.5 bg-neutral-900 text-white rounded-full text-xs font-semibold hover:bg-neutral-700 hover:scale-105 transition-all duration-300 shadow-lg shadow-neutral-200/50"
      >
        Connect Wallet
      </button>
    );
  }

  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : "";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-neutral-600 bg-neutral-100 px-3 py-2 rounded-full font-mono">
        {shortAddress}
      </span>
      <button
        onClick={() => disconnect()}
        className="text-xs px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-black transition-all font-medium"
      >
        Disconnect
      </button>
    </div>
  );
}
