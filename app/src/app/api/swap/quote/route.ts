import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/jupiter";

export async function POST(req: NextRequest) {
  try {
    const { inputMint, outputMint, amount, slippageBps } = await req.json();

    if (!inputMint || !outputMint || !amount) {
      return NextResponse.json(
        { error: "inputMint, outputMint, and amount are required" },
        { status: 400 }
      );
    }

    const quote = await getQuote(inputMint, outputMint, Number(amount), slippageBps);
    return NextResponse.json(quote);
  } catch (error) {
    console.error("quote error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Quote failed" },
      { status: 500 }
    );
  }
}
