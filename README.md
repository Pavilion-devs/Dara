# AnonPresale Protocol

Privacy-preserving token presale platform on Solana. Commit SOL anonymously via burner wallets, claim tokens to an unlinked wallet. On-chain observers cannot connect your deposit to your claim.

**Network:** Solana Devnet
**Program ID:** `Hd5LcuhcSQ7aHqoyGhJSS6dokyptfBhNJXTvDQhfhxkj`

---

## How It Works

AnonPresale uses a **commit-reveal scheme** to break the on-chain link between depositors and token claimers:

```
1. GENERATE  →  Fresh burner keypair created in browser
2. COMMIT    →  Burner deposits SOL + SHA-256(secret || claim_wallet) on-chain
3. FINALIZE  →  Creator ends presale, withdraws raised SOL
4. CLAIM     →  Reveal secret → program verifies hash → tokens sent to claim wallet
```

The commitment hash `SHA-256(secret || claim_wallet_pubkey)` is stored on-chain during deposit. Since the hash is one-way, observers cannot derive the claim wallet from the commitment. At claim time, the user reveals the secret and claim wallet — the program recomputes the hash to verify, then sends pro-rata tokens to the claim wallet.

**Result:** The burner wallet that deposited SOL and the wallet that receives tokens are cryptographically unlinkable on-chain.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Next.js Frontend (React 19 + Tailwind CSS 4)       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Landing   │  │ Create   │  │ Presale Detail    │  │
│  │ /         │  │ /create  │  │ /presale/[id]     │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│         │              │               │             │
│         └──────────────┼───────────────┘             │
│                        │                             │
│              Wallet Adapter (Phantom, Solflare)      │
│              Burner Keypair (browser-generated)      │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  Solana Devnet — Anchor Program (anon_presale)      │
│                                                     │
│  initialize_presale  →  Create presale + token vault│
│  commit_to_presale   →  Burner deposits SOL + hash  │
│  finalize_presale    →  Creator withdraws SOL       │
│  claim_tokens        →  Verify secret, send tokens  │
│                                                     │
│  PDAs:                                              │
│  • Presale      ["presale", mint, creator]          │
│  • Commitment   ["commitment", presale, hash]       │
│  • TokenVault   ["token_vault", presale]            │
│  • VaultAuth    ["vault_auth", presale]             │
└─────────────────────────────────────────────────────┘
```

---

## Features

- **Anonymous Commits** — Burner wallets with commitment hashes. No identity leak on-chain.
- **Commit-Reveal Privacy** — SHA-256 binding between secret and claim wallet. Unlinkable deposits and claims.
- **Pro-Rata Distribution** — Tokens distributed proportionally to each participant's SOL contribution.
- **Hard Cap Enforcement** — On-chain constraint prevents exceeding the presale cap.
- **Time-Bounded Presales** — Start/end times enforced by the program. Live countdown in the UI.
- **Double-Claim Protection** — Each commitment can only be claimed once (on-chain `is_claimed` flag).
- **Burner Wallet Management** — Generate, fund, and use burner keypairs entirely in the browser.
- **Data Persistence** — Presale metadata stored server-side in JSON. On-chain data fetched directly from Solana.

---

## On-Chain Program

Built with **Anchor 0.31.1**. Four instructions:

| Instruction | Signer | Description |
|---|---|---|
| `initialize_presale` | Creator | Sets hard cap, token allocation, time window. Transfers tokens into vault PDA. |
| `commit_to_presale` | Burner (participant) | Deposits SOL + commitment hash into presale PDA. Creates Commitment account. |
| `finalize_presale` | Creator | Ends presale after time expires or hard cap reached. Transfers raised SOL to creator. |
| `claim_tokens` | Any wallet | Reveals secret to prove ownership of commitment. Tokens sent to claim wallet's ATA. |

### Account Structures

**Presale** — stores presale configuration and state:
- `creator`, `mint`, `hard_cap`, `tokens_for_sale`
- `start_time`, `end_time`, `total_sol_committed`
- `is_finalized`, `commitment_count`

**Commitment** — stores each anonymous deposit:
- `presale`, `commitment_hash` (32 bytes), `sol_amount`
- `is_claimed`, `bump`

### Error Codes

| Code | Name | Trigger |
|---|---|---|
| 6000 | NotStarted | Commit before start_time |
| 6001 | Ended | Commit after end_time |
| 6002 | AlreadyFinalized | Action on finalized presale |
| 6003 | HardCapExceeded | Commit would exceed cap |
| 6004 | PresaleStillActive | Finalize before end/cap |
| 6005 | NotFinalized | Claim before finalization |
| 6006 | AlreadyClaimed | Double claim attempt |
| 6007 | InvalidProof | Wrong secret for commitment |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Rust, Anchor 0.31.1, anchor-spl (associated_token) |
| Frontend | Next.js 16.1.1, React 19, Tailwind CSS 4 |
| Wallet | @solana/wallet-adapter (Phantom, Solflare, Backpack) |
| Crypto | @noble/hashes (SHA-256), bs58 |
| Solana | @solana/web3.js 1.98, @coral-xyz/anchor 0.32.1 |
| Network | Solana Devnet |

---

## Project Structure

```
anoncoin/
├── programs/anon-presale/
│   └── src/lib.rs                  # Anchor program (4 instructions, 2 accounts)
├── tests/
│   └── anon-presale.ts             # 10 integration tests (full lifecycle)
├── app/
│   ├── src/app/
│   │   ├── page.tsx                # Landing page
│   │   ├── layout.tsx              # Root layout + wallet providers
│   │   ├── dashboard/page.tsx      # Presale list + wallet info
│   │   ├── create/page.tsx         # Token creation + presale setup wizard
│   │   ├── presale/[id]/page.tsx   # Presale detail + commit/claim UI
│   │   └── api/
│   │       ├── presales/route.ts   # Presale metadata CRUD
│   │       └── create-token/route.ts # Anoncoin API proxy
│   ├── src/components/
│   │   ├── navbar.tsx
│   │   ├── wallet-button.tsx
│   │   └── wallet-provider.tsx
│   ├── src/hooks/
│   │   └── useProgram.ts           # Anchor program hook
│   └── src/lib/
│       ├── program.ts              # Program ID + PDA helpers
│       ├── idl.json                # Generated IDL
│       └── burner.ts               # Burner keypair + hash utilities
├── Anchor.toml
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Rust + Cargo
- Solana CLI (`solana`, `spl-token`)
- Anchor CLI 0.31.1

### 1. Clone and Install

```bash
cd anoncoin
yarn install
cd app && npm install && cd ..
```

### 2. Configure Solana CLI

```bash
solana config set --url devnet
solana airdrop 5
```

### 3. Build and Deploy Program

```bash
anchor build
anchor deploy
```

The program is already deployed at `Hd5LcuhcSQ7aHqoyGhJSS6dokyptfBhNJXTvDQhfhxkj`.

### 4. Run Tests

```bash
anchor test --skip-local-validator
```

All 10 tests pass — covering initialization, commits, hard cap enforcement, finalization, claims, double-claim prevention, and invalid proof rejection.

### 5. Start Frontend

```bash
cd app
npm run dev
```

Open `http://localhost:3000` and connect a Solana wallet (Phantom or Solflare) on devnet.

---

## Usage Flow

### Creating a Presale

1. Navigate to `/create`
2. Select **"Use Existing Mint"** and enter your SPL token mint address
3. Configure: token name, symbol, hard cap (SOL), tokens for sale, duration
4. Click **Initialize Anonymous Presale** and approve the transaction

### Committing SOL (Anonymous)

1. Open the presale detail page
2. Enter a **fresh claim wallet address** (not your connected wallet)
3. Set the SOL amount and click **Generate Burner Wallet**
4. Click **Fund Burner** to send SOL from your main wallet to the burner
5. Click **Commit Anonymously** — the burner signs the transaction

At this point, the on-chain record shows: *burner wallet X deposited Y SOL with hash Z*. No link to your main wallet or claim wallet.

### Claiming Tokens

1. After the presale is finalized, the claim section appears
2. Click **Auto-fill secret & claim wallet** (or enter manually)
3. Click **Claim Tokens** — tokens are sent to your claim wallet

The program verifies `SHA-256(secret || claim_wallet) == stored_hash`, then transfers pro-rata tokens. The claim wallet receives tokens with no on-chain link to the depositing burner.

---

## Privacy Model

| What's public on-chain | What's private |
|---|---|
| Burner wallet address | Link between burner and main wallet |
| SOL amount committed | Link between burner and claim wallet |
| Commitment hash (opaque) | The secret (stored in browser only) |
| Claim wallet received tokens | Who owns the claim wallet |

**Threat model:** An observer watching the blockchain sees burner A deposited SOL, and later wallet B received tokens. They cannot prove A and B belong to the same person — the commitment hash is a one-way function, and the secret never appears on-chain until claim time (at which point it only proves the mathematical relationship, not identity).

---

## Tests

10 integration tests verify the full lifecycle:

```
  anon-presale
    ✓ Initializes a presale
    ✓ Burner wallet commits SOL to presale
    ✓ Cannot commit more than hard cap
    ✓ Cannot finalize before end time (cap not reached)
    ✓ Cannot claim before finalization
    ✓ Second burner commits to reach hard cap
    ✓ Creator finalizes presale (hard cap reached)
    ✓ Participant claims tokens with secret (anonymous claim)
    ✓ Cannot double-claim
    ✓ Wrong secret fails verification
```

---

## License

MIT
# Baserk
