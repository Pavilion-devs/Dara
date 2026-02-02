import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { MAINNET_RPC_URL } from "@/lib/constants";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { mintAddress } = await req.json();

    if (!mintAddress) {
      return NextResponse.json({ error: "mintAddress is required" }, { status: 400 });
    }

    const connection = new Connection(MAINNET_RPC_URL, "confirmed");
    const mint = new PublicKey(mintAddress);

    // Gather on-chain data
    const [mintInfo, largestAccounts, supplyInfo] = await Promise.all([
      getMint(connection, mint).catch(() => null),
      connection.getTokenLargestAccounts(mint).catch(() => null),
      connection.getTokenSupply(mint).catch(() => null),
    ]);

    const flags: string[] = [];
    let riskScore = 0;

    // Check mint authority
    if (mintInfo?.mintAuthority) {
      flags.push("Mint authority NOT revoked — new tokens can be minted");
      riskScore += 25;
    }

    // Check freeze authority
    if (mintInfo?.freezeAuthority) {
      flags.push("Freeze authority exists — tokens can be frozen");
      riskScore += 15;
    }

    // Analyze holder concentration
    if (largestAccounts?.value && supplyInfo?.value) {
      const totalSupply = Number(supplyInfo.value.amount);
      if (totalSupply > 0) {
        const holders = largestAccounts.value;

        if (holders.length > 0) {
          const topHolderPct = (Number(holders[0].amount) / totalSupply) * 100;
          if (topHolderPct > 50) {
            flags.push(`Top holder owns ${topHolderPct.toFixed(1)}% of supply`);
            riskScore += 30;
          } else if (topHolderPct > 25) {
            flags.push(`Top holder owns ${topHolderPct.toFixed(1)}% of supply`);
            riskScore += 15;
          }
        }

        if (holders.length >= 5) {
          const top5Total = holders.slice(0, 5).reduce((sum, h) => sum + Number(h.amount), 0);
          const top5Pct = (top5Total / totalSupply) * 100;
          if (top5Pct > 80) {
            flags.push(`Top 5 holders own ${top5Pct.toFixed(1)}% of supply`);
            riskScore += 20;
          }
        }

        if (holders.length < 10) {
          flags.push(`Only ${holders.length} holders — very low distribution`);
          riskScore += 10;
        }
      }
    }

    riskScore = Math.min(riskScore, 100);

    const riskLevel =
      riskScore >= 70 ? "CRITICAL" : riskScore >= 40 ? "MEDIUM" : "LOW";

    // Build data for GPT analysis
    const onChainData = {
      mintAuthority: mintInfo?.mintAuthority?.toBase58() ?? "revoked",
      freezeAuthority: mintInfo?.freezeAuthority?.toBase58() ?? "none",
      decimals: mintInfo?.decimals ?? "unknown",
      supply: supplyInfo?.value?.uiAmountString ?? "unknown",
      topHolders: largestAccounts?.value?.slice(0, 5).map((h) => ({
        address: h.address.toBase58(),
        amount: h.amount,
      })) ?? [],
      heuristicFlags: flags,
      heuristicScore: riskScore,
    };

    let summary = `Risk score: ${riskScore}/100 (${riskLevel}). ${flags.length} risk flags detected.`;

    // Try GPT analysis if API key available
    if (OPENAI_API_KEY) {
      try {
        const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a Solana token risk analyst. Given on-chain token data, provide a concise 2-3 sentence risk assessment. Focus on rug-pull indicators: mint authority, freeze authority, holder concentration, and supply distribution. Be direct and actionable.",
              },
              {
                role: "user",
                content: `Analyze this Solana token (${mintAddress}):\n${JSON.stringify(onChainData, null, 2)}`,
              },
            ],
            max_tokens: 200,
            temperature: 0.3,
          }),
        });

        if (gptRes.ok) {
          const gptData = await gptRes.json();
          const gptSummary = gptData.choices?.[0]?.message?.content;
          if (gptSummary) summary = gptSummary;
        }
      } catch {
        // Fall back to heuristic summary
      }
    }

    return NextResponse.json({
      riskScore,
      riskLevel,
      summary,
      flags,
    });
  } catch (error) {
    console.error("analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
