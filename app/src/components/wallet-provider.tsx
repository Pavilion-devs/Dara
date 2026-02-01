"use client";

import {
  WalletProvider,
  ConnectionProvider,
} from "@solana/wallet-adapter-react";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { useMemo, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

import "@solana/wallet-adapter-react-ui/styles.css";

const WalletModalProvider = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      ({ WalletModalProvider }) => WalletModalProvider
    ),
  { ssr: false }
);

const Navbar = dynamic(() => import("./navbar"), { ssr: false });

const emptySubscribe = () => () => {};

function LoadingSkeleton() {
  return (
    <main className="pt-32 px-8 pb-20 max-w-6xl mx-auto">
      <div className="animate-pulse">
        <div className="h-16 bg-neutral-100 rounded w-1/2 mb-6" />
        <div className="h-6 bg-neutral-100 rounded w-1/3 mb-16" />
      </div>
    </main>
  );
}

export const Wallet = ({ children }: { children: React.ReactNode }) => {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

  const config = {
    commitment: "confirmed" as const,
    wsEndpoint: endpoint.replace("https", "wss"),
    confirmTransactionInitialTimeout: 60000,
  };

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  if (!mounted) {
    return <LoadingSkeleton />;
  }

  return (
    <ConnectionProvider endpoint={endpoint} config={config}>
      <WalletProvider wallets={wallets} autoConnect={true}>
        <WalletModalProvider>
          <Navbar />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default Wallet;
