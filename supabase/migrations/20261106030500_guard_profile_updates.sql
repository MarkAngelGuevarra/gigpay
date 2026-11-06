-- GigPay: users may edit their own profile text and switch between client and freelancer,
-- but may not mark themselves verified or set any other role.
-- Applied to production on Nov 6, 2026. Rollback-tested first: kyc change blocked, role=admin
-- blocked, client<->freelancer allowed, bio edit allowed.
create or replace function public.enforce_profile_update()
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
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.is_kyc_verified is distinct from old.is_kyc_verified then
    raise exception 'GigPay: this profile field cannot be changed by the user' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and new.role not in ('client', 'freelancer') then
    raise exception 'GigPay: role must be client or freelancer' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_update on public.profiles;
create trigger enforce_profile_update
  before update on public.profiles
  for each row execute function public.enforce_profile_update();
