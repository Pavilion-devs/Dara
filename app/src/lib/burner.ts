import { Keypair } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import bs58 from "bs58";

const STORAGE_KEY = "anon_presale_burners";

export interface BurnerData {
  presaleId: string;
  burnerSecretKey: string; // base58 encoded
  secret: string; // hex encoded 32-byte secret
  claimWallet: string; // base58 pubkey of claim wallet
  commitmentHash: string; // hex encoded
  solAmount: number; // lamports
  createdAt: number;
}

export function generateBurnerKeypair(): Keypair {
  return Keypair.generate();
}

export function generateSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

export function computeCommitmentHash(
  secret: Uint8Array,
  claimWalletPubkey: Uint8Array
): Uint8Array {
  const combined = new Uint8Array(secret.length + claimWalletPubkey.length);
  combined.set(secret, 0);
  combined.set(claimWalletPubkey, secret.length);
  return sha256(combined);
}

export function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// localStorage helpers
export function saveBurnerData(data: BurnerData): void {
  const existing = getAllBurnerData();
  existing.push(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function getAllBurnerData(): BurnerData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function getBurnerDataForPresale(
  presaleId: string
): BurnerData | undefined {
  return getAllBurnerData().find((d) => d.presaleId === presaleId);
}

export function getBurnerKeypair(data: BurnerData): Keypair {
  return Keypair.fromSecretKey(bs58.decode(data.burnerSecretKey));
}
