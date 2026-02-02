# Dara — Privacy Toolkit for Solana

Dara is a mainnet Solana privacy toolkit that breaks the on-chain link between your wallet and your trades. Swap tokens anonymously via a server-side relayer, launch tokens with distributed stealth pre-buys, and let AI warn you before you swap into a rug-pull.

**Network:** Solana Mainnet

---

## How It Works

```
User Wallet (Phantom/Solflare)
    |
    | 1. Deposits SOL to relayer
    v
Next.js API Routes (relayer logic)
    |
    |-- Anoncoin API (token creation)
    |-- Jupiter API (swap execution)
    |-- OpenAI API (risk analysis)
    v
Relayer Wallet (server-side keypair)
    |
    | 2. Executes Jupiter swap (user wallet NOT in tx)
    | 3. Transfers tokens to stealth wallet ATA
    v
Stealth Wallet (fresh Keypair)
    |
    User imports private key to Phantom
```

Your wallet sends SOL to the relayer. The relayer executes the Jupiter swap from its own keypair — your address never appears in the swap transaction. Swapped tokens are transferred to a freshly generated stealth wallet. Import the private key to Phantom to access your tokens.

---

## Features

### Anonymous Swap
Jupiter swaps executed via a server-side relayer. Your connected wallet deposits SOL, but the actual swap transaction only contains the relayer's address. Tokens land in a fresh stealth wallet.

### Stealth Token Launch + Pre-Buy
Create a token via the Anoncoin API and immediately execute distributed pre-buys across 1-5 stealth wallets. Each wallet gets its own keypair — distributed holding from block zero.

### AI Token Risk Analysis
Before you swap, Dara fetches on-chain data (holder concentration, mint authority, freeze authority, supply distribution) and runs it through GPT-4o-mini for a risk assessment. Flags rug-pull indicators and blocks swaps on tokens scoring 90+ risk.

### Stealth Wallet Manager
Full UI for managing stealth wallets — view SOL and token balances, copy/reveal private keys, sweep all assets to a destination, import external wallets, and export keys for Phantom import. Not just a text dump of private keys.

---

## Architecture

```
app/
├── src/app/
│   ├── page.tsx                       # Landing page
│   ├── layout.tsx                     # Root layout + wallet providers
│   ├── swap/page.tsx                  # Anonymous swap UI
│   ├── launch/page.tsx                # Token launch + pre-buy wizard
│   ├── wallets/page.tsx               # Stealth wallet manager
│   └── api/
│       ├── swap/quote/route.ts        # Jupiter quote proxy
│       ├── swap/execute/route.ts      # Relayer swap execution
│       ├── launch/prebuy/route.ts     # Token creation + distributed pre-buy
│       └── analyze/route.ts           # AI token risk analysis
├── src/components/
│   ├── navbar.tsx
│   ├── wallet-button.tsx
│   └── wallet-provider.tsx
└── src/lib/
    ├── constants.ts                   # Mainnet config
    ├── relayer.ts                     # Server-side relayer keypair + tx helpers
    ├── stealth.ts                     # Stealth wallet generation + localStorage
    └── jupiter.ts                     # Jupiter quote/swap/transfer helpers
```

No custom Solana program required. No database. localStorage for stealth wallet data, server-side relayer for swap execution.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Wallet | @solana/wallet-adapter (Phantom, Solflare) |
| Blockchain | @solana/web3.js, @solana/spl-token |
| Swap | Jupiter Aggregator V6 API |
| Token Creation | Anoncoin Third-Party API |
| AI Analysis | OpenAI GPT-4o-mini |
| Network | Solana Mainnet |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Solana wallet (Phantom or Solflare)
- A funded relayer wallet (~0.02 SOL for gas)

### 1. Install

```bash
cd app
npm install
```

### 2. Configure Environment

Edit `app/.env`:

```
ANON_API_KEY=<your anoncoin api key>
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_RELAYER_ADDRESS=<relayer wallet public key>
RELAYER_PRIVATE_KEY=<relayer wallet base58 private key>
OPENAI_API_KEY=<openai api key>
```

The relayer wallet needs ~0.003 SOL per swap for gas and ATA creation. With 0.02 SOL you get ~6 demo transactions.

### 3. Run

```bash
cd app
npm run dev
```

Open `http://localhost:3000` and connect a Solana wallet on mainnet.

---

## Usage

### Anonymous Swap

1. Navigate to `/swap`
2. Enter the token mint address — AI risk analysis loads automatically
3. Enter SOL amount — live Jupiter quote appears
4. Click "Swap Anonymously" — approve the SOL deposit to relayer
5. Relayer executes the swap and transfers tokens to a stealth wallet
6. Save the stealth wallet to the wallet manager

### Stealth Token Launch

1. Navigate to `/launch`
2. Fill in token details (name, symbol, description, socials)
3. Configure pre-buy: total SOL and number of stealth wallets (1-5)
4. Approve the deposit — token creation and distributed pre-buys execute
5. All stealth wallet keys are displayed and can be saved to the manager

### Wallet Manager

1. Navigate to `/wallets`
2. View all stealth wallets with live SOL and token balances
3. Actions: reveal/copy private key, sweep all assets, import external wallets
4. Follow the Phantom import instructions to access tokens in your mobile wallet

---

## Privacy Model

| What's public on-chain | What's private |
|---|---|
| User deposits SOL to relayer address | What the SOL was used to buy |
| Relayer swaps on Jupiter | Who initiated the swap |
| Stealth wallet receives tokens | Link between user wallet and stealth wallet |

An observer sees: wallet A sent SOL to relayer R. Separately, relayer R swapped SOL for token T. Separately, a new wallet S received token T. They cannot prove A and S belong to the same person.

---

## License

MIT
