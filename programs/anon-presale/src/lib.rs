use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Hd5LcuhcSQ7aHqoyGhJSS6dokyptfBhNJXTvDQhfhxkj");

#[program]
pub mod anon_presale {
    use super::*;

    pub fn initialize_presale(
        ctx: Context<InitializePresale>,
        hard_cap: u64,
        tokens_for_sale: u64,
        start_time: i64,
        end_time: i64,
    ) -> Result<()> {
        require!(end_time > start_time, PresaleError::InvalidTimeRange);
        require!(hard_cap > 0, PresaleError::InvalidAmount);
        require!(tokens_for_sale > 0, PresaleError::InvalidAmount);

        let presale = &mut ctx.accounts.presale;
        presale.creator = ctx.accounts.creator.key();
        presale.mint = ctx.accounts.mint.key();
        presale.total_sol_committed = 0;
        presale.hard_cap = hard_cap;
        presale.tokens_for_sale = tokens_for_sale;
        presale.start_time = start_time;
        presale.end_time = end_time;
        presale.is_finalized = false;
        presale.commitment_count = 0;
        presale.bump = ctx.bumps.presale;
        presale.vault_auth_bump = ctx.bumps.vault_authority;

        // Transfer tokens from creator to token vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.creator_token_account.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            tokens_for_sale,
        )?;

        msg!("Presale initialized: hard_cap={}, tokens={}", hard_cap, tokens_for_sale);
        Ok(())
    }

    pub fn commit_to_presale(
        ctx: Context<CommitToPresale>,
        commitment_hash: [u8; 32],
        sol_amount: u64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let presale = &ctx.accounts.presale;

        require!(clock.unix_timestamp >= presale.start_time, PresaleError::NotStarted);
        require!(clock.unix_timestamp <= presale.end_time, PresaleError::Ended);
        require!(!presale.is_finalized, PresaleError::AlreadyFinalized);
        require!(sol_amount > 0, PresaleError::InvalidAmount);
        require!(
            presale.total_sol_committed.checked_add(sol_amount).unwrap() <= presale.hard_cap,
            PresaleError::HardCapExceeded
        );

        // Transfer SOL from participant (burner wallet) to the presale PDA
        // The presale PDA is program-owned, so we can debit it later
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.participant.to_account_info(),
                    to: ctx.accounts.presale.to_account_info(),
                },
            ),
            sol_amount,
        )?;

        // Update presale state
        let presale = &mut ctx.accounts.presale;
        presale.total_sol_committed = presale.total_sol_committed.checked_add(sol_amount).unwrap();
        presale.commitment_count = presale.commitment_count.checked_add(1).unwrap();

        // Initialize commitment
        let commitment = &mut ctx.accounts.commitment;
        commitment.presale = presale.key();
        commitment.commitment_hash = commitment_hash;
        commitment.sol_amount = sol_amount;
        commitment.is_claimed = false;
        commitment.bump = ctx.bumps.commitment;

        msg!("Commitment added: sol={}, count={}", sol_amount, presale.commitment_count);
        Ok(())
    }

    pub fn finalize_presale(ctx: Context<FinalizePresale>) -> Result<()> {
        let clock = Clock::get()?;
        let presale = &ctx.accounts.presale;

        require!(!presale.is_finalized, PresaleError::AlreadyFinalized);
        require!(
            clock.unix_timestamp > presale.end_time
                || presale.total_sol_committed >= presale.hard_cap,
            PresaleError::PresaleStillActive
        );

        // Calculate how much SOL to transfer (total committed minus rent-exempt minimum)
        let presale_info = ctx.accounts.presale.to_account_info();
        let presale_lamports = presale_info.lamports();
        let rent = Rent::get()?;
        let data_len = presale_info.data_len();
        let rent_exempt = rent.minimum_balance(data_len);
        let transfer_amount = presale_lamports.saturating_sub(rent_exempt);

        if transfer_amount > 0 {
            **presale_info.try_borrow_mut_lamports()? -= transfer_amount;
            **ctx.accounts.creator.to_account_info().try_borrow_mut_lamports()? += transfer_amount;
        }

        let presale = &mut ctx.accounts.presale;
        presale.is_finalized = true;

        msg!("Presale finalized: total_sol={}, transferred={}", presale.total_sol_committed, transfer_amount);
        Ok(())
    }

    pub fn claim_tokens(ctx: Context<ClaimTokens>, secret: [u8; 32]) -> Result<()> {
        let presale = &ctx.accounts.presale;
        let commitment = &ctx.accounts.commitment;

        require!(presale.is_finalized, PresaleError::NotFinalized);
        require!(!commitment.is_claimed, PresaleError::AlreadyClaimed);

        // Verify: hash(secret || claim_wallet) == commitment_hash
        let claim_wallet_key = ctx.accounts.claim_wallet.key();
        let mut hash_input = Vec::with_capacity(64);
        hash_input.extend_from_slice(&secret);
        hash_input.extend_from_slice(claim_wallet_key.as_ref());
        let computed = anchor_lang::solana_program::hash::hash(&hash_input);

        require!(
            computed.to_bytes() == commitment.commitment_hash,
            PresaleError::InvalidProof
        );

        // Calculate pro-rata token amount
        let tokens_owed = (commitment.sol_amount as u128)
            .checked_mul(presale.tokens_for_sale as u128)
            .unwrap()
            .checked_div(presale.total_sol_committed as u128)
            .unwrap() as u64;

        require!(tokens_owed > 0, PresaleError::InvalidAmount);

        // Transfer tokens from vault to claim wallet's token account
        let presale_key = ctx.accounts.presale.key();
        let seeds = &[
            b"vault_auth".as_ref(),
            presale_key.as_ref(),
            &[presale.vault_auth_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.claim_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            tokens_owed,
        )?;

        // Mark claimed
        let commitment = &mut ctx.accounts.commitment;
        commitment.is_claimed = true;

        msg!("Claimed {} tokens to {}", tokens_owed, claim_wallet_key);
        Ok(())
    }
}

// ─── Account Structs ───

#[account]
pub struct Presale {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub total_sol_committed: u64,
    pub hard_cap: u64,
    pub tokens_for_sale: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub is_finalized: bool,
    pub commitment_count: u32,
    pub bump: u8,
    pub vault_auth_bump: u8,
}

#[account]
pub struct Commitment {
    pub presale: Pubkey,
    pub commitment_hash: [u8; 32],
    pub sol_amount: u64,
    pub is_claimed: bool,
    pub bump: u8,
}

// ─── Instruction Accounts ───

#[derive(Accounts)]
pub struct InitializePresale<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 4 + 1 + 1 + 64,
        seeds = [b"presale", mint.key().as_ref(), creator.key().as_ref()],
        bump
    )]
    pub presale: Account<'info, Presale>,

    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = vault_authority,
        seeds = [b"token_vault", presale.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for token vault, validated by seeds
    #[account(
        seeds = [b"vault_auth", presale.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(commitment_hash: [u8; 32])]
pub struct CommitToPresale<'info> {
    #[account(mut)]
    pub participant: Signer<'info>,

    #[account(mut)]
    pub presale: Account<'info, Presale>,

    #[account(
        init,
        payer = participant,
        space = 8 + 32 + 32 + 8 + 1 + 1 + 32,
        seeds = [b"commitment", presale.key().as_ref(), &commitment_hash],
        bump
    )]
    pub commitment: Account<'info, Commitment>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizePresale<'info> {
    #[account(
        mut,
        constraint = creator.key() == presale.creator @ PresaleError::Unauthorized
    )]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub presale: Account<'info, Presale>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(secret: [u8; 32])]
pub struct ClaimTokens<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    pub presale: Account<'info, Presale>,

    #[account(
        mut,
        constraint = commitment.presale == presale.key() @ PresaleError::InvalidCommitment
    )]
    pub commitment: Account<'info, Commitment>,

    /// CHECK: The wallet receiving tokens, verified via commitment hash in instruction logic
    pub claim_wallet: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"token_vault", presale.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority, validated by seeds
    #[account(
        seeds = [b"vault_auth", presale.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = claimer,
        associated_token::mint = mint,
        associated_token::authority = claim_wallet,
    )]
    pub claim_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ─── Errors ───

#[error_code]
pub enum PresaleError {
    #[msg("Presale has not started yet")]
    NotStarted,
    #[msg("Presale has ended")]
    Ended,
    #[msg("Presale is already finalized")]
    AlreadyFinalized,
    #[msg("Hard cap would be exceeded")]
    HardCapExceeded,
    #[msg("Presale is still active")]
    PresaleStillActive,
    #[msg("Presale not finalized yet")]
    NotFinalized,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Invalid proof - secret does not match commitment")]
    InvalidProof,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid time range")]
    InvalidTimeRange,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid commitment")]
    InvalidCommitment,
}
