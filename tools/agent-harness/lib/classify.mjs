/**
 * classify.mjs — failure taxonomy (RB-01 "Failure classification").
 *
 * A bare pass rate does not tell you what to fix. The CLASS is the
 * prioritization input for RB-02..RB-06, so every failure must carry one.
 *
 * `network-flake` is excluded from the K2 denominator — otherwise K2 measures
 * testnet uptime rather than SDK quality.
 */

export const FAILURE_CLASSES = {
  'amount-scaling':      { excludeFromK2: false, fixedBy: ['RB-03', 'RB-05'] },
  'missing-prereq':      { excludeFromK2: false, fixedBy: ['RB-02', 'RB-05'] },
  'wrong-symbol':        { excludeFromK2: false, fixedBy: ['RB-03'] },
  'error-opaque':        { excludeFromK2: false, fixedBy: ['RB-05'] },
  'install-fail':        { excludeFromK2: false, fixedBy: ['RB-06'] },
  'network-flake':       { excludeFromK2: true,  fixedBy: [] },
  // The agent backend refused to run (session/usage limit, rate limit, auth).
  // No SDK was exercised, so this must not count toward K2 — exactly like
  // network-flake. Observed: 'You've hit your session limit', which produced
  // 1-turn 4-second runs scored as `no-artifacts` against the SDK.
  'agent-unavailable':   { excludeFromK2: true,  fixedBy: [] },
  // A harness setup problem is never an SDK-under-test defect, so like
  // network-flake it must not contaminate K2.
  'harness-setup-failed': { excludeFromK2: true, fixedBy: [] },
  'timeout':             { excludeFromK2: false, fixedBy: [] },
  'no-artifacts':        { excludeFromK2: false, fixedBy: ['RB-03'] },
  other:                 { excludeFromK2: false, fixedBy: [] },
};

export const CLASS_NAMES = Object.keys(FAILURE_CLASSES);

/**
 * Ordered rules. First match wins, so the most specific patterns come first.
 * Each rule inspects the agent transcript, stderr, and the assertion results.
 */
const RULES = [
  {
    cls: 'agent-unavailable',
    test: (t) =>
      /(hit your session limit|usage limit reached|rate limit exceeded|quota exceeded|too many requests.*anthropic|invalid api key|authentication_error|credit balance is too low)/i.test(t),
  },
  {
    // A DEFINITIVE packaging failure wins even when the log also mentions a
    // timeout: "no matching distribution" tells us the package is genuinely
    // wrong, which is the actionable finding.
    cls: 'install-fail',
    test: (t) =>
      /(could not find a version|no matching distribution|ERR_MODULE_NOT_FOUND|error\[E0432\]|unable to resolve|could not resolve dependencies|NU1101|package .* not found|failed to select a version)/i.test(t),
  },
  {
    // Everything else that fails around the registry is an ENVIRONMENT problem,
    // not an SDK defect, so it must not count toward K2. `is not valid JSON`
    // covers an intercepting proxy returning HTML: npm reported
    // `Unexpected token 'P', "Per anonym"... is not valid JSON`, which carries
    // no packaging signal at all, yet sank 7 of 8 JavaScript runs as
    // install-fail.
    cls: 'network-flake',
    test: (t) =>
      /(is not valid JSON|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|502 Bad Gateway|503 Service|504 Gateway|429 Too Many|ERR_SOCKET_TIMEOUT|tunneling socket|faucet .*(unavailable|rejected)|did not settle)/i.test(t),
  },
  {
    cls: 'amount-scaling',
    test: (t, ctx) => {
      if (/(insufficient (balance|funds)|amount too (small|large)|invalid amount)/i.test(t)) return true;
      // A balance assertion that missed by exactly 1e8 is the classic footgun.
      return (ctx.assertionResults || []).some((r) => {
        if (r.passed || r.actual === undefined || r.expected === undefined) return false;
        const a = Number(r.actual);
        const e = Number(String(r.expected).replace(/[^\d.]/g, ''));
        if (!isFinite(a) || !isFinite(e) || a === 0 || e === 0) return false;
        const ratio = a > e ? a / e : e / a;
        return Math.abs(ratio - 1e8) / 1e8 < 0.01;
      });
    },
  },
  {
    cls: 'missing-prereq',
    test: (t) =>
      /(insufficient credits|not enough credits|credit balance|transaction is not signed|no credits|missing (signer|authority)|unauthorized signature|acme is not a credit)/i.test(t),
  },
  {
    cls: 'wrong-symbol',
    test: (t) =>
      /(AttributeError|has no attribute|is not a function|cannot find name|no method named|does not contain a definition|NameError|ImportError|CS0117|CS1061|undefined method)/i.test(t),
  },
  {
    cls: 'error-opaque',
    test: (t) =>
      /(unknown error|unexpected error|internal error|error: \{\}|Exception: None|panicked at)/i.test(t),
  },
];

/**
 * Classify a failed run.
 * @param {object} ctx { transcript, stderr, assertionResults, timedOut, artifacts }
 * @returns {string} a key of FAILURE_CLASSES
 */
export function classifyFailure(ctx = {}) {
  if (ctx.timedOut) return 'timeout';

  const haystack = [ctx.transcript || '', ctx.stderr || '', JSON.stringify(ctx.assertionResults || [])].join('\n');

  for (const rule of RULES) {
    try {
      if (rule.test(haystack, ctx)) return rule.cls;
    } catch {
      // A rule that throws must never take the run down with it.
    }
  }

  // The agent produced nothing to verify — it never reported identifiers.
  if (!ctx.artifacts || Object.keys(ctx.artifacts).length === 0) return 'no-artifacts';

  return 'other';
}

/** Does this class count toward K2? */
export function countsTowardK2(cls) {
  return !(FAILURE_CLASSES[cls]?.excludeFromK2 ?? false);
}

/** Aggregate a run set into a class -> count map, for the scorecard table. */
export function summarizeFailures(runs) {
  const counts = {};
  for (const r of runs) {
    if (r.passed) continue;
    const c = r.failureClass || 'other';
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}
