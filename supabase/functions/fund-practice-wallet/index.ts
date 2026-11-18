// fund-practice-wallet: Testnet-only fallback when Friendbot rate-limits new GigPay practice wallets
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
import {
  Account,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "npm:@stellar/stellar-sdk@16.4.1";
import {
  DEFAULT_POOL_AMOUNT,
  createFundPracticeWalletHandler,
  resolveNetworkPassphrase,
  sanitizeHorizonUrl,
} from "./handler.ts";

const rawNetwork = Deno.env.get("STELLAR_NETWORK") ?? "TESTNET";
const HORIZON = sanitizeHorizonUrl(Deno.env.get("STELLAR_HORIZON_URL") ?? "");
const NETWORK_PASSPHRASE = resolveNetworkPassphrase(
  rawNetwork,
  Deno.env.get("STELLAR_NETWORK_PASSPHRASE") ?? "",
  {
    PUBLIC: Networks.PUBLIC,
    TESTNET: Networks.TESTNET,
    STANDALONE: Networks.STANDALONE,
  },
);

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const handler = createFundPracticeWalletHandler({
  horizonUrl: HORIZON,
  networkPassphrase: NETWORK_PASSPHRASE,
  poolAmount: DEFAULT_POOL_AMOUNT,
  fetchImpl: fetch,
  getAuthenticatedUser: async (authHeader: string) => {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    return user ? { id: user.id } : null;
  },
  getAdminStore: () => {
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    return {
      claimFunding: (userId: string, address: string, amountXlm: number) =>
        admin
          .from("practice_wallet_fundings")
          .insert({ user_id: userId, address, amount_xlm: amountXlm }),
      releaseClaim: (userId: string) =>
        admin.from("practice_wallet_fundings").delete().eq("user_id", userId),
      setTxHash: (userId: string, hash: string) =>
        admin.from("practice_wallet_fundings").update({ tx_hash: hash }).eq("user_id", userId),
      getPoolSecret: () => admin.rpc("gigpay_testnet_pool_secret"),
    };
  },
  stellar: {
    isValidPublicKey: (key: string) => StrKey.isValidEd25519PublicKey(key),
    derivePublicKey: (secret: string) => Keypair.fromSecret(secret).publicKey(),
    buildAndSignCreateAccountTx: ({
      poolSecret,
      poolPublicKey,
      poolSequence,
      destination,
      startingBalance,
      networkPassphrase,
    }) => {
      const tx = new TransactionBuilder(new Account(poolPublicKey, poolSequence), {
        fee: "1000",
        networkPassphrase,
      })
        .addOperation(Operation.createAccount({ destination, startingBalance }))
        .setTimeout(60)
        .build();
      tx.sign(Keypair.fromSecret(poolSecret));
      return tx.toXDR();
    },
  },
});

Deno.serve(handler);
