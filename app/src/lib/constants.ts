export const MAINNET_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";
export const JUPITER_SWAP_URL = "https://quote-api.jup.ag/v6/swap";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export const RELAYER_FEE_LAMPORTS = 5000;

export const RELAYER_ADDRESS = process.env.NEXT_PUBLIC_RELAYER_ADDRESS || "";
