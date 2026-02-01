import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "Hd5LcuhcSQ7aHqoyGhJSS6dokyptfBhNJXTvDQhfhxkj"
);

import idl from "./idl.json";

export type AnonPresaleIDL = typeof idl;

export function getProgram(
  connection: Connection,
  wallet: AnchorProvider["wallet"]
) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program(idl as any, provider);
}

// PDA derivation functions
export function getPresalePDA(
  mint: PublicKey,
  creator: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("presale"), mint.toBuffer(), creator.toBuffer()],
    PROGRAM_ID
  );
}

export function getTokenVaultPDA(presale: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault"), presale.toBuffer()],
    PROGRAM_ID
  );
}

export function getVaultAuthorityPDA(presale: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_auth"), presale.toBuffer()],
    PROGRAM_ID
  );
}

export function getCommitmentPDA(
  presale: PublicKey,
  commitmentHash: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("commitment"), presale.toBuffer(), Buffer.from(commitmentHash)],
    PROGRAM_ID
  );
}

// Account types
export interface PresaleAccount {
  creator: PublicKey;
  mint: PublicKey;
  totalSolCommitted: bigint;
  hardCap: bigint;
  tokensForSale: bigint;
  startTime: bigint;
  endTime: bigint;
  isFinalized: boolean;
  commitmentCount: number;
  bump: number;
  vaultAuthBump: number;
}

export interface CommitmentAccount {
  presale: PublicKey;
  commitmentHash: number[];
  solAmount: bigint;
  isClaimed: boolean;
  bump: number;
}
