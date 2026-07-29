/**
 * accumulate.mjs — minimal, dependency-free Accumulate JSON-RPC client.
 *
 * The harness must verify chain state INDEPENDENTLY of the SDK under test.
 * If it used the SDK, a broken SDK would score itself as passing. So this is a
 * deliberately plain fetch-based client with no SDK dependency.
 *
 * Verified live against Kermit 2026-07-27:
 *   - V3 `query`         -> { result: { account: {...} } }
 *   - V2 `faucet`        -> { result: { txid, transactionHash } }
 *   - missing account    -> error code -33404
 */

/** Networks the harness can target. Mirrors packages/types/src/network.ts. */
export const NETWORKS = {
  kermit: {
    id: 'kermit',
    v2: 'https://kermit.accumulatenetwork.io/v2',
    v3: 'https://kermit.accumulatenetwork.io/v3',
    faucet: true,
  },
  testnet: {
    id: 'testnet',
    v2: 'https://testnet.accumulatenetwork.io/v2',
    v3: 'https://testnet.accumulatenetwork.io/v3',
    faucet: true,
  },
  devnet: {
    id: 'devnet',
    v2: 'https://devnet.accumulatenetwork.io/v2',
    v3: 'https://devnet.accumulatenetwork.io/v3',
    faucet: true,
  },
  local: {
    id: 'local',
    v2: 'http://localhost:26660/v2',
    v3: 'http://localhost:26660/v3',
    faucet: true,
  },
};

/**
 * Task specs say `network: kermit-testnet`. Normalize the spec spelling to a
 * registry id so a spec edit cannot silently point runs at the wrong chain.
 */
export function resolveNetwork(spec) {
  const raw = String(spec || 'kermit').toLowerCase();
  const key = raw.replace(/-testnet$/, '');
  const net = NETWORKS[key] || NETWORKS[raw];
  if (!net) throw new Error(`unknown network "${spec}" (known: ${Object.keys(NETWORKS).join(', ')})`);
  return net;
}

/** Account-not-found. Confirmed live on Kermit. Not an error for existence checks. */
export const CODE_NOT_FOUND = -33404;

export class RpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
  get isNotFound() {
    return this.code === CODE_NOT_FOUND;
  }
}

/** Raised when the network itself is unreachable — distinct from a task failure. */
export class NetworkUnreachable extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkUnreachable';
  }
}

let rpcId = 0;

async function rpc(endpoint, method, params, { timeoutMs = 20000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal: ac.signal,
    });
  } catch (e) {
    throw new NetworkUnreachable(`${method} ${endpoint}: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }

  // Every response body MUST be consumed or explicitly cancelled, including on
  // error paths. undici keeps a socket allocated until the body is drained, so
  // throwing here without draining leaks it. Under a burst of 429s from the
  // faucet that exhausted the connection pool process-wide, after which every
  // subsequent fetch queued until the 20s AbortController fired — producing
  // universal "operation was aborted" errors against an endpoint that was in
  // fact answering in ~50ms, and 17-minute provisioning (40 polls x 20s).
  const discard = async () => {
    try {
      await res.body?.cancel();
    } catch {
      /* already consumed or closed */
    }
  };

  if (res.status >= 500 || res.status === 429) {
    await discard();
    throw new NetworkUnreachable(`${method} ${endpoint}: HTTP ${res.status}`);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    await discard();
    throw new NetworkUnreachable(`${method} ${endpoint}: non-JSON response (HTTP ${res.status})`);
  }

  if (body.error) throw new RpcError(body.error.code, body.error.message, body.error.data);
  return body.result;
}

/**
 * Query an account. Returns the account record, or null when it does not exist.
 * Null-for-missing (rather than throwing) is what lets existence assertions read
 * naturally: `await queryAccount(u) !== null`.
 */
export async function queryAccount(net, url) {
  try {
    const r = await rpc(net.v3, 'query', { scope: url, query: { queryType: 'default' } });
    return r?.account ?? null;
  } catch (e) {
    if (e instanceof RpcError && e.isNotFound) return null;
    throw e;
  }
}

/** Query a transaction by id/hash. Returns the record, or null if unknown yet. */
export async function queryTx(net, txid) {
  const scope = txid.startsWith('acc://') ? txid : `acc://${txid}@unknown`;
  try {
    const r = await rpc(net.v3, 'query', { scope, query: { queryType: 'default' } });
    return r ?? null;
  } catch (e) {
    if (e instanceof RpcError && e.isNotFound) return null;
    // A malformed txid is the agent's problem, not a harness failure.
    if (e instanceof RpcError) return null;
    throw e;
  }
}

/**
 * Delivery status for a transaction. Accumulate reports this in a few shapes
 * across versions; normalize to the vocabulary in packages/types (TransactionStatus).
 */
export async function txStatus(net, txid) {
  const rec = await queryTx(net, txid);
  if (!rec) return 'unknown';
  const s = rec.status ?? rec.value?.status ?? rec.message?.status;
  if (typeof s === 'string') {
    const norm = s.toLowerCase();
    if (norm === 'delivered' || norm === 'executed') return 'delivered';
    if (norm === 'pending') return 'pending';
    if (norm === 'failed' || norm === 'error') return 'failed';
  }
  if (rec.produced || rec.recordType === 'message') return 'delivered';
  return 'unknown';
}

export async function faucet(net, liteTokenAccount) {
  if (!net.faucet) throw new Error(`network ${net.id} has no faucet`);
  return rpc(net.v2, 'faucet', { url: liteTokenAccount });
}

export async function networkStatus(net) {
  return rpc(net.v3, 'network-status', { partition: 'directory' });
}

/** Oracle price, used to convert credits <-> ACME. */
export async function oraclePrice(net) {
  const s = await networkStatus(net);
  return s?.oracle?.price ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A tiny async semaphore.
 *
 * Agent runs parallelise cleanly — they are independent and CPU/LLM bound. The
 * *provisioning* phase does not: every run hits the same faucet and RPC, and an
 * ADI-tier setup alone makes three faucet calls plus credit purchases and
 * settlement polling. Five of those at once produced 12/12 failures with
 * `fetch failed` / aborted requests after 4-12 minutes of retrying.
 *
 * Provisioning is a small slice of a ~20 minute run, so gating it costs little
 * wall-clock while removing the contention entirely.
 */
export function createSemaphore(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

/**
 * Retry a network-bound operation with exponential backoff.
 * Only NetworkUnreachable is retried — a validation error would fail identically
 * every time, and retrying it would just burn the clock.
 */
export async function withRetry(fn, { attempts = 3, baseMs = 5000, label = 'operation' } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!(e instanceof NetworkUnreachable)) throw e;
      if (i < attempts - 1) await sleep(baseMs * 2 ** i);
    }
  }
  throw new NetworkUnreachable(`${label} failed after ${attempts} attempts: ${lastErr.message}`);
}

/**
 * Poll until `predicate(account)` holds. Returns the account, or null on timeout.
 * Used for balance/credit settlement, which on Kermit takes ~10-15s.
 */
export async function waitForAccount(net, url, predicate, { attempts = 40, delayMs = 3000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const acct = await queryAccount(net, url);
    if (acct && predicate(acct)) return acct;
    await sleep(delayMs);
  }
  return null;
}

/** ACME is denominated in base units: 1 ACME = 1e8. The canonical footgun. */
export const ACME_PRECISION = 100000000n;
export const acmeToBase = (acme) => BigInt(Math.round(Number(acme) * 1e8));
export const baseToAcme = (base) => Number(BigInt(base)) / 1e8;
