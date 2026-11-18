/**
 * Automated PostgreSQL / RLS / trigger guard verification against local Supabase.
 * Runs all assertions inside BEGIN ... ROLLBACK so the database is never left dirty.
 *
 * Requires running `supabase_db_gigpay` container (or psql via DATABASE_URL).
 * Command: node test/db_guards.test.js
 */
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';

const CONTAINER_NAME = process.env.GIGPAY_DB_CONTAINER || 'supabase_db_gigpay';
const ALLOW_NO_DB = process.env.GIGPAY_ALLOW_NO_DB === '1';

function checkDbAvailable() {
  if (process.env.DATABASE_URL) return { mode: 'psql', target: process.env.DATABASE_URL };
  try {
    const running = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', CONTAINER_NAME],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    if (running === 'true') return { mode: 'docker', target: CONTAINER_NAME };
  } catch {
    // Container unavailable
  }
  return null;
}

function runPsql(connection, sql) {
  const args = connection.mode === 'docker'
    ? ['exec', '-i', connection.target, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    : [connection.target, '-v', 'ON_ERROR_STOP=1'];
  const cmd = connection.mode === 'docker' ? 'docker' : 'psql';
  return execFileSync(cmd, args, { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

const GUARD_SQL = `
BEGIN;

-- Seed 3 test users (Client 1, Freelancer 1, Freelancer 2) inside the rolled-back tx
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dbguard-c1@example.local', 'x', now(), '{"provider":"email","providers":["email"]}', '{"role":"client","display_name":"Client One"}', now(), now()),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dbguard-f1@example.local', 'x', now(), '{"provider":"email","providers":["email"]}', '{"role":"freelancer","display_name":"Freelancer One"}', now(), now()),
  ('00000000-0000-4000-a000-000000000003', '00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'dbguard-f2@example.local', 'x', now(), '{"provider":"email","providers":["email"]}', '{"role":"freelancer","display_name":"Freelancer Two"}', now(), now());

DO $$
DECLARE
  c1 CONSTANT uuid := '00000000-0000-4000-a000-000000000001';
  f1 CONSTANT uuid := '00000000-0000-4000-a000-000000000002';
  f2 CONSTANT uuid := '00000000-0000-4000-a000-000000000003';
  w_client CONSTANT text := 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  w_free   CONSTANT text := 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
  t_id uuid;
  t_null_client uuid;
  row_cnt int;
  cur_status text;
  blocked boolean;
BEGIN
  -- 0. Anonymous role cannot insert tasks or read private pool table
  SET LOCAL ROLE anon;
  blocked := false;
  BEGIN
    INSERT INTO public.tasks (title, amount, status, client_id) VALUES ('Anon Task', 5, 'Available', c1);
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Anonymous role inserted into tasks'; END IF;

  SET LOCAL ROLE authenticated;

  -- 1. Profile guards: cannot set is_kyc_verified or mutate role after registration
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f1::text, 'role', 'authenticated')::text, true);
  blocked := false;
  BEGIN
    UPDATE public.profiles SET is_kyc_verified = true WHERE id = f1;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Profile guard failed: user updated is_kyc_verified'; END IF;

  blocked := false;
  BEGIN
    UPDATE public.profiles SET role = 'client' WHERE id = f1;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Profile guard failed: user flipped role after registration'; END IF;

  -- 2. Practice wallet pool RLS + vault secret access denied to authenticated role
  blocked := false;
  BEGIN
    PERFORM * FROM public.practice_wallet_fundings;
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Pool table readable by authenticated role'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.gigpay_testnet_pool_secret();
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Vault secret function executable by authenticated role'; END IF;

  -- 3. Task INSERT guards: freelancer cannot insert task
  blocked := false;
  BEGIN
    INSERT INTO public.tasks (title, amount, status, client_id) VALUES ('Bad Freelancer Task', 5, 'Available', f1);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Freelancer insert should be blocked'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c1::text, 'role', 'authenticated')::text, true);

  -- Check constraints on amount, status, explorer_url, and insert trigger guards
  FOR cur_status IN SELECT unnest(ARRAY['-5', 'NaN', '0']) LOOP
    blocked := false;
    BEGIN
      INSERT INTO public.tasks (title, amount, status, client_id)
      VALUES ('Bad Amount', cur_status::numeric, 'Available', c1);
    EXCEPTION WHEN check_violation THEN
      blocked := true;
    END;
    IF NOT blocked THEN RAISE EXCEPTION 'Bad amount % insert should fail check constraint', cur_status; END IF;
  END LOOP;

  blocked := false;
  BEGIN
    INSERT INTO public.tasks (title, amount, status, client_id, explorer_url)
    VALUES ('Bad Explorer', 5, 'Available', c1, 'http://evil.example/tx/1');
  EXCEPTION WHEN check_violation THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Non-HTTPS external explorer_url should fail check constraint'; END IF;

  blocked := false;
  BEGIN
    INSERT INTO public.tasks (title, amount, status, client_id) VALUES ('Bad Status', 5, 'HackedStatus', c1);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Invalid initial status should be blocked by insert guard'; END IF;

  -- Verify underlying tasks_status_valid CHECK constraint directly (when auth.uid() is NULL / service role)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  blocked := false;
  BEGIN
    INSERT INTO public.tasks (title, amount, status) VALUES ('Bad Status Constraint', 5, 'HackedStatus');
  EXCEPTION WHEN check_violation THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Invalid status insert should fail tasks_status_valid check constraint'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c1::text, 'role', 'authenticated')::text, true);

  blocked := false;
  BEGIN
    INSERT INTO public.tasks (title, amount, status, client_id, client_wallet, freelancer_wallet)
    VALUES ('Self Dealing', 5, 'Available', c1, w_client, w_client);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Self-dealing wallet insert should fail'; END IF;

  blocked := false;
  BEGIN
    INSERT INTO public.tasks (title, amount, status, client_id) VALUES ('Precompleted', 5, 'Completed', c1);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Pre-completed insert should fail'; END IF;

  -- Valid client insert as Confirming -> promote to Available
  INSERT INTO public.tasks (title, amount, status, client_id, client_wallet, freelancer_wallet, tx_hash, on_chain_task_id)
  VALUES ('Verified Task', 5, 'Confirming', c1, w_client, w_free, repeat('a', 64), 8888)
  RETURNING id INTO t_id;

  UPDATE public.tasks SET status = 'Available' WHERE id = t_id;

  -- Client cannot assign freelancer_id on an Available task (would wedge escrow)
  blocked := false;
  BEGIN
    UPDATE public.tasks SET freelancer_id = f1 WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Client must not pre-assign freelancer_id on Available task'; END IF;

  -- Client cannot skip freelancer acceptance (Available -> Completed)
  blocked := false;
  BEGIN
    UPDATE public.tasks SET status = 'Completed' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Client must not bypass freelancer acceptance'; END IF;

  -- Client cannot mutate immutable escrow fields (amount / client_wallet / tx_hash)
  blocked := false;
  BEGIN
    UPDATE public.tasks SET amount = 999 WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Client must not alter amount'; END IF;

  -- 4. Freelancer 1 accepts Available -> In Progress
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f1::text, 'role', 'authenticated')::text, true);

  blocked := false;
  BEGIN
    UPDATE public.tasks SET freelancer_id = f1, status = 'In Progress', title = 'Hijacked' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Freelancer must not alter title during accept'; END IF;

  UPDATE public.tasks SET freelancer_id = f1, status = 'In Progress' WHERE id = t_id;

  -- Freelancer cannot directly mark In Progress task Completed or set release/dispute fields
  blocked := false;
  BEGIN
    UPDATE public.tasks SET status = 'Completed' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Freelancer must not set status to Completed'; END IF;

  blocked := false;
  BEGIN
    UPDATE public.tasks SET disputed_at = now() WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Freelancer must not set dispute timestamps'; END IF;

  -- Freelancer 2 cannot hijack or modify Freelancer 1's active task
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f2::text, 'role', 'authenticated')::text, true);
  UPDATE public.tasks SET submission_notes = 'hijack' WHERE id = t_id;
  GET DIAGNOSTICS row_cnt = ROW_COUNT;
  IF row_cnt <> 0 THEN RAISE EXCEPTION 'Other freelancer modified task (row_cnt=%)', row_cnt; END IF;

  -- Freelancer 1 submits proof with non-https URL -> rejected by CHECK constraint
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f1::text, 'role', 'authenticated')::text, true);
  blocked := false;
  BEGIN
    UPDATE public.tasks
    SET status = 'Under Review', proof_attached = true, github_pr_url = 'http://insecure.local/pr/1'
    WHERE id = t_id;
  EXCEPTION WHEN check_violation THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Non-HTTPS proof URL should fail check constraint'; END IF;

  -- Valid https proof moves to Under Review
  UPDATE public.tasks
  SET status = 'Under Review', proof_attached = true, github_pr_url = 'https://github.com/gigpay/demo/pull/1', submitted_at = now()
  WHERE id = t_id;

  -- Freelancer cannot downgrade Under Review back to In Progress
  blocked := false;
  BEGIN
    UPDATE public.tasks SET status = 'In Progress' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Freelancer must not downgrade Under Review to In Progress'; END IF;

  -- Client cannot alter freelancer deliverables/proof
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c1::text, 'role', 'authenticated')::text, true);
  blocked := false;
  BEGIN
    UPDATE public.tasks SET github_pr_url = 'https://github.com/attacker/fake/pull/9' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Client must not alter freelancer proof URL'; END IF;

  -- 5. Dispute & Resolution guards (Client 1)
  UPDATE public.tasks
  SET status = 'Disputed', dispute_reason = 'Needs fix', disputed_at = now() - interval '10 minutes', disputed_by = c1::text
  WHERE id = t_id;

  blocked := false;
  BEGIN
    UPDATE public.tasks SET status = 'Completed' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Cannot release while Disputed'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', f1::text, 'role', 'authenticated')::text, true);
  blocked := false;
  BEGIN
    UPDATE public.tasks SET status = 'Under Review', submission_notes = 'bypass' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Freelancer cannot submit proof while Disputed'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', c1::text, 'role', 'authenticated')::text, true);
  blocked := false;
  BEGIN
    UPDATE public.tasks SET status = 'Under Review', dispute_resolved_at = now() - interval '20 minutes' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Resolution before disputed_at must fail'; END IF;

  UPDATE public.tasks SET status = 'Under Review', dispute_resolved_at = now() WHERE id = t_id;
  UPDATE public.tasks SET status = 'Completed', release_tx_hash = repeat('b', 64), completed_at = now() WHERE id = t_id;

  -- Completed task cannot be downgraded or have metadata mutated
  blocked := false;
  BEGIN
    UPDATE public.tasks SET status = 'Available' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Completed task downgrade must fail'; END IF;

  blocked := false;
  BEGIN
    UPDATE public.tasks SET title = 'Renamed After Release', dispute_reason = 'Retroactive dispute' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Completed task title/dispute metadata mutation must fail'; END IF;

  -- Assigned freelancer late Under Review status ping stays Completed, but proof overwrite is blocked when proof_attached is true
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f1::text, 'role', 'authenticated')::text, true);
  UPDATE public.tasks SET status = 'Under Review' WHERE id = t_id;
  SELECT status INTO cur_status FROM public.tasks WHERE id = t_id;
  IF cur_status <> 'Completed' THEN RAISE EXCEPTION 'Expected Completed to stay Completed, got %', cur_status; END IF;

  blocked := false;
  BEGIN
    UPDATE public.tasks SET github_pr_url = 'https://github.com/gigpay/demo/pull/999' WHERE id = t_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Completed task proof_attached overwrite must fail'; END IF;

  -- Nullable client_id legacy row: freelancer cannot overwrite completed proof when client_id is NULL
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.tasks (title, amount, status, client_id, freelancer_id, proof_attached, github_pr_url)
  VALUES ('Legacy Null Client', 3, 'Completed', NULL, f1, true, 'https://github.com/gigpay/demo/pull/2')
  RETURNING id INTO t_null_client;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f1::text, 'role', 'authenticated')::text, true);
  blocked := false;
  BEGIN
    UPDATE public.tasks SET submission_notes = 'overwrite null client' WHERE id = t_null_client;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Completed proof overwrite on client_id IS NULL row must fail'; END IF;
END $$;

ROLLBACK;
`;

console.log('\n=== PostgreSQL RLS & Trigger Guards ===\n');
const conn = checkDbAvailable();
if (!conn) {
  if (ALLOW_NO_DB) {
    console.log('  SKIPPED: Local Supabase DB not running and GIGPAY_ALLOW_NO_DB=1.');
    process.exit(0);
  }
  console.error(`  FAIL: Could not reach running Postgres (${CONTAINER_NAME}). Start local Supabase or set DATABASE_URL.`);
  process.exit(1);
}

const out = runPsql(conn, GUARD_SQL);
assert.ok(out.includes('ROLLBACK'), 'Transaction must cleanly roll back all temporary guard fixtures');
console.log('  ✅ All profile, pool/anon RLS, check constraints, escrow insert/update, dispute, and Completed-immutability DB guards passed (rolled back cleanly).\n');
