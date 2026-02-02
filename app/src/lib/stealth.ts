import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const STORAGE_KEY = "dara_stealth_wallets";

export interface StealthWallet {
  id: string;
  label: string;
  publicKey: string;
  secretKey: string;
  createdAt: number;
  source: "swap" | "prebuy" | "manual";
  sourceToken?: string;
  sourceTxSig?: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export function generateStealthWallet(
  label: string,
  source: StealthWallet["source"],
  sourceToken?: string,
  sourceTxSig?: string
): StealthWallet {
  const kp = Keypair.generate();
  const wallet: StealthWallet = {
    id: generateId(),
    label,
    publicKey: kp.publicKey.toBase58(),
    secretKey: bs58.encode(kp.secretKey),
    createdAt: Date.now(),
    source,
    sourceToken,
    sourceTxSig,
  };
  const all = getAllStealthWallets();
  all.push(wallet);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return wallet;
}

export function saveStealthWallet(wallet: StealthWallet): void {
  const all = getAllStealthWallets();
  all.push(wallet);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getAllStealthWallets(): StealthWallet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function removeStealthWallet(id: string): void {
  const all = getAllStealthWallets().filter((w) => w.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function exportWalletKey(id: string): string | null {
  const wallet = getAllStealthWallets().find((w) => w.id === id);
  return wallet?.secretKey ?? null;
}

export function getKeypairFromStealth(wallet: StealthWallet): Keypair {
  return Keypair.fromSecretKey(bs58.decode(wallet.secretKey));
}

export function importStealthWallet(secretKeyBase58: string, label: string): StealthWallet {
  const kp = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
  const wallet: StealthWallet = {
    id: generateId(),
    label,
    publicKey: kp.publicKey.toBase58(),
    secretKey: secretKeyBase58,
    createdAt: Date.now(),
    source: "manual",
  };
  const all = getAllStealthWallets();
  all.push(wallet);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return wallet;
}
