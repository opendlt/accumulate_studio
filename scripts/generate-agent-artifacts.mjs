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

// ---------------------------------------------------------------------------
// REPO_META — facts about each SDK's *repository*, for AGENTS.md.
//
// AGENTS.md is a contributor manifest: how to build, test, lint and navigate
// THIS checkout. That is a different genre from llms.txt, which tells an agent
// how to USE the published SDK. Before RB-03 both files carried usage content
// and neither answered "how do I run the tests".
//
// Every command below was executed against a real checkout. A manifest that
// lists a command which does not work is worse than no manifest, because the
// agent trusts it.
// ---------------------------------------------------------------------------
const REPO_META = {
  python: {
    repoDir: 'opendlt-python-v2v3-sdk',
    projectRoot: 'unified/',
    rootIsProject: false,
    toolchain: 'Python 3.11+',
    setup: ['cd unified', 'python -m venv .venv && .venv/Scripts/activate  # POSIX: source .venv/bin/activate', 'pip install -e ".[dev]"'],
    build: 'pip install -e .   # pure Python; no separate build step',
    test: [
      { cmd: 'pytest', desc: 'unit suite', network: false },
      { cmd: 'pytest unified/tests/integration', desc: 'integration suite', network: true },
    ],
    lint: ['ruff check .', 'ruff format --check .'],
    layout: [
      'unified/src/accumulate_client/  the package (this is the real project root)',
      'unified/tests/                  test suite',
      'examples/                       runnable end-to-end examples',
      'pyproject.toml (root)           a STUB — see gotchas',
    ],
    gotchas: [
      'The repo-root `pyproject.toml` declares `name = "accumulate-client"`, `version = "0.0.0"`. That is a stub. The real package is `accumulate-sdk-opendlt` defined in `unified/pyproject.toml`. Always work from `unified/`.',
      'Root `pytest.ini` sets `testpaths = unified/tests` with `--import-mode=importlib`, so bare `pytest` from the repo root does find the right tests.',
      'The package exports both the canonical path (`Accumulate`/`TxBody`/`SmartSigner`/`QuickStart`) and a legacy `AccumulateClient`. New code uses the canonical path only.',
      '`QuickStart` helper methods print progress to stdout. Do not use them in anything whose stdout is parsed.',
    ],
    preCommit: 'pytest && ruff check .',
  },
  rust: {
    repoDir: 'opendlt-rust-v2v3-sdk',
    projectRoot: 'unified/',
    rootIsProject: false,
    toolchain: 'Rust stable (edition per Cargo.toml)',
    setup: ['cd unified', 'make install-tools   # clippy, rustfmt, cargo-audit, coverage tooling'],
    build: 'cargo build',
    test: [
      { cmd: 'make test', desc: 'full suite', network: false },
      { cmd: 'make test-unit', desc: 'unit only', network: false },
      { cmd: 'make test-integration', desc: 'integration', network: true },
      { cmd: 'make test-conformance', desc: 'conformance vectors', network: false },
      { cmd: 'cargo test --doc', desc: 'doctests (Amount helper)', network: false },
    ],
    lint: ['make lint   # clippy', 'make fmt-check'],
    layout: [
      'unified/src/            the crate (this is the real project root)',
      'unified/tests/          integration + conformance tests',
      'unified/examples/v3/    runnable examples',
      'unified/Makefile        the canonical entry point for every workflow',
    ],
    gotchas: [
      'Use the `Makefile`, not bare cargo. `make ci-check` (= fmt-check + lint + test + coverage-gate + audit) is what CI runs; bare `cargo test` skips the coverage gate and the audit.',
      'The crate is `accumulate-sdk` but the import path is `accumulate_client`. Both are correct and intentional.',
      '`golden_bytes_stable` pins the marshaled bytes for all 21 transaction types. If it fails, you changed signing bytes — that is a consensus-visible break, not a test to update.',
      'Transaction type codes were wrong for 5 variants historically (LockAccount, BurnCredits, TransferCredits, UpdateAccountAuth, UpdateKey). The golden-byte harness exists to stop that recurring.',
    ],
    preCommit: 'make ci-check',
  },
  dart: {
    repoDir: 'opendlt-dart-v2v3-sdk',
    projectRoot: 'unified/',
    rootIsProject: false,
    toolchain: "Dart SDK >=3.3.0 <4.0.0",
    setup: ['cd unified', 'dart pub get'],
    build: 'dart pub get   # no separate build step',
    test: [
      { cmd: 'dart test', desc: 'full suite', network: false },
      { cmd: 'dart test test/integration', desc: 'integration', network: true },
    ],
    lint: ['dart analyze', 'dart format --output=none --set-exit-if-changed .'],
    layout: [
      'unified/lib/            the package (this is the real project root)',
      'unified/test/           test suite',
      'unified/example/v3/     runnable examples',
      'unified/bin/            CLI entry point',
    ],
    gotchas: [
      'The repo root is not the package root; `unified/` holds `pubspec.yaml`.',
      'pub.dev analysis currently reports `has:error` and scores 40/160. Run `dart analyze` and `dart doc` before publishing — analyzer errors degrade code intelligence for every consumer, human or agent.',
      'Errors are typed via `AccError` / `JsonRpcErrorMapper`, wired into `Transport.call`/`batch`. Catch `on AccError`, not a bare exception.',
    ],
    preCommit: 'dart analyze && dart test',
  },
  csharp: {
    repoDir: 'opendlt-c-sharp-v2v3-sdk',
    projectRoot: '.',
    rootIsProject: true,
    toolchain: '.NET 9 SDK',
    setup: ['dotnet restore Acme.Net.Sdk.sln'],
    build: 'dotnet build Acme.Net.Sdk.sln -c Release',
    test: [
      { cmd: 'dotnet test test/Acme.Net.Sdk.Tests', desc: 'unit suite', network: false },
      { cmd: 'dotnet test test/Acme.Net.Sdk.AccountTests', desc: 'account suite', network: true },
    ],
    lint: ['dotnet format --verify-no-changes'],
    layout: [
      'src/Acme.Net.Sdk/               the library',
      'test/Acme.Net.Sdk.Tests/        unit tests',
      'test/Acme.Net.Sdk.AccountTests/ network-dependent tests',
      'test/Acme.Net.Sdk.Benchmarks/   benchmarks',
      'examples/v3/                    runnable examples',
    ],
    gotchas: [
      '`<GenerateDocumentationFile>true</GenerateDocumentationFile>` must stay on — the nupkg has to ship `lib/<tfm>/*.xml` or IntelliSense and agent tooling lose every signature.',
      '`AcmeClient` is `[Obsolete]`. Use `Accumulate` / `TxBody` / `SmartSigner`.',
      'Transaction type codes were wrong for 5 variants historically; `TransactionCodec` was also missing `MarshalUpdateKey` and `MarshalTransferCredits`. Treat marshaling changes as consensus-visible.',
      'Url objects (`Lid`, `Lta`) need `.String()`; stored URL strings do not. Calling `.String()` on a string is a compile error.',
    ],
    preCommit: 'dotnet build && dotnet test test/Acme.Net.Sdk.Tests',
  },
  javascript: {
    repoDir: 'opendlt-javascript-v2v3-sdk',
    projectRoot: 'javascript/',
    rootIsProject: false,
    toolchain: 'Node >= 18',
    setup: ['cd javascript', 'npm ci'],
    build: 'npm run build   # tsc -p tsconfig.json',
    test: [
      { cmd: 'npm run test:unit', desc: 'unit suite', network: false },
      { cmd: 'npm run test:integration', desc: 'integration', network: true },
      { cmd: 'npm run test:all', desc: 'everything except browser', network: true },
    ],
    lint: ['npm run lint', 'npm run format:check'],
    layout: [
      'javascript/src/     TypeScript sources (this is the real project root)',
      'javascript/lib/     build output; `lib/index.js` re-exports `lib/src/index.js`',
      'javascript/test/    unit tests',
      'javascript/test-it/ integration tests',
    ],
    gotchas: [
      'The repo root is not the package root; `javascript/` holds `package.json`.',
      '`npm run build` must run before tests that import from `lib/`.',
      'The SDK submits transactions as JSON via the V2 `execute-direct` endpoint, not binary — do not port binary-marshaling assumptions here.',
      '`TxBody.updateKeyPage([{...}])` with plain objects does not work. Use the typed methods: `updateKeyPageAddKey`, `updateKeyPageRemoveKey`, `updateKeyPageSetThreshold`.',
    ],
    preCommit: 'npm run code-check && npm run test:unit',
  },
};

const CONVENTIONS = [
  'Networks: Kermit testnet (used by the examples; fund via faucet), plus mainnet and local devnet.',
  'Amounts: ACME is denominated in base units where 1 ACME = 1e8 base units. Passing whole ACME as-is is the single most common integration bug.',
  'Credits: buying credits uses the network oracle price; an ADI/key page must hold credits before it can sign transactions.',
  'Custom tokens: each declares its own precision at creation (not 1e8). Amounts on the wire are always base units, so issuing 1000 against a precision-8 token mints 0.00001 tokens. Use the SDK amount helper to convert whole tokens to base units.',
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
  // These rules moved here from AGENTS.md in RB-03. They are consumer guidance
  // — how to USE the SDK — which is this file's genre. AGENTS.md is now the
  // repository manifest (build/test/lint/layout).
  L.push('## Rules');
  L.push('- **Amounts:** 1 ACME = 1e8 base units. Never pass whole ACME as-is; use the `Amount` helper.');
  L.push('- **Custom tokens have their OWN precision**, set when the token is created — it is not 1e8. Issuing `1000` against a precision-8 token mints `0.00001` tokens, not 1000, and the transaction succeeds either way. Convert with the token helper (`Amount.token(whole, precision)` / `Amount::token` / `Amount.Token`) rather than passing a raw number.');
  L.push('- **Testnet first:** target Kermit and fund lite accounts via the faucet before spending.');
  L.push('- **Prerequisites matter:** create an ADI, then buy credits for its key page before it can sign; wait for balances/credits to settle before the next step.');
  L.push('- **Errors are typed:** branch on the SDK error type/code; retry only on network errors, not validation errors.');
  L.push('- **One canonical client:** connect with `' + m.entrypoints[0]?.symbol + '`, build with `TxBody`, sign with `SmartSigner`. Do not hand-roll envelopes/signing, and ignore any alternate or legacy client classes — this is the only path you need.');
  L.push('');
  L.push('## Resources');
  L.push('- Full API digest: `llms-full.txt`');
  L.push('- Repository guide (build/test/lint, for working ON this SDK): `AGENTS.md`');
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

// ---- AGENTS.md (repo manifest) ---------------------------------------------
// Contributor-facing: how to build, test, lint and navigate THIS checkout.
// Consumer-facing usage guidance lives in llms.txt / llms-full.txt.
function renderAgents(lang, m) {
  const meta = LANG_META[lang];
  const repo = REPO_META[lang];
  const L = [];

  L.push(`# ${repo.repoDir} — repository guide for agents`);
  L.push('');
  L.push(
    `The ${meta.display} SDK for the Accumulate blockchain. Published as \`${meta.pkg}\` (v${m.sdk_version}).`,
  );
  L.push('');
  if (!repo.rootIsProject) {
    L.push(
      `> **The project root is \`${repo.projectRoot}\`, not the repository root.** Run every command below from there unless stated otherwise.`,
    );
    L.push('');
  }
  L.push(
    '> Building **on** Accumulate rather than **on this SDK**? You want `llms.txt` (quickstart + rules) and `llms-full.txt` (full API). This file is about working on the SDK itself.',
  );
  L.push('');

  L.push('## Setup');
  L.push('');
  L.push(`Toolchain: **${repo.toolchain}**`);
  L.push('');
  L.push('```bash');
  for (const s of repo.setup) L.push(s);
  L.push('```');
  L.push('');

  L.push('## Build');
  L.push('');
  L.push('```bash');
  L.push(repo.build);
  L.push('```');
  L.push('');

  L.push('## Test');
  L.push('');
  L.push('| Command | Covers | Needs network |');
  L.push('|---|---|:--:|');
  for (const t of repo.test) {
    L.push(`| \`${t.cmd}\` | ${t.desc} | ${t.network ? '**yes**' : 'no'} |`);
  }
  L.push('');
  L.push(
    'Network-dependent suites talk to a live testnet. If they fail while the unit suite passes, suspect the network before suspecting your change.',
  );
  L.push('');

  L.push('## Lint & format');
  L.push('');
  L.push('```bash');
  for (const l of repo.lint) L.push(l);
  L.push('```');
  L.push('');

  L.push('## Layout');
  L.push('');
  L.push('```');
  for (const l of repo.layout) L.push(l);
  L.push('```');
  L.push('');

  L.push('## Gotchas');
  L.push('');
  for (const g of repo.gotchas) L.push(`- ${g}`);
  L.push('');

  L.push('## Permitted commands');
  L.push('');
  L.push('Safe to run unattended: build, test, lint, format, and any read-only query against a **testnet**.');
  L.push('');
  L.push('Require a human first:');
  L.push('');
  L.push('- publishing or releasing (registry writes are irreversible)');
  L.push('- anything targeting **mainnet**');
  L.push('- rewriting git history, force-pushing, or changing CI credentials');
  L.push('- changing transaction marshaling or signing bytes — consensus-visible');
  L.push('');

  L.push('## Before you commit');
  L.push('');
  L.push('```bash');
  L.push(repo.preCommit);
  L.push('```');
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
