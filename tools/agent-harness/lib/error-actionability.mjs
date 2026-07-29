/**
 * K7 — error-actionability, measured against the live harness corpus (RB-05).
 *
 * Definition:
 *   An error is ACTIONABLE if it resolves to a catalog entry that carries a
 *   non-empty `remediation` and an explicit `retryable`.
 *   K7 = actionable ÷ distinct errors OBSERVED in the corpus.
 *
 * Measuring against the corpus rather than the catalog is deliberate: it scores
 * the errors agents actually hit, not the ones we happened to document. A
 * catalog can be made 100% self-consistent while covering nothing real.
 *
 * The extractor is deliberately CATALOG-INDEPENDENT. If candidates were pulled
 * using the catalog's own `messagePatterns`, every candidate would match by
 * construction and K7 would read 100% no matter how poor the coverage — the
 * same class of measurement bug RB-01's as-built documents. Instead a line
 * qualifies as an error candidate only by announcing itself as one, and the
 * catalog is then scored on how many of those it can explain.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** A line announces itself as an error. No catalog knowledge involved. */
const ANNOUNCES_ERROR = /(?:^|[^a-z])(error|failed|failure|rejected|exception|denied|refused)\b/i;

/** Reject markdown chrome and narration lead-ins (a sentence ending in ':'). */
function isNarration(line) {
  return /^[#>*\-|]/.test(line) || line.endsWith(':');
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

/**
 * Collect distinct observed error strings from a results directory:
 * transcripts plus the `error` field on run records.
 */
export function collectObservedErrors(resultsDir) {
  let files;
  try {
    files = walk(resultsDir);
  } catch {
    return [];
  }

  const seen = new Map();
  const add = (raw, source) => {
    const norm = String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
    if (norm.length < 12 || norm.length > 220) return;
    if (!seen.has(norm)) seen.set(norm, { text: norm, count: 0, source });
    seen.get(norm).count += 1;
  };

  for (const f of files) {
    if (f.endsWith('.txt')) {
      for (const line of readFileSync(f, 'utf-8').split('\n')) {
        const t = line.trim();
        if (!ANNOUNCES_ERROR.test(t) || isNarration(t)) continue;
        add(t, 'transcript');
      }
    } else if (f.endsWith('.json')) {
      let j;
      try {
        j = JSON.parse(readFileSync(f, 'utf-8'));
      } catch {
        continue;
      }
      if (j && j.task && j.error) add(j.error, 'run-record');
    }
  }
  return [...seen.values()];
}

/**
 * Resolve a raw error string to a catalog entry.
 *
 * Mirrors the precedence in the MCP server's `acc.explain_error`
 * (apps/mcp-server/src/tools/errors.ts) so the number the scorecard reports and
 * the answer an agent receives cannot disagree: exact code, then wire code,
 * then longest message pattern.
 */
export function matchCatalog(catalog, raw) {
  const text = String(raw).toLowerCase();

  const byCode = catalog.errors.find((e) => e.code.toLowerCase() === text.trim());
  if (byCode) return { entry: byCode, matchedBy: 'code' };

  for (const e of catalog.errors) {
    if ((e.protocolCodes || []).some((p) => text.includes(String(p)))) {
      return { entry: e, matchedBy: 'protocolCode' };
    }
  }

  let best = null;
  for (const e of catalog.errors) {
    for (const p of e.messagePatterns || []) {
      if (p && text.includes(p.toLowerCase()) && (!best || p.length > best.len)) {
        best = { entry: e, matchedBy: 'messagePattern', len: p.length };
      }
    }
  }
  return best ? { entry: best.entry, matchedBy: best.matchedBy } : null;
}

/** An entry is actionable only if it tells the agent what to do AND whether to retry. */
export function isActionable(entry) {
  return (
    typeof entry.retryable === 'boolean' &&
    typeof entry.remediation === 'string' &&
    entry.remediation.trim().length > 0
  );
}

/**
 * Compute K7.
 *
 * @returns {{value: string, status: string, observed: number, actionable: number, unmatched: string[]}}
 */
export function deriveK7(catalogPath, resultsDir) {
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  } catch {
    return { value: 'NO_CATALOG', status: 'PENDING', observed: 0, actionable: 0, unmatched: [] };
  }

  const observed = collectObservedErrors(resultsDir);
  if (!observed.length) {
    return {
      value: 'NO_CORPUS (no observed errors in the harness results)',
      status: 'PENDING',
      observed: 0,
      actionable: 0,
      unmatched: [],
    };
  }

  const unmatched = [];
  let actionable = 0;
  for (const o of observed) {
    const m = matchCatalog(catalog, o.text);
    if (m && isActionable(m.entry)) actionable += 1;
    else unmatched.push(o.text);
  }

  const pct = Math.round((actionable / observed.length) * 100);
  return {
    value: `${pct}% (${actionable}/${observed.length} distinct observed errors resolve to an actionable catalog entry) — catalog v${catalog.version}`,
    status: pct >= 95 ? 'GREEN' : 'RED',
    observed: observed.length,
    actionable,
    unmatched,
  };
}
