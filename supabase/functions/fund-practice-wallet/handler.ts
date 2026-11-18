const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "host.docker.internal"]);
const BLOCKED_MAINNET_HOSTS = new Set(["horizon.stellar.org", "soroban.stellar.org", "mainnet.sorobanrpc.com"]);
export const DEFAULT_TESTNET_HORIZON = "https://horizon-testnet.stellar.org";
export const DEFAULT_POOL_AMOUNT = "25";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface HorizonSubmitResult {
  hash?: string;
  extras?: {
    result_codes?: {
      transaction?: string;
    };
  };
}

export function sanitizeHorizonUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_TESTNET_HORIZON;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return DEFAULT_TESTNET_HORIZON;
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_MAINNET_HOSTS.has(host)) return DEFAULT_TESTNET_HORIZON;
    if (parsed.protocol === "https:" || (parsed.protocol === "http:" && LOCAL_HTTP_HOSTS.has(host))) {
      return parsed.href.replace(/\/+$/, "");
    }
  } catch {
    // Invalid URL falls back safely.
  }
  return DEFAULT_TESTNET_HORIZON;
}

export function resolveNetworkPassphrase(
  rawNetwork: string,
  rawPassphrase: string,
  networks: { PUBLIC: string; TESTNET: string; STANDALONE: string },
): string {
  const normalized = rawNetwork.trim().toUpperCase();
  const isLocalChain = normalized === "LOCAL" || normalized === "STANDALONE";
  const passphrase = rawPassphrase.trim();
  // Never permit Mainnet signing from the practice-wallet pool.
  if (!isLocalChain) return networks.TESTNET;
  return passphrase && passphrase !== networks.PUBLIC && passphrase !== networks.TESTNET
    ? passphrase
    : networks.STANDALONE;
}

export interface FundPracticeWalletAdmin {
  claimFunding: (
    userId: string,
    address: string,
    amountXlm: number,
  ) => PromiseLike<{ error: unknown }>;
  releaseClaim: (userId: string) => PromiseLike<unknown>;
  setTxHash: (userId: string, hash: string) => PromiseLike<unknown>;
  getPoolSecret: () => PromiseLike<{ data: string | null; error: unknown }>;
}

export interface FundPracticeWalletDeps {
  horizonUrl: string;
  networkPassphrase: string;
  poolAmount?: string;
  maxAttempts?: number;
  fetchImpl: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  getAuthenticatedUser: (authHeader: string) => Promise<{ id: string } | null>;
  getAdminStore: () => FundPracticeWalletAdmin;
  stellar: {
    isValidPublicKey: (key: string) => boolean;
    derivePublicKey: (secret: string) => string;
    buildAndSignCreateAccountTx: (opts: {
      poolSecret: string;
      poolPublicKey: string;
      poolSequence: string;
      destination: string;
      startingBalance: string;
      networkPassphrase: string;
    }) => string;
  };
}

const jsonReply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

export function createFundPracticeWalletHandler(deps: FundPracticeWalletDeps) {
  const {
    horizonUrl,
    networkPassphrase,
    poolAmount = DEFAULT_POOL_AMOUNT,
    maxAttempts = 6,
    fetchImpl,
    sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
    random = Math.random,
    getAuthenticatedUser,
    getAdminStore,
    stellar,
  } = deps;

  const accountExists = async (address: string) => {
    const res = await fetchImpl(`${horizonUrl}/accounts/${address}`);
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`Horizon account check returned ${res.status}`);
    return true;
  };

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
    if (req.method !== "POST") return jsonReply(405, { error: "POST only" });

    const authHeader = req.headers.get("Authorization") ?? "";
    const user = await getAuthenticatedUser(authHeader);
    if (!user) return jsonReply(401, { error: "Sign in to GigPay first." });

    let address = "";
    try {
      const body = await req.json();
      address = String(body?.address ?? "").trim();
    } catch {
      // Malformed/empty JSON fails validation below.
    }
    if (!stellar.isValidPublicKey(address)) {
      return jsonReply(400, { error: "Not a valid Stellar address." });
    }

    try {
      if (await accountExists(address)) return jsonReply(200, { status: "already_active" });
    } catch (err) {
      console.error("[fund-practice-wallet] account check failed", (err as Error).message);
      return jsonReply(502, { error: "Couldn't check wallet status right now. Try again in a minute." });
    }

    const admin = getAdminStore();

    // Claim the one-time top-up first; primary key and unique address stop double funding.
    const { error: claimError } = await admin.claimFunding(user.id, address, Number(poolAmount));
    if (claimError) {
      return jsonReply(409, {
        error: "This account already received its one practice top-up. Wait a minute and refresh, or ask the GigPay team.",
      });
    }

    let submittedToHorizon = false;
    let horizonRejected = false;
    try {
      const { data: secret, error: secretError } = await admin.getPoolSecret();
      if (secretError || !secret) throw new Error("pool not configured");
      const poolPublicKey = stellar.derivePublicKey(secret);

      let submit: Response | null = null;
      let result: HorizonSubmitResult | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const poolRes = await fetchImpl(`${horizonUrl}/accounts/${poolPublicKey}`);
        if (poolRes.status !== 200) throw new Error("pool account missing");
        const poolAccount = (await poolRes.json()) as { sequence: string };

        const signedXdr = stellar.buildAndSignCreateAccountTx({
          poolSecret: secret,
          poolPublicKey,
          poolSequence: poolAccount.sequence,
          destination: address,
          startingBalance: poolAmount,
          networkPassphrase,
        });

        submittedToHorizon = true;
        submit = await fetchImpl(`${horizonUrl}/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ tx: signedXdr }),
        });
        result = (await submit.json()) as HorizonSubmitResult;
        const badSeq = !submit.ok && result?.extras?.result_codes?.transaction === "tx_bad_seq";
        if (!badSeq || attempt === maxAttempts) break;
        horizonRejected = false;
        submittedToHorizon = false;
        await sleep(300 + random() * 1200 * attempt);
      }

      if (!submit || !submit.ok) {
        horizonRejected = true;
        if (await accountExists(address)) {
          await admin.releaseClaim(user.id);
          return jsonReply(200, { status: "already_active" });
        }
        throw new Error(
          result?.extras?.result_codes ? JSON.stringify(result.extras.result_codes) : "submit failed",
        );
      }

      if (result?.hash) {
        await admin.setTxHash(user.id, result.hash);
      }
      return jsonReply(200, { status: "funded", hash: result?.hash, amount: poolAmount });
    } catch (err) {
      if (!submittedToHorizon || horizonRejected) {
        await admin.releaseClaim(user.id);
      }
      console.error("[fund-practice-wallet]", (err as Error).message);
      return jsonReply(502, {
        error: "Couldn't fund the practice wallet right now. Try again in a minute.",
      });
    }
  };
}
