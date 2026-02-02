import type { Metadata } from "next";
import "./globals.css";
import { Wallet } from "@/components/wallet-provider";
import AIChat from "@/components/ai-chat";

export const metadata: Metadata = {
  title: "Dara - Privacy Toolkit for Solana",
  description: "Anonymous swaps, stealth token launches, AI risk analysis, and stealth wallet management on Solana mainnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased min-h-screen bg-[#Fdfdfc] text-neutral-900 selection:bg-neutral-900 selection:text-white">
        <Wallet>
          {children}
          <AIChat />
        </Wallet>
      </body>
    </html>
  );
}
