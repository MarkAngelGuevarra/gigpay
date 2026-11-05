// fund-practice-wallet — Testnet-only fallback when Friendbot rate-limits new GigPay practice wallets
// (for example, many testers on one school Wi-Fi share one IP address).
//
// Rules:
//   - Caller must be a signed-in GigPay user (JWT verified by Supabase).
//   - One top-up per account and per address (public.practice_wallet_fundings, service-role only).
//   - Only addresses that do not exist yet on Testnet are created, with POOL_AMOUNT XLM.
//   - The pool's secret lives in Supabase Vault (public.gigpay_testnet_pool_secret, service role only).
// Funding a wallet does not make it count as a user: the evidence counts escrow parties, not funders.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";
import { Keypair, Networks, Operation, StrKey, TransactionBuilder, Account } from "npm:@stellar/stellar-sdk@16.4.1";

const HORIZON = "https://horizon-testnet.stellar.org";
const POOL_AMOUNT = "25";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const accountExists = async (address: string) => (await fetch(`${HORIZON}/accounts/${address}`)).status === 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return reply(401, { error: "Sign in to GigPay first." });

  let address = "";
  try {
    address = String((await req.json())?.address ?? "").trim();
  } catch { /* handled below */ }
  if (!StrKey.isValidEd25519PublicKey(address)) return reply(400, { error: "Not a valid Stellar address." });

  if (await accountExists(address)) return reply(200, { status: "already_active" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Claim the one-time top-up first; the primary key / unique address stop double funding.
  const { error: claimError } = await admin
    .from("practice_wallet_fundings")
    .insert({ user_id: user.id, address, amount_xlm: Number(POOL_AMOUNT) });
  if (claimError) {
    return reply(409, { error: "This account already received its one practice top-up. Wait a minute and refresh, or ask the GigPay team." });
  }
  const release = () => admin.from("practice_wallet_fundings").delete().eq("user_id", user.id);

  try {
    const { data: secret, error: secretError } = await admin.rpc("gigpay_testnet_pool_secret");
    if (secretError || !secret) throw new Error("pool not configured");
    const pool = Keypair.fromSecret(secret as string);

    const poolRes = await fetch(`${HORIZON}/accounts/${pool.publicKey()}`);
    if (poolRes.status !== 200) throw new Error("pool account missing");
    const poolAccount = await poolRes.json();

    const tx = new TransactionBuilder(new Account(pool.publicKey(), poolAccount.sequence), {
      fee: "1000",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.createAccount({ destination: address, startingBalance: POOL_AMOUNT }))
      .setTimeout(60)
      .build();
    tx.sign(pool);

    const submit = await fetch(`${HORIZON}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tx: tx.toXDR() }),
    });
    const result = await submit.json();
    if (!submit.ok) {
      // Someone (e.g. a late Friendbot reply) created the account meanwhile: that's fine.
      if (await accountExists(address)) { await release(); return reply(200, { status: "already_active" }); }
      throw new Error(result?.extras?.result_codes ? JSON.stringify(result.extras.result_codes) : "submit failed");
    }

    await admin.from("practice_wallet_fundings").update({ tx_hash: result.hash }).eq("user_id", user.id);
    return reply(200, { status: "funded", hash: result.hash, amount: POOL_AMOUNT });
  } catch (err) {
    await release();
    console.error("[fund-practice-wallet]", (err as Error).message);
    return reply(502, { error: "Couldn't fund the practice wallet right now. Try again in a minute." });
  }
});
