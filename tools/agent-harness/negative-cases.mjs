#!/usr/bin/env node
/**
 * negative-cases.mjs — RB-05 step 1: harvest REAL errors from a live network.
 *
 * K7 scores the errors agents actually hit. Before this, the corpus was whatever
 * errors happened to appear in 68 agent transcripts — and because those
 * transcripts are agent *summaries* rather than raw protocol logs, only four
 * distinct self-announced error strings existed across all of them. K7 = 100%
 * over n=4 is honest but nearly meaningless.
 *
 * This deliberately provokes error responses from a live node and records the
 * verbatim wire payloads, so the catalog is measured against observed reality
 * rather than imagination.
 *
 * Records are written in the harness record shape into
 * `results/<date>/negative/`, a directory `loadRuns` does NOT read for `sdk`
 * mode — so this enlarges the K7 corpus without touching K2/K3.
 *
 * Usage: node tools/agent-harness/negative-cases.mjs [--network kermit]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const NETWORKS = {
  kermit: 'https://kermit.accumulatenetwork.io/v2',
  testnet: 'https://testnet.accumulatenetwork.io/v2',
};
const netArg = process.argv.indexOf('--network');
const network = netArg > -1 ? process.argv[netArg + 1] : 'kermit';
const endpoint = NETWORKS[network];
if (!endpoint) {
  console.error(`unknown network "${network}" — known: ${Object.keys(NETWORKS).join(', ')}`);
  process.exit(2);
}

/**
 * Each case names the catalog code we EXPECT, so a mismatch is visible rather
 * than silently absorbed. `expect: null` means "we do not yet know" — the point
 * is to capture the payload, not to assert.
 */
const CASES = [
  {
    id: 'query-nonexistent-account',
    expect: 'ACC_ACCOUNT_NOT_FOUND',
    method: 'query',
    params: { url: 'acc://does-not-exist-9f3a2b7c1d.acme' },
  },
  {
    id: 'query-nonexistent-token-account',
    expect: 'ACC_ACCOUNT_NOT_FOUND',
    method: 'query',
    params: { url: 'acc://does-not-exist-9f3a2b7c1d.acme/tokens' },
  },
  {
    id: 'query-malformed-url',
    expect: 'ACC_INVALID_URL',
    method: 'query',
    params: { url: 'not-a-valid-accumulate-url' },
  },
  {
    id: 'query-missing-required-param',
    expect: 'ACC_INVALID_PARAMS',
    method: 'query',
    params: {},
  },
  {
    id: 'unknown-rpc-method',
    expect: 'ACC_METHOD_NOT_FOUND',
    method: 'this-method-does-not-exist',
    params: {},
  },
  {
    id: 'query-nonexistent-transaction',
    expect: null,
    method: 'query-tx',
    params: { txid: 'a'.repeat(64) },
  },
  {
    id: 'submit-unsigned-envelope',
    expect: 'ACC_NOT_SIGNED',
    method: 'execute-direct',
    params: { envelope: { transaction: [{ header: { principal: 'acc://does-not-exist-9f3a2b7c1d.acme' }, body: { type: 'sendTokens' } }] } },
  },
  {
    id: 'submit-garbage-envelope',
    expect: null,
    method: 'execute-direct',
    params: { envelope: {} },
  },
];

async function callRpc(method, params) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { httpStatus: res.status, json, text };
}

const date = new Date().toISOString().slice(0, 10);
const outDir = join(HERE, 'results', date, 'negative');
mkdirSync(outDir, { recursive: true });

const summary = [];
for (const c of CASES) {
  let record;
  try {
    const { httpStatus, json, text } = await callRpc(c.method, c.params);
    const err = json?.error;
    // The error string an agent would actually hold: what the SDK surfaces.
    const errorString = err
      ? `${err.message ?? ''}${err.data ? ` ${typeof err.data === 'string' ? err.data : JSON.stringify(err.data)}` : ''}`.trim() ||
        JSON.stringify(err)
      : json?.result
        ? null
        : text.slice(0, 300);

    record = {
      schema: 1,
      mode: 'negative',
      network,
      task: { id: c.id, expectedCode: c.expect, method: c.method },
      passed: false,
      // `error` is the field lib/error-actionability.mjs harvests.
      error: errorString,
      wire: { httpStatus, code: err?.code ?? null, message: err?.message ?? null, data: err?.data ?? null },
      producedError: Boolean(errorString),
      startedAt: new Date().toISOString(),
    };
  } catch (e) {
    record = {
      schema: 1,
      mode: 'negative',
      network,
      task: { id: c.id, expectedCode: c.expect, method: c.method },
      passed: false,
      error: String(e.message),
      wire: { transportFailure: true },
      producedError: true,
      startedAt: new Date().toISOString(),
    };
  }

  writeFileSync(join(outDir, `${c.id}.json`), JSON.stringify(record, null, 2) + '\n');
  summary.push({ id: c.id, code: record.wire?.code ?? null, error: record.error });
}

console.log(`Wrote ${summary.length} negative-case records to results/${date}/negative/\n`);
for (const s of summary) {
  console.log(`  ${s.id}`);
  console.log(`    wire code: ${s.code ?? '(none)'}`);
  console.log(`    error:     ${s.error ? String(s.error).replace(/\s+/g, ' ').slice(0, 150) : '(no error — request SUCCEEDED)'}`);
}
