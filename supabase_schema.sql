-- 1. Create a profiles table that links to auth.users
create table public.profiles (
  id uuid references auth.users(id) primary key,
  role text not null check (role in ('client', 'freelancer', 'both', 'tester')),
  display_name text,
  bio text,
  company_name text,
  portfolio_url text,
  is_kyc_verified boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile." on public.profiles for update using (auth.uid() = id);

-- Trigger to automatically create a profile on signup
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'role', 'client'), new.raw_user_meta_data->>'display_name')
  on conflict (id) do update set
    role = excluded.role,
    display_name = coalesce(excluded.display_name, public.profiles.display_name);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger to sync profile when auth metadata updates (e.g. role switch)
create or replace function public.handle_user_update()
returns trigger as $$
begin
  update public.profiles
  set 
    role = coalesce(new.raw_user_meta_data->>'role', public.profiles.role),
    display_name = coalesce(new.raw_user_meta_data->>'display_name', public.profiles.display_name)
  where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute procedure public.handle_user_update();

-- 2. Drop the old tasks table and recreate with proper UUID references & proof-of-work fields
drop table if exists public.tasks;

create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  amount numeric not null,
  status text not null default 'Available',
  freelancer_id uuid references public.profiles(id),
  client_id uuid references public.profiles(id) not null,
  contract_id text,
  github_pr_url text,
  doc_url text,
  loom_url text,
  submission_notes text,
  submitted_at timestamp with time zone,
  dispute_reason text,
  disputed_at timestamp with time zone,
  disputed_by uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable strict RLS on tasks
alter table public.tasks enable row level security;

-- Anyone authenticated can view all tasks
create policy "Authenticated users can view tasks"
  on public.tasks for select
  to authenticated
  using (true);

-- Authenticated users can create tasks (allowing pilot testers to experience client flow)
create policy "Authenticated users can create tasks"
  on public.tasks for insert
  to authenticated
  with check (auth.uid() = client_id);

-- Clients can update their own tasks, and freelancers can accept available tasks or submit proof of work
create policy "Clients and Freelancers can update their tasks"
  on public.tasks for update
  to authenticated
  using (
    auth.uid() = client_id or 
    auth.uid() = freelancer_id or 
    status = 'Available'
  );

-- 3. Backfill existing 28 auth.users into public.profiles (ensures previous registered users have profiles)
insert into public.profiles (id, role, display_name)
select 
  id, 
  coalesce(raw_user_meta_data->>'role', 'client'), 
  coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do update set
  role = excluded.role,
  display_name = coalesce(excluded.display_name, public.profiles.display_name);

