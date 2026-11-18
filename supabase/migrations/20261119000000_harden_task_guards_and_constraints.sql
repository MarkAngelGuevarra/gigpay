-- Harden tasks and profiles schema constraints, RLS policies, and insert/update triggers.

alter table public.tasks drop constraint if exists tasks_amount_positive;
alter table public.tasks add constraint tasks_amount_positive
  check (amount > 0 and amount <= 1000000000 and amount <> 'NaN'::numeric and amount <> 'Infinity'::numeric) not valid;

alter table public.tasks drop constraint if exists tasks_status_valid;
alter table public.tasks add constraint tasks_status_valid
  check (status in ('Confirming', 'Failed', 'Available', 'In Progress', 'Under Review', 'Disputed', 'Completed', 'Paid')) not valid;

alter table public.tasks drop constraint if exists tasks_github_pr_url_https;
alter table public.tasks add constraint tasks_github_pr_url_https
  check (github_pr_url is null or github_pr_url ~* '^https://[^[:space:]]+$') not valid;

alter table public.tasks drop constraint if exists tasks_doc_url_https;
alter table public.tasks add constraint tasks_doc_url_https
  check (doc_url is null or doc_url ~* '^https://[^[:space:]]+$') not valid;

alter table public.tasks drop constraint if exists tasks_loom_url_https;
alter table public.tasks add constraint tasks_loom_url_https
  check (loom_url is null or loom_url ~* '^https://[^[:space:]]+$') not valid;

alter table public.tasks drop constraint if exists tasks_explorer_url_https;
alter table public.tasks add constraint tasks_explorer_url_https
  check (
    explorer_url is null
    or explorer_url ~* '^https://[^[:space:]]+$'
    or explorer_url ~* '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?/[^[:space:]]*$'
  ) not valid;

-- Lock profiles.role once set so non-simulation users cannot escalate or flip roles in SQL.
create or replace function public.enforce_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.is_kyc_verified is distinct from old.is_kyc_verified then
    raise exception 'GigPay: this profile field cannot be changed by the user' using errcode = '42501';
  end if;
  if new.role not in ('client', 'freelancer')
     or (old.role is not null and new.role is distinct from old.role) then
    raise exception 'GigPay: profile role cannot be changed after registration' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop policy if exists "Clients can create tasks" on public.tasks;
create policy "Clients can create tasks"
  on public.tasks for insert
  to authenticated
  with check (
    auth.uid() = client_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'client'
    )
  );

drop policy if exists "Clients and Freelancers can update their tasks" on public.tasks;
create policy "Clients and Freelancers can update their tasks"
  on public.tasks for update
  to authenticated
  using (
    auth.uid() = client_id
    or auth.uid() = freelancer_id
    or (
      status = 'Available'
      and freelancer_id is null
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'freelancer'
      )
    )
  );

create or replace function public.enforce_task_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return new;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'client'
  ) then
    raise exception 'GigPay: only client accounts can create tasks' using errcode = '42501';
  end if;

  if new.client_id is distinct from uid
     or new.status not in ('Confirming', 'Available')
     or new.freelancer_id is not null
     or new.release_tx_hash is not null
     or new.completed_at is not null
     or new.disputed_at is not null
     or new.disputed_by is not null
     or new.dispute_reason is not null
     or new.dispute_resolved_at is not null
     or coalesce(new.proof_attached, false)
     or new.submitted_at is not null
     or new.github_pr_url is not null
     or new.doc_url is not null
     or new.loom_url is not null
     or new.submission_notes is not null
     or (new.client_wallet is not null and new.freelancer_wallet is not null and new.client_wallet = new.freelancer_wallet) then
    raise exception 'GigPay: invalid initial escrow task fields' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_task_insert on public.tasks;
create trigger enforce_task_insert
  before insert on public.tasks
  for each row execute function public.enforce_task_insert();

create or replace function public.enforce_task_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_client_role boolean := false;
  is_freelancer_role boolean := false;
begin
  -- Service-role and maintenance writes without a signed-in user are unrestricted.
  if uid is null then
    return new;
  end if;

  -- Immutable identity, price, and write-once escrow bindings.
  if new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.amount is distinct from old.amount
     or new.created_at is distinct from old.created_at
     or (old.on_chain_task_id is not null and new.on_chain_task_id is distinct from old.on_chain_task_id)
     or (old.client_wallet is not null and new.client_wallet is distinct from old.client_wallet)
     or (old.freelancer_wallet is not null and new.freelancer_wallet is distinct from old.freelancer_wallet)
     or (old.tx_hash is not null and new.tx_hash is distinct from old.tx_hash)
     or (old.contract_id is not null and new.contract_id is distinct from old.contract_id)
     or (old.release_tx_hash is not null and new.release_tx_hash is distinct from old.release_tx_hash)
     or (old.completed_at is not null and new.completed_at is distinct from old.completed_at) then
    raise exception 'GigPay: escrow fields cannot be changed' using errcode = '42501';
  end if;

  -- A released task stays released. The assigned freelancer may attach initial proof only once if missing.
  if old.status in ('Completed', 'Paid') then
    if uid = old.freelancer_id and new.status = 'Under Review' then
      new.status := old.status;
    elsif new.status is distinct from old.status then
      raise exception 'GigPay: a released task cannot change status' using errcode = '42501';
    end if;
    if uid <> old.client_id and coalesce(old.proof_attached, false) then
      if new.github_pr_url is distinct from old.github_pr_url
         or new.doc_url is distinct from old.doc_url
         or new.loom_url is distinct from old.loom_url
         or new.submission_notes is distinct from old.submission_notes
         or new.submitted_at is distinct from old.submitted_at
         or new.proof_attached is distinct from old.proof_attached then
        raise exception 'GigPay: proof of a completed task cannot be overwritten' using errcode = '42501';
      end if;
    end if;
  end if;

  -- Client owner path.
  if old.client_id is not null and uid = old.client_id then
    select (p.role = 'client') into is_client_role from public.profiles p where p.id = uid;
    if not coalesce(is_client_role, false) then
      raise exception 'GigPay: client role required to manage escrow' using errcode = '42501';
    end if;

    if (old.freelancer_id is not null and new.freelancer_id is distinct from old.freelancer_id)
       or new.freelancer_id = old.client_id then
      raise exception 'GigPay: the assigned freelancer cannot be changed' using errcode = '42501';
    end if;

    -- Client cannot alter freelancer deliverables or proof fields.
    if new.github_pr_url is distinct from old.github_pr_url
       or new.doc_url is distinct from old.doc_url
       or new.loom_url is distinct from old.loom_url
       or new.submission_notes is distinct from old.submission_notes
       or new.submitted_at is distinct from old.submitted_at
       or new.proof_attached is distinct from old.proof_attached then
      raise exception 'GigPay: client cannot alter freelancer proof' using errcode = '42501';
    end if;

    if old.status = 'Confirming' and new.status not in ('Confirming', 'Available', 'Failed') then
      raise exception 'GigPay: confirming escrow can only become Available or Failed' using errcode = '42501';
    elsif old.status = 'Failed' and new.status not in ('Failed', 'Available') then
      raise exception 'GigPay: failed escrow cannot advance directly' using errcode = '42501';
    elsif old.status = 'Available' and new.status <> 'Available' then
      raise exception 'GigPay: client cannot bypass freelancer acceptance' using errcode = '42501';
    elsif old.status = 'Disputed' then
      if new.status in ('Completed', 'Paid') then
        raise exception 'GigPay: resolve the dispute before releasing payment' using errcode = '42501';
      elsif new.status in ('In Progress', 'Under Review') then
        if new.dispute_resolved_at is null
           or (old.disputed_at is not null and new.dispute_resolved_at <= old.disputed_at) then
          raise exception 'GigPay: dispute resolution timestamp must follow dispute time' using errcode = '42501';
        end if;
      elsif new.status <> 'Disputed' then
        raise exception 'GigPay: invalid status transition from Disputed' using errcode = '42501';
      end if;
    elsif old.status in ('In Progress', 'Under Review')
       and new.status not in ('In Progress', 'Under Review', 'Disputed', 'Completed', 'Paid') then
      raise exception 'GigPay: invalid client status transition' using errcode = '42501';
    end if;

    return new;
  end if;

  select (p.role = 'freelancer') into is_freelancer_role from public.profiles p where p.id = uid;
  if not coalesce(is_freelancer_role, false) then
    raise exception 'GigPay: freelancer role required for task actions' using errcode = '42501';
  end if;

  -- Freelancers cannot alter task title or populate/change escrow metadata fields even if null.
  if new.title is distinct from old.title
     or new.on_chain_task_id is distinct from old.on_chain_task_id
     or new.client_wallet is distinct from old.client_wallet
     or new.freelancer_wallet is distinct from old.freelancer_wallet
     or new.tx_hash is distinct from old.tx_hash
     or new.contract_id is distinct from old.contract_id
     or new.explorer_url is distinct from old.explorer_url then
    raise exception 'GigPay: only the client can update escrow metadata' using errcode = '42501';
  end if;

  -- Freelancer acceptance vs proof submission path.
  if old.freelancer_id is null then
    if not (old.status = 'Available' and new.freelancer_id = uid and new.status = 'In Progress') then
      raise exception 'GigPay: a freelancer can only accept an available task for themselves' using errcode = '42501';
    end if;
    if new.github_pr_url is distinct from old.github_pr_url
       or new.doc_url is distinct from old.doc_url
       or new.loom_url is distinct from old.loom_url
       or new.submission_notes is distinct from old.submission_notes
       or new.submitted_at is distinct from old.submitted_at
       or new.proof_attached is distinct from old.proof_attached then
      raise exception 'GigPay: proof fields cannot be set while accepting a task' using errcode = '42501';
    end if;
  elsif old.freelancer_id <> uid then
    raise exception 'GigPay: this task belongs to another freelancer' using errcode = '42501';
  else
    if new.freelancer_id is distinct from old.freelancer_id
       or old.status in ('Confirming', 'Failed', 'Available', 'Disputed')
       or (old.status = 'Under Review' and new.status = 'In Progress')
       or new.status not in ('In Progress', 'Under Review', 'Completed', 'Paid')
       or (new.status in ('Completed', 'Paid') and new.status is distinct from old.status) then
      raise exception 'GigPay: a freelancer cannot set this status' using errcode = '42501';
    end if;
  end if;

  -- Client-only release and dispute fields.
  if new.release_tx_hash is distinct from old.release_tx_hash
     or new.completed_at is distinct from old.completed_at
     or new.dispute_reason is distinct from old.dispute_reason
     or new.disputed_at is distinct from old.disputed_at
     or new.disputed_by is distinct from old.disputed_by
     or new.dispute_resolved_at is distinct from old.dispute_resolved_at then
    raise exception 'GigPay: only the client can release or dispute' using errcode = '42501';
  end if;

  return new;
end;
$$;
