#!/usr/bin/env node
/**
 * generate-agent-artifacts.mjs — Phase 2 (P2-ST-02/03/05)
 *
 * Single source of truth -> agent artifacts. Reads the per-language SDK manifests
 * (packages/codegen/src/manifests/*.sdk-manifest.json) and emits, per SDK:
 *   - llms.txt       : concise router an agent loads first
 *   - llms-full.txt  : the complete API digest (every operation)
 *   - AGENTS.md      : agent rules (golden path, amount scaling, error handling)
 * Plus a top-level llms.txt router across all five SDKs.
 *
 * Nothing here is hand-maintained per language: change the manifest, re-run, and
 * all artifacts update. Curated per-language facts (install/import/conventions)
 * live in LANG_META below.
 *
 * Usage:
 *   node scripts/generate-agent-artifacts.mjs            # writes into docs/ai-agent-readiness/generated/<lang>/
 *   node scripts/generate-agent-artifacts.mjs --dist     # ALSO writes llms.txt/llms-full.txt/AGENTS.md into each SDK repo root
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const MANIFESTS = join(REPO, 'packages', 'codegen', 'src', 'manifests');
const OUT = join(REPO, 'docs', 'ai-agent-readiness', 'generated');
const SDK_ROOT = 'C:/Accumulate_Stuff';

const LANGS = ['python', 'rust', 'dart', 'csharp', 'javascript'];

// Curated, authoritative per-language facts (verified published state, 2026-07-21).
const LANG_META = {
  python: {
    display: 'Python',
    pkg: 'accumulate-sdk-opendlt',
    install: 'pip install accumulate-sdk-opendlt',
    import: 'from accumulate_client import Accumulate, TxBody, SmartSigner, QuickStart',
    connect: 'client = QuickStart.kermit()   # or Accumulate.testnet()/mainnet()/devnet()',
    sign: 'result = SmartSigner(signer).sign_submit_and_wait(principal, body)',
    comment: '#',
    examples: 'examples/v3/',
    distDir: 'opendlt-python-v2v3-sdk/unified',
  },
  rust: {
    display: 'Rust',
    pkg: 'accumulate-sdk',
    install: 'cargo add accumulate-sdk',
    import: 'use accumulate_client::{QuickStart, TxBody, SmartSigner};',
    connect: 'let qs = QuickStart::kermit().await?;   // crate: accumulate-sdk, import path: accumulate_client',
    sign: 'let r = signer.sign_submit_and_wait(principal, body).await?;',
    examples: 'examples/v3/',
    distDir: 'opendlt-rust-v2v3-sdk/unified',
  },
  dart: {
    display: 'Dart',
    pkg: 'opendlt_accumulate',
    install: 'dart pub add opendlt_accumulate',
    import: "import 'package:opendlt_accumulate/opendlt_accumulate.dart';",
    connect: 'final client = Accumulate.network(NetworkEndpoint.testnet);   // or QuickStart.testnet()',
    sign: 'final r = await SmartSigner(signer).signSubmitAndWait(principal, body);',
    examples: 'example/v3/',
    distDir: 'opendlt-dart-v2v3-sdk/unified',
  },
  csharp: {
    display: 'C#',
    pkg: 'Acme.Net.Sdk',
    install: 'dotnet add package Acme.Net.Sdk',
    import: 'using Acme.Net.Sdk;',
    connect: 'var client = Accumulate.Kermit();   // or Accumulate.Testnet()/Mainnet()/Devnet()',
    sign: 'var r = await new SmartSigner(signer).SignSubmitAndWaitAsync(principal, body);',
    examples: 'examples/v3/',
    distDir: 'opendlt-c-sharp-v2v3-sdk',
  },
  javascript: {
    display: 'JavaScript / TypeScript',
    pkg: 'accumulate-sdk-opendlt',
    install: 'npm install accumulate-sdk-opendlt',
    import: "import { Accumulate, TxBody, SmartSigner, QuickStart } from 'accumulate-sdk-opendlt';",
    connect: 'const client = Accumulate.forKermit();   // or forMainnet()/forDevnet()',
    sign: 'const r = await new SmartSigner(signer).signSubmitAndWait(principal, body);',
    examples: 'examples/v3/',
    distDir: 'opendlt-javascript-v2v3-sdk/javascript',
  },
};

const CONVENTIONS = [
  'Networks: Kermit testnet (used by the examples; fund via faucet), plus mainnet and local devnet.',
  'Amounts: ACME is denominated in base units where 1 ACME = 1e8 base units. Passing whole ACME as-is is the single most common integration bug.',
  'Credits: buying credits uses the network oracle price; an ADI/key page must hold credits before it can sign transactions.',
  'Golden path: connect -> build a body with TxBody.<op>(...) -> sign+submit+wait with SmartSigner -> query to confirm.',
];

function humanize(op) {
  return op.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function loadManifest(lang) {
  return JSON.parse(readFileSync(join(MANIFESTS, `${lang}.sdk-manifest.json`), 'utf-8'));
}

function opsByCategory(operations) {
  const groups = {};
  for (const op of operations) {
    const cat = op.category || 'other';
    (groups[cat] ||= []).push(op);
  }
  return groups;
}

// ---- llms.txt (concise router) --------------------------------------------
function renderLlms(lang, m) {
  const meta = LANG_META[lang];
  const cmt = meta.comment || '//';
  const opTotal = m.operations.filter((o) => o.op !== 'comment').length;
  const L = [];
  L.push(`# Accumulate ${meta.display} SDK`);
  L.push('');
  L.push(`> Build on the Accumulate blockchain from ${meta.display}. Package: \`${meta.pkg}\` (v${m.sdk_version}).`);
  L.push('');
  L.push('## Install');
  L.push('```');
  L.push(meta.install);
  L.push('```');
  L.push(`Import: \`${meta.import}\``);
  L.push('');
  L.push('## Canonical usage');
  L.push(`Connect, build a transaction body with \`TxBody\`, then sign + submit + wait with \`SmartSigner\`. **1 ACME = 1e8 base units.**`);
  L.push('```');
  L.push(meta.connect);
  L.push(`${cmt} body = TxBody.<operation>(...)`);
  L.push(meta.sign);
  L.push('```');
  L.push('');
  L.push('## Resources');
  L.push('- Full API digest: `llms-full.txt`');
  L.push('- Agent guide / rules: `AGENTS.md`');
  L.push(`- Runnable end-to-end examples: \`${meta.examples}\``);
  L.push(`- ${opTotal} operations across ${Object.keys(opsByCategory(m.operations.filter((o) => o.op !== 'comment'))).length} categories.`);
  L.push('');
  L.push('## Operations');
  for (const op of m.operations) {
    if (op.op === 'comment') continue;
    L.push(`- \`${op.op}\` — ${humanize(op.op)}${op.category ? ` (${op.category})` : ''}`);
  }
  L.push('');
  return L.join('\n');
}

// ---- llms-full.txt (complete API digest) ----------------------------------
function renderLlmsFull(lang, m) {
  const meta = LANG_META[lang];
  const L = [];
  L.push(`# Accumulate ${meta.display} SDK — Full API Digest`);
  L.push('');
  L.push(`Package \`${meta.pkg}\` v${m.sdk_version} (source commit ${m.commit}). Generated from the Accumulate SDK manifest (single source of truth).`);
  L.push('');
  L.push('## Install & import');
  L.push('```');
  L.push(meta.install);
  L.push('```');
  L.push(`\`${meta.import}\``);
  L.push('');
  L.push('## Conventions (read first)');
  for (const c of CONVENTIONS) L.push(`- ${c}`);
  L.push('');
  L.push('## Entry points');
  for (const e of m.entrypoints) {
    L.push(`- **${e.symbol}** (${e.kind}, \`${e.path}\`)${e.doc ? ` — ${e.doc}` : ''}`);
  }
  L.push('');
  if (m.errors?.length) {
    L.push('## Error catalog');
    for (const e of m.errors) L.push(`- \`${e.code}\` — ${e.hint}${e.details ? ` (${e.details})` : ''}`);
    L.push('');
  }
  L.push(`## Operations (${m.operations.filter((o) => o.op !== 'comment').length})`);
  L.push('');
  const groups = opsByCategory(m.operations);
  for (const [cat, ops] of Object.entries(groups)) {
    for (const op of ops) {
      if (op.op === 'comment') continue;
      L.push(`### ${op.op}  —  ${humanize(op.op)}  [${cat}]`);
      if (op.symbols?.length) {
        L.push('Symbols:');
        for (const s of op.symbols) L.push(`  - \`${s.symbol}\`${s.signature ? ` — \`${s.signature}\`` : ''}`);
      }
      if (op.inputs?.length) {
        L.push('Inputs:');
        for (const i of op.inputs) {
          const req = i.required === false ? 'optional' : 'required';
          const ex = i.example !== undefined ? ` [e.g. ${JSON.stringify(i.example)}]` : '';
          L.push(`  - \`${i.name}\` (${i.type}, ${req})${i.description ? ` — ${i.description}` : ''}${ex}`);
        }
      }
      if (op.outputs?.length) {
        L.push('Outputs:');
        for (const o of op.outputs) L.push(`  - \`${o.name}\` (${o.type})${o.description ? ` — ${o.description}` : ''}`);
      }
      if (op.requires?.length) L.push(`Requires: ${op.requires.join(', ')}`);
      if (op.errors?.length) L.push(`Errors: ${op.errors.join(', ')}`);
      if (op.examples?.length) L.push(`Examples: ${op.examples.join(', ')}`);
      L.push('');
    }
  }
  return L.join('\n');
}

// ---- AGENTS.md (agent rules) ----------------------------------------------
function renderAgents(lang, m) {
  const meta = LANG_META[lang];
  const cmt = meta.comment || '//';
  const L = [];
  L.push(`# Building on Accumulate with the ${meta.display} SDK`);
  L.push('');
  L.push(`You are integrating the Accumulate blockchain using the ${meta.display} SDK (\`${meta.pkg}\`). Follow this guide.`);
  L.push('');
  L.push('## Golden path (use this, not the low-level API)');
  L.push('```');
  L.push(meta.connect);
  L.push(`${cmt} 1. build the transaction body`);
  L.push(`${cmt} body = TxBody.<operation>(...)   ${cmt} see Operations below`);
  L.push(`${cmt} 2. sign, submit, and wait for delivery`);
  L.push(meta.sign);
  L.push(`${cmt} 3. query the account to confirm the effect`);
  L.push('```');
  L.push('');
  L.push('## Rules');
  L.push('- **Amounts:** 1 ACME = 1e8 base units. Never pass whole ACME as-is.');
  L.push('- **Testnet first:** target Kermit and fund lite accounts via the faucet before spending.');
  L.push('- **Prerequisites matter:** create an ADI, then buy credits for its key page before it can sign; wait for balances/credits to settle before the next step.');
  L.push('- **Errors are typed:** branch on the SDK error type/code; retry only on network errors, not validation errors.');
  L.push('- **One canonical client:** connect with `' + m.entrypoints[0]?.symbol + '`, build with `TxBody`, sign with `SmartSigner`. Do not hand-roll envelopes/signing, and ignore any alternate or legacy client classes — this is the only path you need.');
  L.push('');
  L.push('## Operations available');
  const groups = opsByCategory(m.operations);
  for (const [cat, ops] of Object.entries(groups)) {
    const names = ops.filter((o) => o.op !== 'comment').map((o) => `\`${o.op}\``);
    if (names.length) L.push(`- **${cat}:** ${names.join(', ')}`);
  }
  L.push('');
  L.push('## More');
  L.push(`- Complete API with signatures, inputs, outputs, and errors: \`llms-full.txt\`.`);
  L.push(`- Runnable end-to-end examples: \`${meta.examples}\`.`);
  L.push('');
  return L.join('\n');
}

// ---- top-level router ------------------------------------------------------
function renderRouter(manifests) {
  const L = [];
  L.push('# Accumulate SDKs — AI Agent Interface');
  L.push('');
  L.push('> Machine-readable interface for building on the Accumulate blockchain. One SDK per language; each ships an `llms.txt`, a full `llms-full.txt` API digest, and an `AGENTS.md` guide, all generated from a single manifest source of truth.');
  L.push('');
  L.push('## SDKs');
  for (const lang of LANGS) {
    const meta = LANG_META[lang];
    const m = manifests[lang];
    L.push(`- **${meta.display}** — \`${meta.install}\` — ${m.operations.filter((o) => o.op !== 'comment').length} operations — see \`${lang}/llms.txt\``);
  }
  L.push('');
  L.push('## Conventions (all SDKs)');
  for (const c of CONVENTIONS) L.push(`- ${c}`);
  L.push('');
  return L.join('\n');
}

// ---- main ------------------------------------------------------------------
const dist = process.argv.includes('--dist');
const manifests = {};
let opCount = 0;

for (const lang of LANGS) {
  const m = loadManifest(lang);
  manifests[lang] = m;
  const dir = join(OUT, lang);
  mkdirSync(dir, { recursive: true });
  const files = {
    'llms.txt': renderLlms(lang, m),
    'llms-full.txt': renderLlmsFull(lang, m),
    'AGENTS.md': renderAgents(lang, m),
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  opCount += m.operations.filter((o) => o.op !== 'comment').length;

  if (dist) {
    const distDir = join(SDK_ROOT, LANG_META[lang].distDir);
    if (existsSync(distDir)) {
      for (const [name, content] of Object.entries(files)) writeFileSync(join(distDir, name), content);
      console.log(`  dist -> ${LANG_META[lang].distDir}/{llms.txt,llms-full.txt,AGENTS.md}`);
    } else {
      console.log(`  dist SKIP (not found): ${distDir}`);
    }
  }
}

writeFileSync(join(OUT, 'llms.txt'), renderRouter(manifests));
console.log(`Generated agent artifacts for ${LANGS.length} SDKs (${opCount} operation entries) into docs/ai-agent-readiness/generated/${dist ? ' and each SDK repo' : ''}.`);
