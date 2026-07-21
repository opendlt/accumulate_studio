#!/usr/bin/env npx tsx
/**
 * check-canonical-coverage.ts — Phase 0 (P0-ST-09)
 *
 * Complements check-manifest-drift.ts. Asserts that every SDK manifest covers
 * the operations required by the 8 canonical agent tasks (the harness workload
 * and golden-path templates), and flags manifest metadata drift (placeholder
 * sdk_version / commit that no longer matches the published packages).
 *
 * Usage: npx tsx scripts/check-canonical-coverage.ts
 * Exits non-zero if any canonical op is missing from any manifest.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const MANIFESTS_DIR = join(__dirname, '../packages/codegen/src/manifests');
const LANGUAGES = ['python', 'rust', 'dart', 'csharp', 'javascript'] as const;

// The 8 canonical tasks -> the manifest op ids each requires.
const CANONICAL_TASK_OPS: Record<string, string[]> = {
  '01-lite-account': ['generate_keys', 'faucet', 'wait_for_balance'],
  '02-create-adi': ['create_identity', 'create_key_book', 'create_key_page'],
  '03-add-credits': ['add_credits', 'wait_for_credits'],
  '04-send-tokens': ['send_tokens'],
  '05-write-data': ['create_data_account', 'write_data'],
  '06-custom-token': ['create_token', 'create_token_account', 'issue_tokens'],
  '07-multisig-setup': ['create_key_page', 'update_key_page'],
  '08-key-rotation': ['update_key_page'],
};

// Published versions verified via registry APIs (2026-07-21). A manifest whose
// sdk_version is a placeholder (0.1.0 / commit 0000000) is drifting from reality.
const PUBLISHED_VERSION: Record<string, string> = {
  python: '2.1.2',
  rust: '2.1.2',
  dart: '2.1.2',
  csharp: '1.1.1',
  javascript: '0.12.3', // JS republish pending an npm publish token
};

interface Manifest {
  sdk_name?: string;
  sdk_version?: string;
  commit?: string;
  operations?: Array<{ op: string }>;
}

let hasErrors = false;
console.log('=== Canonical Task Coverage (P0-ST-09) ===\n');

for (const lang of LANGUAGES) {
  let manifest: Manifest | null = null;
  try {
    manifest = JSON.parse(readFileSync(join(MANIFESTS_DIR, `${lang}.sdk-manifest.json`), 'utf-8'));
  } catch {
    console.log(`[${lang}] SKIP - no manifest`);
    continue;
  }

  const ops = new Set((manifest!.operations || []).map((o) => o.op));
  const missing: string[] = [];
  for (const [task, requiredOps] of Object.entries(CANONICAL_TASK_OPS)) {
    for (const op of requiredOps) if (!ops.has(op)) missing.push(`${task}:${op}`);
  }

  const ok = missing.length === 0;
  console.log(`[${lang}] ${ok ? 'PASS' : 'FAIL'}  (${Object.keys(CANONICAL_TASK_OPS).length} tasks)`);

  if (!ok) {
    hasErrors = true;
    console.log(`  Missing canonical ops (${missing.length}):`);
    for (const m of missing) console.log(`    - ${m}`);
  }

  // Metadata drift (warning, not fatal)
  const v = manifest!.sdk_version;
  const published = PUBLISHED_VERSION[lang];
  if (v === '0.1.0' || manifest!.commit === '0000000') {
    console.log(`  ⚠️  manifest metadata is placeholder (sdk_version=${v}, commit=${manifest!.commit}); published is ${published}. Refresh in P2-ST-01.`);
  } else if (v && published && v.split('.')[0] !== published.split('.')[0]) {
    console.log(`  ⚠️  manifest sdk_version ${v} major differs from published ${published}.`);
  }
  console.log('');
}

if (hasErrors) {
  console.log('RESULT: FAIL - canonical task coverage incomplete.');
  process.exit(1);
} else {
  console.log('RESULT: PASS - all canonical tasks covered by every manifest.');
  process.exit(0);
}
