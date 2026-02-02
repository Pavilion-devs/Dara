import { Connection, Keypair, Transaction, VersionedTransaction, SendOptions } from "@solana/web3.js";
import bs58 from "bs58";
import { MAINNET_RPC_URL } from "./constants";

export function getRelayerKeypair(): Keypair {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) throw new Error("RELAYER_PRIVATE_KEY not set");
  return Keypair.fromSecretKey(bs58.decode(key));
}

export function getMainnetConnection(): Connection {
  return new Connection(MAINNET_RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });
}

export async function sendAndConfirmTx(
  connection: Connection,
  tx: Transaction | VersionedTransaction,
  signers?: Keypair[]
): Promise<string> {
  const opts: SendOptions = { skipPreflight: false, preflightCommitment: "confirmed" };
  let signature: string;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (tx instanceof VersionedTransaction) {
        if (signers) {
          tx.sign(signers);
        }
        signature = await connection.sendTransaction(tx, opts);
      } else {
        if (signers) {
          tx.partialSign(...signers);
        }
        const raw = tx.serialize();
        signature = await connection.sendRawTransaction(raw, opts);
      }

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        { signature, ...latestBlockhash },
        "confirmed"
      );
      return signature;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  throw new Error("Failed to send transaction after 3 attempts");
}
