-- =========================================================================
-- GIGPAY CORE SUPABASE SCHEMA & CROSS-DEVICE PERSISTENCE MIGRATION
-- Supports: Soroban Milestone Escrow, Verification Ledger, Proof-of-Work,
--           Dispute Resolution, and Multi-Client Realtime Sync
-- =========================================================================

-- 1. Create a profiles table that links to auth.users
create table if not exists public.profiles (
  id uuid references auth.users(id) primary key,
  role text not null check (role in ('client', 'freelancer')),
  display_name text,
  bio text,
  company_name text,
  portfolio_url text,
  is_kyc_verified boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
drop policy if exists "Users can update their own profile." on public.profiles;
create policy "Users can update their own profile." on public.profiles for update using (auth.uid() = id);

-- Trigger to automatically create a profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, new.raw_user_meta_data->>'role', new.raw_user_meta_data->>'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Tasks table with proper UUID references and Escrow columns
create table if not exists public.tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  amount numeric not null,
  status text not null default 'Available',
  freelancer_id uuid references public.profiles(id),
  client_id uuid references public.profiles(id),
  contract_id text,
  tx_hash text,
  release_tx_hash text,
  explorer_url text,
  -- Escrow identity: u32 id returned by fund_task, and the wallets the escrow actually uses
  on_chain_task_id bigint,
  client_wallet text,
  freelancer_wallet text,
  github_pr_url text,
  doc_url text,
  loom_url text,
  submission_notes text,
  submitted_at timestamp with time zone,
  proof_attached boolean default false,
  dispute_reason text,
  disputed_at timestamp with time zone,
  disputed_by text,
  dispute_resolved_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Augment existing tasks table if it already exists
alter table public.tasks add column if not exists tx_hash text;
alter table public.tasks add column if not exists release_tx_hash text;
alter table public.tasks add column if not exists explorer_url text;
alter table public.tasks add column if not exists client_wallet text;
alter table public.tasks add column if not exists freelancer_wallet text;
alter table public.tasks add column if not exists github_pr_url text;
alter table public.tasks add column if not exists doc_url text;
alter table public.tasks add column if not exists loom_url text;
alter table public.tasks add column if not exists submission_notes text;
alter table public.tasks add column if not exists submitted_at timestamp with time zone;
alter table public.tasks add column if not exists proof_attached boolean default false;
alter table public.tasks add column if not exists dispute_reason text;
alter table public.tasks add column if not exists disputed_at timestamp with time zone;
alter table public.tasks add column if not exists disputed_by text;
alter table public.tasks add column if not exists dispute_resolved_at timestamp with time zone;
alter table public.tasks add column if not exists on_chain_task_id bigint;

-- Migration add_task_escrow_identity_columns (applied to production 2026-11-04):
-- only real values may be stored, so placeholder/demo keys can never pass as user wallets.
alter table public.tasks drop constraint if exists tasks_on_chain_task_id_u32;
alter table public.tasks add constraint tasks_on_chain_task_id_u32
  check (on_chain_task_id is null or (on_chain_task_id between 1 and 4294967295));
alter table public.tasks drop constraint if exists tasks_client_wallet_stellar;
alter table public.tasks add constraint tasks_client_wallet_stellar
  check (client_wallet is null or client_wallet ~ '^G[A-Z2-7]{55}$');
alter table public.tasks drop constraint if exists tasks_freelancer_wallet_stellar;
alter table public.tasks add constraint tasks_freelancer_wallet_stellar
  check (freelancer_wallet is null or freelancer_wallet ~ '^G[A-Z2-7]{55}$');

-- Allow nullable client_id for demo/testnet simulation accounts
alter table public.tasks alter column client_id drop not null;

-- Enable strict RLS on tasks
alter table public.tasks enable row level security;

-- Public can view tasks (for public verification, audit, and landing page)
drop policy if exists "Public can view tasks" on public.tasks;
create policy "Public can view tasks"
  on public.tasks for select
  to public
  using (true);

drop policy if exists "Authenticated users can view tasks" on public.tasks;
create policy "Authenticated users can view tasks"
  on public.tasks for select
  to authenticated
  using (true);

-- Clients can create tasks
drop policy if exists "Clients can create tasks" on public.tasks;
create policy "Clients can create tasks"
  on public.tasks for insert
  to authenticated
  with check (auth.uid() = client_id or client_id is null);

-- Clients and Freelancers can update their tasks
drop policy if exists "Clients and Freelancers can update their tasks" on public.tasks;
create policy "Clients and Freelancers can update their tasks"
  on public.tasks for update
  to authenticated
  using (
    auth.uid() = client_id or 
    (auth.uid() = freelancer_id) or 
    (status = 'Available') or
    client_id is null
  );

-- 3. Public verification ledger
-- The ledger is generated from Stellar Testnet itself (scripts/index_escrows.mjs -> EVIDENCE_TABLE.md and
-- src/data/onchainEscrows.json), never typed in. An earlier version of this file created a
-- public.verification_ledger table with anonymous insert/update policies and seeded it with rows that mixed
-- hashes and amounts from different escrows. The app never used it and it does not exist in production, so
-- it was removed (Nov 6, 2026).
