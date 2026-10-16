/**
 * Shared assertions for the hash-lock template in the five *-validation suites.
 *
 * The mock harnesses answer the generated program through `htlc_mock.py`, which plays the node's
 * side of a hash lock and reports what it saw under `report.htlc`. "Exit code 0" proves little
 * for these programs, so the suites assert on that node-side view instead: the lock was
 * accepted, the deposit was found, the release was accepted by the preimage rule, and the
 * program broke none of the protocol rules the mock checks.
 */

import { expect } from 'vitest';
import type { Flow } from '@accumulate-studio/types';

export const HASH_LOCK = 'hash-lock';

/** The wrong-but-well-formed preimage (32 bytes of hex) the negative test reveals. */
export const WRONG_PREIMAGE = 'ab'.repeat(32);

export interface HtlcSummary {
  locked_sends: number;
  locked_deposits_found: number;
  releases: Array<{ ok: boolean; error: string | null }>;
  released_deposits: number;
  violations: string[];
}

export interface HarnessReport {
  success: boolean;
  calls: Array<{ method: string; params?: Record<string, unknown> }>;
  call_count: number;
  error: string | null;
  htlc?: HtlcSummary;
}

/**
 * Environment for a harness run. The hash-lock template gets the FAITHFUL node mock (full TxID
 * URLs, string statuses, the real two-entry submit response); every other template keeps the
 * legacy responses so their baselines do not move.
 */
export function harnessEnv(templateName: string): NodeJS.ProcessEnv {
  return templateName === HASH_LOCK ? { ...process.env, HTLC_MOCK_FAITHFUL: '1' } : process.env;
}

/** The happy path: the whole flow ran and the node-side mock saw a correct lock and release. */
export function expectHashLockRun(report: HarnessReport | null): void {
  expect(report, 'the harness produced no JSON report').not.toBeNull();
  const r = report!;
  expect(r.error, `harness error: ${r.error}`).toBeNull();
  expect(r.success).toBe(true);
  expect(r.htlc, 'the program never reached the hash-lock steps').toBeDefined();
  const h = r.htlc!;
  expect(h.violations, `protocol rules broken: ${h.violations.join('; ')}`).toEqual([]);
  expect(h.locked_sends).toBe(1);
  expect(h.locked_deposits_found, 'the locked deposit was never found').toBe(1);
  expect(h.releases).toEqual([{ ok: true, error: null }]);
  expect(h.released_deposits).toBe(1);
}

/**
 * The negative path: revealing the wrong preimage is accepted at submit and fails at execute, and
 * the generated program must surface that as a non-zero exit, not carry on.
 */
export function expectWrongPreimageRejected(report: HarnessReport | null): void {
  expect(report, 'the harness produced no JSON report').not.toBeNull();
  const r = report!;
  expect(r.success, 'the program exited 0 although the node rejected the release').toBe(false);
  expect(r.htlc, 'the program never reached the release').toBeDefined();
  expect(r.htlc!.releases).toEqual([{ ok: false, error: 'preimage does not match hash' }]);
  expect(r.htlc!.released_deposits).toBe(0);
}

/** The same flow, but the release reveals a wrong (well-formed) literal preimage. */
export function wrongPreimageFlow(flow: Flow): Flow {
  const copy = JSON.parse(JSON.stringify(flow)) as Flow;
  const release = copy.nodes.find((n) => n.id === 'release_locked');
  if (!release) throw new Error('hash-lock flow has no release_locked node');
  (release.config as Record<string, unknown>).preimage = WRONG_PREIMAGE;
  return copy;
}
