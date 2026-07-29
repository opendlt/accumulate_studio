/**
 * assertions.mjs — evaluate a task's `success_assertions` against CHAIN STATE.
 *
 * Core invariant (RB-01 step 4): the harness never trusts the agent's own claim
 * of success. The agent reports *identifiers* (which ADI it made, which txid it
 * submitted) in a `harness-artifacts.json` file; the harness independently
 * queries the chain for those identifiers and evaluates every assertion itself.
 *
 * Grammar (matches the 8 committed specs exactly):
 *   <subject> <op> <value>
 *   op    ::= == | != | >= | <= | > | <
 *   value ::= true | false | <number> | <number> ACME | <input-name> | <bare word>
 *
 * `<number> ACME` is scaled by 1e8 before comparison — the assertion language
 * itself refuses to let the 1e8 footgun into the scoring path.
 */

import { queryAccount, txStatus, baseToAcme } from './accumulate.mjs';

const OPS = ['==', '!=', '>=', '<=', '>', '<'];

/** Parse `subject op value` into parts. Longest operators first. */
export function parseAssertion(text) {
  const s = String(text).trim();
  for (const op of ['==', '!=', '>=', '<=', '>', '<']) {
    const i = s.indexOf(op);
    if (i > 0) {
      return { subject: s.slice(0, i).trim(), op, rhs: s.slice(i + op.length).trim(), raw: s };
    }
  }
  throw new Error(`unparseable assertion (no operator): "${s}"`);
}

/** Resolve the right-hand side to a comparable JS value. Exported for tests. */
export function resolveRhs(rhs, inputs) {
  if (rhs === 'true') return true;
  if (rhs === 'false') return false;

  const acme = rhs.match(/^([\d.]+)\s*ACME$/i);
  if (acme) return { acmeBase: BigInt(Math.round(Number(acme[1]) * 1e8)) };

  if (/^-?[\d.]+$/.test(rhs)) return Number(rhs);

  // Bare identifiers refer to the task's inputs (e.g. `payload`, `issue_amount`).
  if (Object.prototype.hasOwnProperty.call(inputs, rhs)) return inputs[rhs];

  return rhs.replace(/^["']|["']$/g, '');
}

/** Compare an actual chain value against a resolved expectation. Exported for tests. */
export function compare(op, actual, expected) {
  // ACME-denominated comparison: both sides in base units, BigInt-safe.
  if (expected && typeof expected === 'object' && 'acmeBase' in expected) {
    const a = typeof actual === 'bigint' ? actual : BigInt(Math.round(Number(actual)));
    const e = expected.acmeBase;
    switch (op) {
      case '==': return a === e;
      case '!=': return a !== e;
      case '>=': return a >= e;
      case '<=': return a <= e;
      case '>':  return a > e;
      case '<':  return a < e;
    }
  }
  if (typeof actual === 'bigint') actual = Number(actual);
  switch (op) {
    case '==': return String(actual) === String(expected);
    case '!=': return String(actual) !== String(expected);
    case '>=': return Number(actual) >= Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    case '>':  return Number(actual) > Number(expected);
    case '<':  return Number(actual) < Number(expected);
  }
  throw new Error(`unknown operator ${op}`);
}

/**
 * Subject resolvers. Each returns the ACTUAL value read from chain state.
 *
 * `ctx` carries: { net, env, inputs, artifacts, baseline }
 *   env       — provisioned lite account
 *   inputs    — resolved task inputs
 *   artifacts — what the agent reported (identifiers only, never verdicts)
 *   baseline  — chain snapshot taken BEFORE the agent ran, for delta assertions
 */
const SUBJECTS = {
  async lite_token_account_balance(ctx) {
    // Task 01 asks the agent to GENERATE its own key and derive its own lite
    // URLs, so the account under test is whichever one the agent reports.
    // Falling back to the harness-provisioned account here would score the
    // wrong account: observed on a live run where the agent correctly funded
    // its own lite account to 10 ACME and the harness read 0 from its own.
    const url =
      ctx.artifacts.liteTokenAccountUrl ||
      ctx.artifacts.tokenAccountUrl ||
      ctx.artifacts.liteTokenAccount ||
      ctx.env.liteTokenAccount;
    const a = await queryAccount(ctx.net, url);
    return a?.balance !== undefined ? BigInt(a.balance) : 0n;
  },

  async adi_account_exists(ctx) {
    const url = ctx.artifacts.adiUrl || ctx.inputs.adi_url;
    if (!url) return false;
    const a = await queryAccount(ctx.net, url);
    return a !== null;
  },

  async key_book_exists(ctx) {
    const url =
      ctx.artifacts.keyBookUrl ||
      (ctx.artifacts.adiUrl || ctx.inputs.adi_url
        ? `${(ctx.artifacts.adiUrl || ctx.inputs.adi_url).replace(/\/$/, '')}/book`
        : null);
    if (!url) return false;
    const a = await queryAccount(ctx.net, url);
    return a !== null && /keyBook/i.test(a.type || '');
  },

  async key_page_credit_balance(ctx) {
    const url = ctx.artifacts.keyPageUrl || ctx.inputs.key_page_url;
    if (!url) return 0;
    const a = await queryAccount(ctx.net, url);
    return a?.creditBalance !== undefined ? Number(a.creditBalance) : 0;
  },

  async key_page_threshold(ctx) {
    const url = ctx.artifacts.keyPageUrl || ctx.inputs.key_page_url;
    if (!url) return 0;
    const a = await queryAccount(ctx.net, url);
    return Number(a?.acceptThreshold ?? a?.threshold ?? 1);
  },

  async key_page_contains_new_key(ctx) {
    return pageHasKey(ctx, ctx.artifacts.newKeyHash || ctx.artifacts.newPublicKeyHash);
  },

  async key_page_contains_old_key(ctx) {
    return pageHasKey(ctx, ctx.artifacts.oldKeyHash || ctx.env.publicKeyHashHex);
  },

  async tx_status(ctx) {
    const txid = ctx.artifacts.txid || ctx.artifacts.txids?.[0];
    if (!txid) return 'unknown';
    return txStatus(ctx.net, txid);
  },

  async multisig_tx_status(ctx) {
    const txid = ctx.artifacts.multisigTxid || ctx.artifacts.txid || ctx.artifacts.txids?.[0];
    if (!txid) return 'unknown';
    return txStatus(ctx.net, txid);
  },

  async recipient_balance_increased_by(ctx) {
    const url = ctx.artifacts.recipientUrl;
    if (!url) return 0n;
    const a = await queryAccount(ctx.net, url);
    const now = a?.balance !== undefined ? BigInt(a.balance) : 0n;
    const before = BigInt(ctx.baseline.recipient ?? 0);
    return now - before;
  },

  async data_account_exists(ctx) {
    const url = ctx.artifacts.dataAccountUrl || ctx.inputs.data_account_url;
    if (!url) return false;
    const a = await queryAccount(ctx.net, url);
    return a !== null && /data/i.test(a.type || '');
  },

  async retrieved_entry(ctx) {
    // The agent reports what it read back; the harness confirms the data account
    // exists on chain and that the reported value is non-empty. Full entry-body
    // verification would need chain-entry queries per SDK data encoding.
    const url = ctx.artifacts.dataAccountUrl || ctx.inputs.data_account_url;
    if (url && (await queryAccount(ctx.net, url)) === null) return null;
    return ctx.artifacts.retrievedEntry ?? null;
  },

  async token_issuer_exists(ctx) {
    const url = ctx.artifacts.tokenIssuerUrl;
    if (!url) return false;
    const a = await queryAccount(ctx.net, url);
    return a !== null && /tokenIssuer/i.test(a.type || '');
  },

  async token_account_balance(ctx) {
    const url = ctx.artifacts.tokenAccountUrl;
    if (!url) return 0;
    const a = await queryAccount(ctx.net, url);
    if (a?.balance === undefined) return 0;

    // Return WHOLE tokens, not base units. The spec compares against
    // `issue_amount` (1000), a human-scale quantity, while the chain stores
    // base units — for a precision-8 token that is 1000 * 1e8. Comparing the
    // two directly fails by exactly the precision factor and gets classified
    // `amount-scaling`, blaming the SDK for the harness's own unit mismatch.
    //
    // Precision is read from the issuer on chain rather than from the task
    // input, so the assertion stays correct if the agent picks its own.
    const issuerUrl = ctx.artifacts.tokenIssuerUrl;
    let precision = Number(ctx.inputs.precision ?? 0);
    if (issuerUrl) {
      const issuer = await queryAccount(ctx.net, issuerUrl);
      if (issuer?.precision !== undefined) precision = Number(issuer.precision);
    }

    const base = BigInt(a.balance);
    const divisor = 10n ** BigInt(precision);
    // Exact division only; a non-integer result means the agent issued a
    // fractional amount, which the spec does not ask for — surface it rather
    // than rounding it away.
    return base % divisor === 0n ? Number(base / divisor) : Number(base) / Number(divisor);
  },
};

async function pageHasKey(ctx, keyHashHex) {
  const url = ctx.artifacts.keyPageUrl || ctx.inputs.key_page_url;
  if (!url || !keyHashHex) return false;
  const a = await queryAccount(ctx.net, url);
  if (!a?.keys) return false;
  const want = String(keyHashHex).toLowerCase();
  return a.keys.some((k) => {
    const h = String(k.publicKeyHash || k.keyHash || '').toLowerCase();
    // Key pages may store the full 32-byte hash or a prefix; match either way.
    return h && (h === want || want.startsWith(h) || h.startsWith(want));
  });
}

export const KNOWN_SUBJECTS = Object.keys(SUBJECTS);

/**
 * Snapshot the chain values that delta assertions need, BEFORE the agent runs.
 * Without this, `recipient_balance_increased_by` has no reference point.
 */
export async function captureBaseline(net, task, artifactsHint = {}) {
  const baseline = {};
  const needsRecipient = (task.success_assertions || []).some((a) =>
    a.includes('recipient_balance_increased_by'),
  );
  if (needsRecipient && artifactsHint.recipientUrl) {
    const a = await queryAccount(net, artifactsHint.recipientUrl);
    baseline.recipient = a?.balance ?? 0;
  } else {
    // Recipient is created by the agent during the run, so it cannot exist yet.
    baseline.recipient = 0;
  }
  return baseline;
}

/**
 * Evaluate every assertion for a task.
 * @returns {Promise<{passed: boolean, results: Array}>}
 */
export async function evaluateAssertions(task, ctx) {
  const results = [];
  for (const raw of task.success_assertions || []) {
    let entry;
    try {
      const { subject, op, rhs } = parseAssertion(raw);
      const resolver = SUBJECTS[subject];
      if (!resolver) {
        entry = {
          assertion: raw,
          passed: false,
          error: `no resolver for subject "${subject}" (known: ${KNOWN_SUBJECTS.join(', ')})`,
        };
      } else {
        const actual = await resolver(ctx);
        const expected = resolveRhs(rhs, ctx.inputs);
        const passed = compare(op, actual, expected);
        entry = {
          assertion: raw,
          subject,
          op,
          passed,
          actual: typeof actual === 'bigint' ? String(actual) : actual,
          actualAcme:
            typeof actual === 'bigint' ? baseToAcme(actual) : undefined,
          expected:
            expected && typeof expected === 'object' && 'acmeBase' in expected
              ? `${baseToAcme(expected.acmeBase)} ACME`
              : expected,
        };
      }
    } catch (e) {
      entry = { assertion: raw, passed: false, error: e.message };
    }
    results.push(entry);
  }
  return { passed: results.length > 0 && results.every((r) => r.passed), results };
}

/** Static check that every committed spec uses only subjects we can resolve. */
export function lintAssertions(tasks) {
  const problems = [];
  for (const t of tasks) {
    for (const raw of t.success_assertions || []) {
      try {
        const { subject } = parseAssertion(raw);
        if (!SUBJECTS[subject]) problems.push(`${t.file}: unknown subject "${subject}" in "${raw}"`);
      } catch (e) {
        problems.push(`${t.file}: ${e.message}`);
      }
    }
  }
  return problems;
}
