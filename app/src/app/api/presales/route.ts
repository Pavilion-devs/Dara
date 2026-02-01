import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

interface PresaleMetadata {
  id: string; // presale PDA pubkey
  name: string;
  symbol: string;
  description: string;
  mint: string;
  creator: string;
  imageUrl?: string;
  createdAt: number;
}

const DATA_FILE = join(process.cwd(), "presales-data.json");

function readPresales(): PresaleMetadata[] {
  try {
    if (!existsSync(DATA_FILE)) return [];
    const raw = readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writePresales(presales: PresaleMetadata[]): void {
  writeFileSync(DATA_FILE, JSON.stringify(presales, null, 2));
}

export async function GET() {
  const all = readPresales().sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  try {
    const body: PresaleMetadata = await req.json();

    if (!body.id || !body.name || !body.mint || !body.creator) {
      return NextResponse.json(
        { error: "id, name, mint, and creator are required" },
        { status: 400 }
      );
    }

    body.createdAt = Date.now();
    const presales = readPresales();
    // Replace if exists, otherwise add
    const idx = presales.findIndex((p) => p.id === body.id);
    if (idx >= 0) {
      presales[idx] = body;
    } else {
      presales.push(body);
    }
    writePresales(presales);

    return NextResponse.json({ success: true, presale: body });
  } catch (error) {
    console.error("presales error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
