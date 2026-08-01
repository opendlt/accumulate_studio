/**
 * setup.mjs — provision prerequisites that require signing (the `adi` tier).
 *
 * See setup/adi-setup.py for why this goes through the Python reference SDK
 * rather than a hand-rolled signer in the harness.
 *
 * A setup failure is NEVER an SDK-under-test failure. It surfaces as
 * SetupFailure, which the runner classifies `harness-setup-failed` and the
 * scorecard excludes from K2 — the same treatment as network-flake.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PACKAGES } from './workspace.mjs';
import { deriveLiteUrls } from './lite.mjs';
import { queryAccount, waitForAccount } from './accumulate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SETUP_SCRIPT = join(HERE, '..', 'setup', 'adi-setup.py');


/**
 * Async child-process helper. Must NOT be synchronous: these calls take minutes
 * (venv build, ADI provisioning) and the sync form blocks the shared event
 * loop, aborting every concurrent worker's in-flight chain query.
 */
function runAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => {
        if (err) { err.stdout = stdout; err.stderr = stderr; reject(err); }
        else resolve(stdout);
      });
    if (opts.input !== undefined) {
      child.stdin?.on('error', () => {});
      child.stdin?.end(opts.input);
    }
  });
}

export class SetupFailure extends Error {
  constructor(message) {
    super(message);
    this.name = 'SetupFailure';
  }
}

let cachedPython = null;

// Must include the .exe suffix on Windows: existsSync() matches the literal
// filename, so a path ending in "python" is always reported missing there. The
// original per-process cache used the extensionless form and therefore never
// hit — every ADI-tier run rebuilt the venv from scratch.
const pythonExe = (dir) =>
  join(dir, process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python');

/**
 * A reusable venv holding the Python reference SDK, cached ON DISK across
 * processes rather than per-process.
 *
 * The previous per-process cache was defeated by any workflow that invokes the
 * runner once per task: each invocation rebuilt the venv (measured 30s) and
 * leaked it, reaching 35 abandoned copies at 50 MB each — 1.75 GB — in a single
 * session. The cache directory is keyed by SDK version so a republished
 * reference SDK naturally builds a fresh one instead of serving a stale build.
 */
export async function ensureSetupEnv() {
  if (cachedPython && existsSync(cachedPython)) return cachedPython;

  // Key the cache on the RESOLVED version, not just the package name. Keyed on
  // name alone the venv is built once and never updated, so provisioning keeps
  // running whatever was current the first time — observed still pinned at
  // 2.3.0 six releases later, creating ADIs that never landed on chain and
  // failing every ADI-tier run as `harness-setup-failed`.
  let pinned = 'unknown';
  try {
    const res = await fetch(`https://pypi.org/pypi/${PACKAGES.python}/json`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) pinned = (await res.json())?.info?.version ?? 'unknown';
  } catch {
    // Offline: fall back to the shared key rather than rebuilding every run.
  }
  const key = `acc-harness-setupenv-${PACKAGES.python}-${pinned}`;
  const dir = join(tmpdir(), key);
  const stamp = join(dir, '.ready');
  const exe = pythonExe(dir);

  // A prior process may have already built it. `.ready` is written last, so a
  // half-built venv from a killed run is not mistaken for a usable one.
  if (existsSync(stamp) && existsSync(exe)) {
    cachedPython = exe;
    return cachedPython;
  }

  // Discard any partial build before retrying.
  if (existsSync(dir)) {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* locked */ }
  }
  mkdirSync(dir, { recursive: true });

  try {
    await runAsync('python', ['-m', 'venv', '.venv'], { cwd: dir, timeout: 180000, shell: process.platform === 'win32' });
    const pip = process.platform === 'win32' ? '.venv\\Scripts\\pip' : '.venv/bin/pip';
    const spec = pinned === 'unknown' ? PACKAGES.python : `${PACKAGES.python}==${pinned}`;
    await runAsync(pip, ['install', '--disable-pip-version-check', '--upgrade', spec], {
      cwd: dir, timeout: 300000, shell: process.platform === 'win32',
    });
    writeFileSync(stamp, new Date().toISOString());
  } catch (e) {
    throw new SetupFailure(`could not build the setup venv: ${e.message}`);
  }

  cachedPython = exe;
  return cachedPython;
}

/** Remove the on-disk setup venv. Exposed for `--clean-cache`. */
export function clearSetupEnvCache() {
  // Version-keyed directories mean there can be several; clear them all, or
  // `--clean-cache` silently leaves the stale one it was invoked to remove.
  let removed = false;
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith(`acc-harness-setupenv-${PACKAGES.python}`)) continue;
      try {
        rmSync(join(tmpdir(), name), { recursive: true, force: true, maxRetries: 3 });
        removed = true;
      } catch { /* locked */ }
    }
  } catch { /* unreadable tmpdir */ }
  cachedPython = null;
  return removed;
}

/** Legacy single-directory clear, kept for callers that expect it. */
function clearSetupEnvCacheLegacy() {
  const dir = join(tmpdir(), `acc-harness-setupenv-${PACKAGES.python}`);
  if (!existsSync(dir)) return false;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    cachedPython = null;
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an ADI with a credited key page for `env`.
 * @returns {{adiUrl, keyBookUrl, keyPageUrl}} identifiers for the agent + assertions
 */
export async function provisionAdi(env, { credits = 2000 } = {}) {
  const python = await ensureSetupEnv();
  // QuickStart.setup_adi takes a bare label, not a URL.
  const adiName = env.suggestedAdiUrl.replace(/^acc:\/\//, '').replace(/\.acme$/, '');
  const cfg = JSON.stringify({ network: env.network, adiName, credits });

  let raw;
  try {
    raw = await runAsync(python, [SETUP_SCRIPT], {
      input: cfg,
      timeout: 420000,
      shell: false,
    });
  } catch (e) {
    const out = e.stdout?.toString?.() ?? '';
    try {
      const parsed = JSON.parse(out);
      if (parsed?.error) throw new SetupFailure(parsed.error);
    } catch (inner) {
      if (inner instanceof SetupFailure) throw inner;
    }
    throw new SetupFailure(`adi-setup.py failed: ${e.message}\n${(e.stderr?.toString?.() ?? '').slice(0, 2000)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SetupFailure(`adi-setup.py produced non-JSON output: ${raw.slice(0, 500)}`);
  }
  if (!parsed.ok) throw new SetupFailure(parsed.error || 'adi-setup.py reported failure');

  // The wallet object does not expose its lite URLs under a stable attribute
  // name, so derive them from the public key the setup returned. Deriving is
  // authoritative anyway — it is the same computation the protocol does.
  if (parsed.publicKeyHex && (!parsed.liteIdentityUrl || !parsed.liteTokenAccountUrl)) {
    try {
      const d = deriveLiteUrls(parsed.publicKeyHex);
      parsed.liteIdentityUrl = parsed.liteIdentityUrl || d.liteIdentity;
      parsed.liteTokenAccountUrl = parsed.liteTokenAccountUrl || d.liteTokenAccount;
    } catch {
      // Non-fatal: the ADI is what the task needs.
    }
  }

  return parsed;
}

/**
 * Confirm on chain that setup actually produced what it claims. Setup that
 * silently half-succeeds would surface as an SDK failure in the task run, which
 * is precisely the misattribution `harness-setup-failed` exists to prevent.
 */
export async function verifyAdiSetup(net, setupArtifacts) {
  // Accumulate settles via synthetic transactions, so a create that has been
  // submitted is not yet queryable. Poll rather than querying once — a single
  // immediate query reports "not on chain" for an ADI that appears seconds
  // later, which would spuriously fail every ADI-tier run.
  // 90s was not enough: a Kermit faucet deposit alone was measured settling in
  // ~85s, and an ADI plus its credited key page is several synthetic
  // transactions more. Runs aborted here are classed `harness-setup-failed` and
  // excluded from K2, so too tight a budget quietly shrinks the sample instead
  // of failing visibly. Budget for several times the observed settle time.
  const SETTLE_ATTEMPTS = 80;
  const SETTLE_DELAY_MS = 3000;
  const settleSeconds = Math.round((SETTLE_ATTEMPTS * SETTLE_DELAY_MS) / 1000);

  const adi = await waitForAccount(net, setupArtifacts.adiUrl, () => true, {
    attempts: SETTLE_ATTEMPTS,
    delayMs: SETTLE_DELAY_MS,
  });
  if (!adi) {
    throw new SetupFailure(
      `setup reported ${setupArtifacts.adiUrl} but it did not appear on chain within ${settleSeconds}s`,
    );
  }

  const page = await waitForAccount(
    net,
    setupArtifacts.keyPageUrl,
    (a) => Number(a.creditBalance ?? 0) > 0,
    { attempts: SETTLE_ATTEMPTS, delayMs: SETTLE_DELAY_MS },
  );
  if (!page) {
    throw new SetupFailure(
      `key page ${setupArtifacts.keyPageUrl} did not reach a positive credit balance within ${settleSeconds}s — ` +
        `it could not sign, so the task would fail for a harness reason`,
    );
  }

  return { adiType: adi.type, creditBalance: Number(page.creditBalance) };
}
