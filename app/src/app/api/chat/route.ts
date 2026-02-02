import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Connection, PublicKey } from "@solana/web3.js";
import { MAINNET_RPC_URL } from "@/lib/constants";

export const maxDuration = 30;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful AI assistant for Dara, a privacy toolkit for Solana. You help users understand:

1. Token risk analysis - when users paste a mint address, analyze it for risks
2. Privacy features - explain how anonymous swaps and stealth wallets work
3. Solana tokens - answer general questions about tokens, trading, and DeFi

Keep responses concise and helpful. When analyzing tokens, focus on:
- Mint/freeze authority status
- Top holder concentration
- Liquidity and trading volume
- Red flags like honeypots or rug pull indicators

If a user pastes what looks like a Solana address (32-44 chars, alphanumeric), offer to analyze it.`;

async function getTokenAnalysis(mintAddress: string) {
  try {
    const connection = new Connection(MAINNET_RPC_URL);
    const mintPubkey = new PublicKey(mintAddress);
    
    // Get token supply
    const supply = await connection.getTokenSupply(mintPubkey);
    
    // Get largest holders
    const holders = await connection.getTokenLargestAccounts(mintPubkey);
    
    // Get mint account info
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    const mintData = (mintInfo.value?.data as { parsed?: { info?: { mintAuthority?: string; freezeAuthority?: string } } })?.parsed?.info;
    
    const topHolders = holders.value.slice(0, 5);
    const totalSupply = BigInt(supply.value.amount);
    
    let concentration = 0;
    if (totalSupply > BigInt(0)) {
      const topHolderSum = topHolders.reduce((sum, h) => sum + BigInt(h.amount), BigInt(0));
      concentration = Number((topHolderSum * BigInt(100)) / totalSupply);
    }
    
    return {
      supply: supply.value.uiAmountString,
      decimals: supply.value.decimals,
      mintAuthority: mintData?.mintAuthority || "Revoked",
      freezeAuthority: mintData?.freezeAuthority || "None",
      topHolderConcentration: concentration,
      holderCount: holders.value.length,
    };
  } catch (error) {
    return null;
  }
}

function detectMintAddress(text: string): string | null {
  const match = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return match ? match[0] : null;
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1]?.content || "";
    const mintAddress = detectMintAddress(lastMessage);
    
    let contextMessage = "";
    if (mintAddress) {
      const analysis = await getTokenAnalysis(mintAddress);
      if (analysis) {
        contextMessage = `\n\n[Token Analysis for ${mintAddress}]:
- Supply: ${analysis.supply}
- Decimals: ${analysis.decimals}
- Mint Authority: ${analysis.mintAuthority}
- Freeze Authority: ${analysis.freezeAuthority}
- Top 5 Holders Own: ${analysis.topHolderConcentration}%
- Holders Found: ${analysis.holderCount}`;
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + contextMessage },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || "Sorry, I couldn't process that.";
    
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 }
    );
  }
}
