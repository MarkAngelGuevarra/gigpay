-- Applied to Supabase project gulshfticoirrpuohdxk on 2026-11-12.
-- GigPay: a task released on-chain stays Completed.
-- At BCC Day 1 a client released escrow #55 and the freelancer submitted proof 33 seconds later from a
-- Data correction applied the same day (service role): escrow #55, released on-chain in tx 629d2afe…cc9f9,
-- had been set back to Under Review by the late proof write; its status was set to Completed.
-- phone that still showed the task In Progress; the proof write set the status back to Under Review.
-- Now: once a task is Completed (or Paid), nobody can change its status. A freelancer may still attach
-- proof to it; the status simply stays Completed.
create or replace function public.enforce_task_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  -- Dashboard / service-role writes (no signed-in user) are not restricted.
  if uid is null then
    return new;
  end if;

  -- Fields nobody may change after creation, or once they are set.
  if new.client_id is distinct from old.client_id
     or new.amount is distinct from old.amount
     or new.created_at is distinct from old.created_at
     or (old.on_chain_task_id is not null and new.on_chain_task_id is distinct from old.on_chain_task_id)
     or (old.client_wallet is not null and new.client_wallet is distinct from old.client_wallet)
     or (old.freelancer_wallet is not null and new.freelancer_wallet is distinct from old.freelancer_wallet)
     or (old.tx_hash is not null and new.tx_hash is distinct from old.tx_hash)
     or (old.contract_id is not null and new.contract_id is distinct from old.contract_id) then
    raise exception 'GigPay: escrow fields cannot be changed' using errcode = '42501';
  end if;

  -- A released task stays released. The assigned freelancer's late proof keeps the Completed status.
  if old.status in ('Completed', 'Paid') and new.status is distinct from old.status then
    if old.freelancer_id = uid and new.status = 'Under Review' then
      new.status := old.status;
    else
      raise exception 'GigPay: a released task cannot change status' using errcode = '42501';
    end if;
  end if;

  -- The client who owns the task: may release, dispute and resolve, but not swap the freelancer.
  if uid = old.client_id then
    if old.freelancer_id is not null and new.freelancer_id is distinct from old.freelancer_id then
      raise exception 'GigPay: the assigned freelancer cannot be changed' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Everyone else is acting as a freelancer.
  if old.freelancer_id is null then
    -- Claiming an open task: only Available -> In Progress, assigned to yourself.
    if not (old.status = 'Available' and new.freelancer_id = uid and new.status = 'In Progress') then
      raise exception 'GigPay: a freelancer can only accept an available task for themselves' using errcode = '42501';
    end if;
  elsif old.freelancer_id <> uid then
    raise exception 'GigPay: this task belongs to another freelancer' using errcode = '42501';
  else
    -- The assigned freelancer: may move In Progress -> Under Review (submit proof), nothing else.
    if new.freelancer_id is distinct from old.freelancer_id
       or old.status = 'Disputed'
       or new.status not in ('In Progress', 'Under Review', 'Completed', 'Paid')
       or (new.status in ('Completed', 'Paid') and new.status is distinct from old.status) then
      raise exception 'GigPay: a freelancer cannot set this status' using errcode = '42501';
    end if;
  end if;

  -- Client-only fields.
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
