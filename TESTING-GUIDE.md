# Dara — Testing Guide

## Prerequisites

Before testing, you need:

1. **Phantom or Solflare** browser extension wallet connected to **mainnet**
2. **SOL in your wallet** — at least 0.05 SOL for testing swaps and launches
3. **Relayer wallet funded** — a separate wallet with ~0.02 SOL for gas
4. **Environment variables set** in `app/.env`:
   ```
   ANON_API_KEY=<your anoncoin api key>
   NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   NEXT_PUBLIC_RELAYER_ADDRESS=<relayer public key>
   RELAYER_PRIVATE_KEY=<relayer base58 private key>
   OPENAI_API_KEY=<openai api key>
   ```

### Setting Up the Relayer Wallet

```bash
# Generate a new keypair for the relayer
solana-keygen new --no-bip39-passphrase -o /tmp/relayer.json

# Get the public key (this is NEXT_PUBLIC_RELAYER_ADDRESS)
solana-keygen pubkey /tmp/relayer.json

# Get the base58 private key (this is RELAYER_PRIVATE_KEY)
# You can use this Node.js one-liner:
node -e "const fs=require('fs');const bs58=require('bs58');const kp=Uint8Array.from(JSON.parse(fs.readFileSync('/tmp/relayer.json')));console.log(bs58.encode(kp))"

# Fund the relayer with ~0.02 SOL from your main wallet
# (send SOL to the relayer public key via Phantom/Solflare)
```

### Start the Dev Server

```bash
cd app
npm run dev
```

Open http://localhost:3000

---

## Test 1: Landing Page

1. Open http://localhost:3000 (make sure wallet is disconnected)
2. **Verify:** Hero says "Privacy Toolkit for Solana"
3. **Verify:** Navbar says "Dara" (Da + ra in indigo)
4. **Verify:** Features section shows: Anonymous Swaps, AI Risk Analysis, Stealth Wallet Manager, Stealth Token Launch
5. **Verify:** Footer says "Dara Protocol" and "Solana Mainnet"
6. Click "Connect Wallet" — connect your Phantom/Solflare
7. **Verify:** You are redirected to `/swap`
8. **Verify:** Navbar now shows Swap, Launch, Wallets links

---

## Test 2: Anonymous Swap

### 2a: Quote + AI Analysis

1. Navigate to `/swap`
2. **Verify:** "Anonymous Swap" heading and description visible
3. In "Token Mint Address", paste a known mainnet token mint. Good test tokens:
   - USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
   - BONK: `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`
4. In "SOL Amount", enter `0.001`
5. **Verify:** After ~1 second, a quote appears showing estimated tokens received
6. **Verify:** AI Risk Analysis panel loads with a risk score, summary, and flag badges
7. **Verify:** USDC should show low risk (green). Random meme tokens may show higher risk.

### 2b: Execute Swap

1. With the quote loaded, click **"Swap Anonymously"**
2. **Verify:** Your wallet prompts you to approve a SOL transfer to the relayer address
3. Approve the transaction
4. **Verify:** Progress stepper appears: Deposit SOL → Swapping → Transfer to Stealth → Complete
5. **Verify:** Each step highlights as it progresses
6. **Verify:** On completion, a green success panel shows:
   - Stealth Public Key
   - Stealth Private Key
   - Tokens Received amount
   - "Save to Wallet Manager" button
   - "View on Solscan" link
7. Click **"Save to Wallet Manager"** — button should change to "Saved to Wallet Manager"
8. Click **"View on Solscan"** — verify the swap transaction shows the RELAYER address as the signer, NOT your wallet

### 2c: Verify Privacy

On Solscan, check:
- The swap transaction signer is the relayer wallet, not your connected wallet
- The token transfer goes to a fresh stealth wallet address
- Your connected wallet only appears in the SOL deposit transaction to the relayer

---

## Test 3: Stealth Token Launch

1. Navigate to `/launch`
2. **Verify:** 3-step wizard indicator shows step 1 highlighted

### Step 1: Token Details
3. Fill in:
   - Name: `TestToken` (or anything)
   - Symbol: `TEST`
   - Description: optional
   - Image URL: optional
   - Twitter/Telegram: optional
4. Click **"Next: Pre-Buy Config"**
5. **Verify:** Wizard advances to step 2

### Step 2: Pre-Buy Config
6. Set Total SOL: `0.01`
7. Drag slider to 2 wallets
8. **Verify:** "SOL per wallet" shows `0.0050 SOL` and "Total wallets" shows `2`
9. Click **"Launch & Pre-Buy"**
10. **Verify:** Wallet prompts SOL deposit to relayer
11. Approve the transaction
12. **Verify:** Button shows loading with "Depositing SOL..." then "Creating token & executing pre-buys..."
13. **Verify:** On completion, wizard advances to step 3 showing:
    - Mint Address with copy button
    - "View deploy tx on Solscan" link
    - 2 Pre-Buy wallet cards each showing: public key, private key, token amount
14. Click **"Save All to Wallet Manager"**
15. **Verify:** Button changes to "All Wallets Saved"

**Note:** Token creation via Anoncoin API takes a few seconds. The pre-buys require Jupiter to index the new token (3s delay built in), so this flow takes longer than a simple swap.

---

## Test 4: Stealth Wallet Manager

1. Navigate to `/wallets`
2. **Verify:** You see wallet cards from your previous swap and launch tests

### 4a: Wallet Display
3. **Verify:** Each card shows:
   - Label (e.g. "Swap EPjFW..." or "TEST Pre-Buy #1")
   - Source badge (swap / prebuy)
   - Creation date
   - Truncated public key with copy button
   - SOL balance + token balances (fetched from chain)

### 4b: Key Operations
4. Click **"Key"** on any wallet — **Verify:** Private key appears in amber box
5. Click **"Hide"** — **Verify:** Private key hidden again
6. Click **"Export"** — **Verify:** Private key copied to clipboard (check by pasting)

### 4c: Refresh Balances
7. Click the refresh (circular arrow) button in top-right
8. **Verify:** Balances reload (spinner shows during fetch)

### 4d: Import Wallet
9. Click **"Import"** button
10. **Verify:** Import panel opens with private key input + label input
11. Generate a test keypair in terminal:
    ```bash
    solana-keygen new --no-bip39-passphrase -o /tmp/test-import.json --force
    ```
    Get the base58 key and paste it
12. Enter a label like "Test Import"
13. Click **"Import"**
14. **Verify:** New wallet card appears in the grid with source "manual"

### 4e: Sweep
15. Click **"Sweep"** on a wallet that has tokens
16. **Verify:** Sweep panel appears with destination address input
17. Enter your main wallet address
18. Click **"Sweep All"**
19. **Verify:** Tokens and SOL are transferred out (check balances after refresh)

### 4f: Remove
20. Click the red trash icon on a wallet
21. **Verify:** Wallet card disappears from the grid

### 4g: Phantom Instructions
22. Scroll to bottom
23. **Verify:** "Import to Phantom Wallet" section with 5 numbered steps

---

## Test 5: Navigation

1. **Verify:** Clicking "Dara" logo → navigates to `/` (landing page)
2. **Verify:** Clicking "Swap" → navigates to `/swap`
3. **Verify:** Clicking "Launch" → navigates to `/launch`
4. **Verify:** Clicking "Wallets" → navigates to `/wallets`
5. **Verify:** Nav links only show when wallet is connected
6. **Verify:** Wallet connect/disconnect button works in navbar

---

## Common Issues

| Issue | Cause | Fix |
|---|---|---|
| "Deposit transaction not found" | RPC hasn't confirmed the deposit yet | Wait a few seconds and retry |
| Quote returns nothing | Token might not have Jupiter liquidity | Try a well-known token like USDC or BONK |
| AI analysis doesn't load | Missing OPENAI_API_KEY | Add key to .env and restart dev server |
| "RELAYER_PRIVATE_KEY not set" | Missing env var | Add the relayer private key to .env |
| Swap fails after deposit | Relayer out of SOL for gas | Fund relayer with more SOL (~0.005) |
| Launch pre-buy fails | Jupiter hasn't indexed the new token | Increase delay or retry — new tokens take time |
| Token balances show 0 | RPC rate limiting | Wait and click refresh |

---

## Minimal Test (If Low on SOL)

If you only have ~0.01 SOL to test with:

1. Test the **swap quote** and **AI analysis** (free — no transaction needed, just enter a mint and amount)
2. Test the **wallet manager** with import/export (free — no transactions)
3. Do ONE small swap with 0.001 SOL to test the full flow
4. Skip the launch test (requires more SOL for token creation + pre-buys)
