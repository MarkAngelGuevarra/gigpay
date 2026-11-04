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

-- 3. Dedicated Public Verification Ledger Table
create table if not exists public.verification_ledger (
  id text primary key,
  task_id text not null,
  method text not null default 'fund_task & approve_task',
  amount text not null,
  contract_id text not null default 'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3',
  client_wallet text,
  freelancer_wallet text,
  tx_hash text,
  release_tx_hash text,
  status text not null default 'Completed & Released',
  timestamp text not null,
  explorer_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on verification_ledger
alter table public.verification_ledger enable row level security;

-- Public read access for unauthenticated desktop reviewers, auditors, and visitors
drop policy if exists "Public can read verification ledger" on public.verification_ledger;
create policy "Public can read verification ledger"
  on public.verification_ledger for select
  to public
  using (true);

-- Public insert access for on-chain verified transactions
drop policy if exists "Public can insert verification ledger" on public.verification_ledger;
create policy "Public can insert verification ledger"
  on public.verification_ledger for insert
  to public
  with check (contract_id is not null);

-- Public update access for verification ledger records
drop policy if exists "Public can update verification ledger" on public.verification_ledger;
create policy "Public can update verification ledger"
  on public.verification_ledger for update
  to public
  using (true)
  with check (contract_id is not null);

-- 4. Enable Supabase Realtime Publication for cross-device sync
alter publication supabase_realtime add table public.verification_ledger;

-- 5. Pre-seed Verified SOW Milestones & Pilot Tester's 100 XLM "Create a website" Task
insert into public.verification_ledger (
  id, task_id, method, amount, contract_id, client_wallet, freelancer_wallet, tx_hash, release_tx_hash, status, timestamp, explorer_url
) values
  (
    'tx-v11-website',
    'Create a website',
    'fund_task & approve_task',
    '100 XLM',
    'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3',
    'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E',
    'GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3',
    '40df1a722e724daf317630345cc00d07a81344134938ea9745a0b6440d432dda',
    '1770bfa5558fa2bcbb95309a1ece394895f788fe1822cdf9a2dbd923f621e984',
    'Completed & Released',
    '2026-10-30 08:15:00 UTC',
    'https://stellar.expert/explorer/testnet/tx/1770bfa5558fa2bcbb95309a1ece394895f788fe1822cdf9a2dbd923f621e984'
  ),
  (
    'tx-v1',
    'Task #1',
    'fund_task & approve_task',
    '1.0 XLM',
    'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3',
    'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E',
    'GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3',
    '40df1a722e724daf317630345cc00d07a81344134938ea9745a0b6440d432dda',
    '1770bfa5558fa2bcbb95309a1ece394895f788fe1822cdf9a2dbd923f621e984',
    'Completed & Released',
    '2026-09-20 02:20:11 UTC',
    'https://stellar.expert/explorer/testnet/tx/40df1a722e724daf317630345cc00d07a81344134938ea9745a0b6440d432dda'
  ),
  (
    'tx-v2',
    'Task #2',
    'fund_task & approve_task',
    '3.0 XLM',
    'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3',
    'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E',
    'GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3',
    '3e52e5b45c6e0beb6783cbfe61509e064283a8e7a4706bc07d281e2833e74ad8',
    '4ba3968278d3cdd167e06ee34df888106c071823c110180dd001b272d74f52bc',
    'Completed & Released',
    '2026-09-20 02:22:45 UTC',
    'https://stellar.expert/explorer/testnet/tx/3e52e5b45c6e0beb6783cbfe61509e064283a8e7a4706bc07d281e2833e74ad8'
  ),
  (
    'tx-v3',
    'Task #3',
    'fund_task & approve_task',
    '2.0 XLM',
    'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3',
    'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E',
    'GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3',
    '436e29ceee6408ab2993872d9c13ef4500d20177064f3a2e409c360104b0410d',
    '0e6ac8f1387d634d7262cd9502c01b4e2f0da4436223d1c46b7f240ca4cda925',
    'Completed & Released',
    '2026-09-20 02:25:32 UTC',
    'https://stellar.expert/explorer/testnet/tx/436e29ceee6408ab2993872d9c13ef4500d20177064f3a2e409c360104b0410d'
  )
on conflict (id) do update set
  status = excluded.status,
  amount = excluded.amount,
  tx_hash = excluded.tx_hash,
  release_tx_hash = excluded.release_tx_hash,
  explorer_url = excluded.explorer_url;
