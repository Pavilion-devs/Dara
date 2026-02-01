import { NextRequest, NextResponse } from "next/server";

const ANON_API_URL = "https://api.dubdub.tv/thirdParty/v1/createToken";
const ANON_API_KEY = process.env.ANON_API_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!ANON_API_KEY) {
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { name, symbol, description, imageUrl, twitterLink, telegramLink } = body;

    if (!name || !symbol) {
      return NextResponse.json(
        { error: "name and symbol are required" },
        { status: 400 }
      );
    }

    // API expects FormData with specific field names
    const formData = new FormData();
    formData.append("tickerName", name);
    formData.append("tickerSymbol", symbol);
    formData.append("description", description || "");
    formData.append("twitterLink", twitterLink || "https://x.com");
    formData.append("telegramLink", telegramLink || "https://t.me");

    // If imageUrl is provided, fetch it and attach as file
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        const blob = await imgRes.blob();
        formData.append("files", blob, "token-image.png");
      } catch {
        // If image fetch fails, continue without it
      }
    }

    const response = await fetch(ANON_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANON_API_KEY,
        // Don't set Content-Type — fetch sets it automatically with boundary for FormData
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || "Anoncoin API error" },
        { status: response.status }
      );
    }

    // Response shape: { status, message, data: { mintAddress, signedTransaction, ... } }
    return NextResponse.json(data.data || data);
  } catch (error) {
    console.error("create-token error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
