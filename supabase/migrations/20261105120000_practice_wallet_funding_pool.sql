-- Applied to Supabase project gulshfticoirrpuohdxk on 2026-11-05.
-- Fallback funding for GigPay practice wallets when Friendbot rate-limits (e.g. many testers on one Wi-Fi).
-- One top-up per signed-in account and per address. Written only by the fund-practice-wallet Edge Function
-- (service role); RLS is on with no policies, so browsers cannot read or write it.
create table if not exists public.practice_wallet_fundings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  address text not null unique check (address ~ '^G[A-Z2-7]{55}$'),
  tx_hash text,
  amount_xlm numeric not null,
  created_at timestamptz not null default now()
);
alter table public.practice_wallet_fundings enable row level security;
revoke all on public.practice_wallet_fundings from anon, authenticated;

-- The pool's Testnet secret lives in Supabase Vault (name: gigpay_testnet_pool_secret, stored separately,
-- never committed). Only the service role may read it.
create or replace function public.gigpay_testnet_pool_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'gigpay_testnet_pool_secret' limit 1;
$$;
revoke all on function public.gigpay_testnet_pool_secret() from public, anon, authenticated;
grant execute on function public.gigpay_testnet_pool_secret() to service_role;
