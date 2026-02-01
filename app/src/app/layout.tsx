import type { Metadata } from "next";
import "./globals.css";
import { Wallet } from "@/components/wallet-provider";

export const metadata: Metadata = {
  title: "AnonPresale - Anonymous Token Presales on Solana",
  description: "Privacy-preserving presale platform. Commit anonymously, claim privately.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased min-h-screen bg-[#Fdfdfc] text-neutral-900 selection:bg-neutral-900 selection:text-white">
        <Wallet>{children}</Wallet>
      </body>
    </html>
  );
}
