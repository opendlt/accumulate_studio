#!/usr/bin/env node
/**
 * provision.mjs — per-run environment provisioning (RB-01 step 2).
 *
 * Each run gets its OWN funded lite account. Sharing one account across runs
 * makes concurrent runs race on balance/credits and produces phantom
 * `missing-prereq` failures that look like SDK defects.
 *
 * Faucet unavailability is surfaced as NetworkUnreachable so the runner can
 * classify it `network-flake` and exclude it from K2 — otherwise K2 measures
 * testnet uptime instead of SDK quality.
 *
 * Usage (standalone smoke test, spends real testnet faucet):
 *   node tools/agent-harness/provision.mjs --network kermit
 */

import {
  resolveNetwork,
  faucet,
  waitForAccount,
  queryAccount,
  NetworkUnreachable,
  baseToAcme,
} from './lib/accumulate.mjs';
import { generateLiteAccount, suggestAdiUrl } from './lib/lite.mjs';
import { pathToFileURL } from 'node:url';

/**
 * Provision a funded lite token account.
 *
 * @param {object} opts
 * @param {string} opts.network   network spec (e.g. 'kermit-testnet')
 * @param {number} opts.minAcme   minimum settled balance before returning
 * @param {number} opts.faucetTimes  faucet calls (each yields ~10 ACME on Kermit)
 * @returns {Promise<object>} keypair + URLs + settled balance
 */
export async function provisionLiteAccount({
  network = 'kermit',
  minAcme = 5,
  faucetTimes = 1,
  fund = true,
  log = () => {},
} = {}) {
  const net = resolveNetwork(network);
  const acct = generateLiteAccount();

  log(`provision: ${acct.liteTokenAccount}${fund ? '' : ' (keys only — agent funds it)'}`);

  // keys-only: the task asks the agent to fund the account, so funding it here
  // would make the balance assertion pass vacuously.
  if (!fund) {
    return {
      network: net.id,
      ...acct,
      funded: false,
      balanceBase: '0',
      balanceAcme: 0,
      suggestedAdiUrl: suggestAdiUrl(),
    };
  }

  for (let i = 0; i < faucetTimes; i++) {
    try {
      await faucet(net, acct.liteTokenAccount);
    } catch (e) {
      if (e instanceof NetworkUnreachable) throw e;
      // A faucet that answers with an RPC error is still a faucet problem, not
      // a task problem — the agent has not run yet.
      throw new NetworkUnreachable(`faucet rejected ${acct.liteTokenAccount}: ${e.message}`);
    }
  }

  const minBase = BigInt(Math.round(minAcme * 1e8));

  // A Kermit faucet deposit was measured settling in ~85s, against a former
  // 120s budget that also had to absorb the faucet calls themselves. That left
  // ~35s of headroom, so ordinary testnet contention aborted provisioning
  // before the agent ever started — reported as `network-flake`, which is
  // excluded from K2 and therefore silently shrinks the sample rather than
  // failing loudly. Budget for several times the observed settle time.
  const FAUCET_SETTLE_ATTEMPTS = 80;
  const FAUCET_SETTLE_DELAY_MS = 3000;
  // Re-issue the faucet instead of waiting out the whole budget on one request.
  // Kermit's faucet was observed accepting a call and never delivering — waiting
  // longer cannot rescue a dropped transaction, but asking again can. Each round
  // waits, then re-faucets, so a single lost request costs a round rather than
  // the run.
  const ROUNDS = 4;
  const perRound = Math.ceil(FAUCET_SETTLE_ATTEMPTS / ROUNDS);
  // Hold the ACCOUNT, not a boolean: the caller below reads settled.balance.
  let settled = null;
  for (let round = 0; round < ROUNDS && !settled; round++) {
    if (round > 0) {
      log(`faucet did not deliver within ${Math.round((perRound * FAUCET_SETTLE_DELAY_MS) / 1000)}s — re-requesting`);
      try {
        await faucet(net, acct.liteTokenAccount);
      } catch {
        // A failed re-request is not fatal; the next round tries again.
      }
    }
    settled = await waitForAccount(
      net,
      acct.liteTokenAccount,
      (a) => a.balance !== undefined && BigInt(a.balance) >= minBase,
      { attempts: perRound, delayMs: FAUCET_SETTLE_DELAY_MS },
    );
  }

  if (!settled) {
    const waited = Math.round((FAUCET_SETTLE_ATTEMPTS * FAUCET_SETTLE_DELAY_MS) / 1000);
    throw new NetworkUnreachable(
      `faucet funds for ${acct.liteTokenAccount} did not settle to >= ${minAcme} ACME within ${waited}s`,
    );
  }

  log(`provision: settled at ${baseToAcme(settled.balance)} ACME`);

  return {
    network: net.id,
    ...acct,
    funded: true,
    balanceBase: String(settled.balance),
    balanceAcme: baseToAcme(settled.balance),
    suggestedAdiUrl: suggestAdiUrl(),
  };
}

/**
 * Decide what to provision from the task's DECLARED preconditions.
 *
 * This is a correctness requirement, not an optimization. Task 01 declares
 * `preconditions: []` — funding the lite account is part of what the agent is
 * being asked to do. Pre-funding it makes `lite_token_account_balance > 0` pass
 * without the agent doing anything: a false pass. (Observed on the first live
 * run; the harness scored a PASS for an agent that never executed.)
 *
 * Tiers:
 *   keys-only   — generate a keypair; the agent funds it   (task 01)
 *   funded      — keypair + faucet + settled balance        (tasks 02, 04)
 *   adi         — funded, plus an ADI with a credited key page (03, 05-08)
 */
export function provisioningPlan(task) {
  const pre = (task.preconditions || []).join(' | ').toLowerCase();
  if (/existing adi/.test(pre)) return 'adi';
  if (/funded lite token account|purchased credits/.test(pre)) return 'funded';
  return 'keys-only';
}

/**
 * Build the concrete inputs handed to the agent for a task, resolving the
 * `<generated>` placeholders the specs use (e.g. `acc://<generated>.acme`).
 */
export function resolveTaskInputs(task, env) {
  const out = {};
  for (const [k, v] of Object.entries(task.inputs || {})) {
    out[k] =
      typeof v === 'string' && v.includes('<generated>')
        ? v.replace('acc://<generated>.acme', env.suggestedAdiUrl)
        : v;
  }
  return out;
}

/** Does this task need an ADI to already exist before the agent starts? */
export function needsPreexistingAdi(task) {
  return (task.preconditions || []).some((p) => /existing ADI/i.test(p));
}

// --- standalone smoke test --------------------------------------------------
// pathToFileURL, not string concatenation: on Windows the URL is file:///C:/...
// (three slashes), so a hand-built `file://${path}` never matches.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const netArg = process.argv.includes('--network')
    ? process.argv[process.argv.indexOf('--network') + 1]
    : 'kermit';
  provisionLiteAccount({ network: netArg, log: (m) => console.error(m) })
    .then((env) => {
      console.log(JSON.stringify(env, null, 2));
    })
    .catch((e) => {
      console.error(`provision failed (${e.name}): ${e.message}`);
      process.exit(e instanceof NetworkUnreachable ? 3 : 1);
    });
}
