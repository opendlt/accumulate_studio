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
    sign: 'signer = SmartSigner(client.v3, keypair, signer_url)\nresult = signer.sign_submit_and_wait(principal=principal, body=body, max_attempts=30)',
    comment: '#',
    examples: 'examples/v3/',
    cliInstall: 'pip install accumulate-sdk-opendlt',
    cliCommand: 'accumulate',
    cliScoped: 'python -m accumulate_client.cli',
    cliDev: 'python -m accumulate_client.cli',
    distDir: 'opendlt-python-v2v3-sdk/unified',
  },
  rust: {
    display: 'Rust',
    pkg: 'accumulate-sdk',
    install: 'cargo add accumulate-sdk',
    import: 'use accumulate_client::{QuickStart, TxBody, SmartSigner};',
    connect: 'let qs = QuickStart::kermit().await?;   // crate: accumulate-sdk, import path: accumulate_client',
    sign: 'let mut signer = SmartSigner::new(&client, keypair, &signer_url);\nlet r = signer.sign_submit_and_wait(&principal, &body, None, 30).await;',
    examples: 'examples/v3/',
    cliInstall: 'cargo install accumulate-sdk',
    cliCommand: 'accumulate',
    cliScoped: 'cargo run --bin accumulate --',
    cliDev: 'cargo run --bin accumulate --',
    distDir: 'opendlt-rust-v2v3-sdk/unified',
  },
  dart: {
    display: 'Dart',
    pkg: 'opendlt_accumulate',
    install: 'dart pub add opendlt_accumulate',
    import: "import 'package:opendlt_accumulate/opendlt_accumulate.dart';",
    connect: 'final client = Accumulate.network(NetworkEndpoint.testnet);   // or QuickStart.testnet()',
    sign: 'final signer = SmartSigner(client: client.v3, keypair: keypair, signerUrl: signerUrl);\nfinal r = await signer.signSubmitAndWait(principal: principal, body: body);',
    examples: 'example/v3/',
    cliInstall: 'dart pub global activate opendlt_accumulate',
    cliCommand: 'accumulate',
    cliScoped: 'dart run opendlt_accumulate:accumulate',
    cliDev: 'dart run bin/accumulate.dart',
    distDir: 'opendlt-dart-v2v3-sdk/unified',
  },
  csharp: {
    display: 'C#',
    pkg: 'Acme.Net.Sdk',
    install: 'dotnet add package Acme.Net.Sdk',
    import: 'using Acme.Net.Sdk;',
    connect: 'var client = Accumulate.Kermit();   // or Accumulate.Testnet()/Mainnet()/Devnet()',
    sign: 'var signer = new SmartSigner(client.V3, keypair, signerUrl);\nvar r = await signer.SignSubmitAndWaitAsync(principal, body);',
    examples: 'examples/v3/',
    cliInstall: 'dotnet tool install -g Acme.Net.Sdk.Cli',
    cliCommand: 'accumulate',
    cliScoped: 'dotnet accumulate',
    cliDev: 'dotnet run --project src/Acme.Net.Sdk.Cli --',
    distDir: 'opendlt-c-sharp-v2v3-sdk',
  },
  javascript: {
    display: 'JavaScript / TypeScript',
    pkg: 'accumulate-sdk-opendlt',
    install: 'npm install accumulate-sdk-opendlt',
    import: "import { Accumulate, TxBody, SmartSigner, QuickStart } from 'accumulate-sdk-opendlt';",
    connect: 'const client = Accumulate.forKermit();   // or forMainnet()/forDevnet()',
    sign: 'const signer = new SmartSigner(client, keypair.toKey(), signerUrl);\nconst r = await signer.signSubmitAndWait(principal, body);',
    examples: 'examples/v3/',
    cliInstall: 'npm install -g accumulate-sdk-opendlt',
    cliCommand: 'accumulate',
    cliScoped: 'npx accumulate-sdk-opendlt',
    cliDev: 'node lib/src/cli.js',
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
    projectRoot: '.',
    rootIsProject: true,
    toolchain: 'Python 3.9+ (3.11 recommended; pyproject declares requires-python >=3.9)',
    setup: ['python -m venv .venv && .venv/Scripts/activate  # POSIX: source .venv/bin/activate', 'pip install -e ".[dev]"'],
    build: 'pip install -e .   # pure Python; no separate build step',
    test: [
      { cmd: 'pytest', desc: 'unit suite', network: false },
      { cmd: 'pytest tests/integration', desc: 'integration suite', network: true },
    ],
    htlcTest: 'pytest tests/test_htlc_golden_vectors.py -q',
    lint: ['ruff check .', 'ruff format --check .'],
    layout: [
      'src/accumulate_client/  the package',
      'tests/                  test suite (tests/integration needs the network)',
      'examples/               runnable end-to-end examples',
    ],
    gotchas: [
      'This repository root IS the package root: `pyproject.toml` here declares `accumulate-sdk-opendlt`. Do not look for a `unified/` subdirectory — that is an artifact of some local working copies and is not part of this repo.',
      'The package exports both the canonical path (`Accumulate`/`TxBody`/`SmartSigner`/`QuickStart`) and a legacy `AccumulateClient`. New code uses the canonical path only.',
      '`QuickStart` helper methods print progress to stdout. Do not use them in anything whose stdout is parsed.',
    ],
    preCommit: 'pytest && ruff check .',
  },
  rust: {
    repoDir: 'opendlt-rust-v2v3-sdk',
    projectRoot: '.',
    rootIsProject: true,
    toolchain: 'Rust stable, rust-version 1.70+ (edition 2021)',
    setup: ['make install-tools   # clippy, rustfmt, cargo-audit, coverage tooling'],
    build: 'cargo build',
    test: [
      { cmd: 'make test', desc: 'full suite', network: false },
      { cmd: 'make test-unit', desc: 'unit only', network: false },
      { cmd: 'make test-integration', desc: 'integration', network: true },
      { cmd: 'make test-conformance', desc: 'conformance vectors', network: false },
      { cmd: 'cargo test --doc', desc: 'doctests (Amount helper)', network: false },
    ],
    htlcTest: 'cargo test --test golden_vectors_1_4_6_7',
    lint: ['make lint   # clippy', 'make fmt-check'],
    layout: [
      'src/            the crate',
      'tests/          integration + conformance tests',
      'examples/v3/    runnable examples',
      'Makefile        the canonical entry point for every workflow',
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
    projectRoot: '.',
    rootIsProject: true,
    toolchain: "Dart SDK >=3.3.0 <4.0.0",
    setup: ['dart pub get'],
    build: 'dart pub get   # no separate build step',
    test: [
      { cmd: 'dart test', desc: 'full suite', network: false },
      { cmd: 'dart test test/integration', desc: 'integration', network: true },
    ],
    htlcTest: 'dart test test/unit/htlc test/conformance/codec/golden_vectors_1_4_6_7_test.dart',
    lint: ['dart analyze', 'dart format --output=none --set-exit-if-changed .'],
    layout: [
      'lib/            the package',
      'test/           test suite (test/integration needs the network)',
      'example/v3/     runnable examples',
      'bin/            CLI entry point',
    ],
    gotchas: [
      'This repository root IS the package root: `pubspec.yaml` sits here. Do not look for a `unified/` subdirectory — that is an artifact of some local working copies and is not part of this repo.',
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
    htlcTest: 'dotnet test --filter FullyQualifiedName~GoldenVector',
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
    projectRoot: '.',
    rootIsProject: true,
    toolchain: 'Node >= 18',
    setup: ['npm ci'],
    build: 'npm run build   # tsc -p tsconfig.json',
    test: [
      { cmd: 'npm run test:unit', desc: 'unit suite', network: false },
      { cmd: 'npm run test:integration', desc: 'integration', network: true },
      { cmd: 'npm run test:all', desc: 'everything except browser', network: true },
    ],
    htlcTest: 'npx jest --config=test/jest.config.cjs test/htlc-api.test.ts test/golden-vectors.test.ts',
    lint: ['npm run lint', 'npm run format:check'],
    layout: [
      'src/     TypeScript sources',
      'lib/     build output; `lib/index.js` re-exports `lib/src/index.js`',
      'test/    unit tests',
    ],
    gotchas: [
      'This repository root IS the package root: `package.json` sits here. Do not look for a `javascript/` subdirectory — that is an artifact of some local working copies and is not part of this repo.',
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

// ---- error catalog (RB-05) -------------------------------------------------
// One canonical catalog, bound per language. The manifests deliberately do NOT
// each carry their own copy: five hand-maintained bindings is the drift surface
// the catalog exists to remove. Binding happens here, at load.
const CATALOG = JSON.parse(readFileSync(join(MANIFESTS, 'errors.catalog.json'), 'utf-8'));

// requires -> the error an agent hits when that prerequisite is unmet.
const REQUIRES_TO_ERROR = {
  credits: 'ACC_INSUFFICIENT_CREDITS',
  keypair: 'ACC_UNAUTHORIZED_SIGNER',
};

/** Codes that apply to every network-touching operation, regardless of op. */
const UNIVERSAL_CODES = ['ACC_NETWORK_UNAVAILABLE'];

/**
 * Bind the catalog to one language: resolve `bindings[lang]` to a concrete
 * `type`, and keep the fields the renderers need.
 */
function bindErrors(lang) {
  return CATALOG.errors.map((e) => ({
    code: e.code,
    category: e.category,
    retryable: e.retryable,
    observed: e.observed,
    hint: e.hint,
    remediation: e.remediation,
    protocolCodes: e.protocolCodes || [],
    type: e.bindings?.[lang] || CATALOG.bindings[lang]?.base || null,
  }));
}

/**
 * Derive the errors each operation can raise: mechanically from `requires`,
 * plus any catalog entry that names the op in `relatedOps`, plus the universal
 * network class. Sorted for deterministic output.
 */
function errorsForOp(op) {
  if (!op.op || op.op === 'comment') return [];
  const codes = new Set(UNIVERSAL_CODES);
  for (const r of op.requires || []) {
    if (REQUIRES_TO_ERROR[r]) codes.add(REQUIRES_TO_ERROR[r]);
  }
  for (const e of CATALOG.errors) {
    if ((e.relatedOps || []).includes(op.op)) codes.add(e.code);
  }
  return [...codes].sort();
}

function loadManifest(lang) {
  const m = JSON.parse(readFileSync(join(MANIFESTS, `${lang}.sdk-manifest.json`), 'utf-8'));
  m.errors = bindErrors(lang);
  m.errorBinding = CATALOG.bindings[lang] || null;
  m.errorCatalogVersion = CATALOG.version;
  for (const op of m.operations) op.errors = errorsForOp(op);
  return m;
}

function opsByCategory(operations) {
  const groups = {};
  for (const op of operations) {
    const cat = op.category || 'other';
    (groups[cat] ||= []).push(op);
  }
  return groups;
}

// ---- hash-locked transfers (HTLC) -------------------------------------------
// Every SDK's hand-written llms.txt / llms-full.txt carried an HTLC section, and
// `gen:agent:dist` overwrites those files, so the section has to come from here.
// The per-SDK API (symbols and traps) is read from the manifests; the protocol
// facts are the same for all five SDKs and live in the constants below.
const HTLC_STEPS = [
  { op: 'generate_hash_lock', title: 'Make the secret and the lock' },
  { op: 'send_tokens', title: 'Send with the lock' },
  { op: 'wait_for_locked_deposit', title: 'Find the locked deposit' },
  { op: 'release_locked', title: 'Release it with the preimage' },
];

const HTLC_SUMMARY =
  'A hash lock is a header field (`hashLock`, TransactionHeader field 8) on an ordinary `send_tokens`, not a new transaction type. The sender is debited at once; each recipient gets a `SyntheticLockedDeposit` (type 0x37) instead of a normal deposit and is credited only when a `ReleaseLockedOperation` (type 0x18) reveals the preimage.';

const HTLC_FACTS = [
  'Algorithms: `sha256` (SHA-256 of the preimage) and `sha256d` (SHA-256 of that hash). Both hashes are 32 bytes. The protocol also defines HASH160 (20 bytes); it is SDK-level only and Studio-generated code does not use it.',
  'Expiration: absolute UTC, whole seconds, 10 minutes to 30 days ahead of the node clock, checked at submit and again at execute. Use 15 minutes or more for clock skew.',
  'Preimage: 1 to 256 bytes, hashed raw with no prefix. The release publishes it on-chain.',
  'The release is signed by the RECIPIENT account holding the locked deposit, and that signer pays its fee (about 0.01 credits).',
  'Needs a node at 1.4.6.4 or later (1.4.6.3 used a different header field). `hashLock` is part of the transaction hash; headers without it are byte-identical to before.',
];

// Core never runs the expiry refund, so no generated document may promise one.
const HTLC_REFUND =
  'Refund on expiry is the protocol design but is NOT currently functional on the network (see `docs/hash-lock-example/CORE-ISSUE-refund.md` in accumulate-studio): an unreleased lock is never refunded and cannot be released after it expires, so the funds are stranded. Do not promise or rely on a refund; use small amounts and always release.';

/**
 * A generated HTLC section must say the refund does not work and must never promise one. The manifests
 * are hand-edited, so this fails the run if a note regresses to the old "refunded to the sender" claim.
 */
function checkHtlcRefundWording(lines) {
  const text = lines.join('\n');
  if (!/NOT currently functional/.test(text)) throw new Error('HTLC section is missing the refund caveat');
  if (/refunded to the sender|tokens are refunded/i.test(text)) {
    throw new Error('HTLC section promises a refund, but core never executes the expiry refund');
  }
  return lines;
}

/** The signer call that carries the lock is the one that takes the header options. */
const HTLC_LOCK_CALL = /hash.?lock|HeaderOptions/i;

/** The manifest operations the section is built from; a missing one is a manifest bug, not a skip. */
function htlcOps(lang, m) {
  return HTLC_STEPS.map((step) => {
    const op = m.operations.find((o) => o.op === step.op);
    if (!op) throw new Error(`${lang} manifest has no "${step.op}" operation: the HTLC section is generated from it`);
    return { ...step, operation: op };
  });
}

/** send_tokens has many symbols; show the body builder and the call that takes the lock. */
function htlcSymbols(step) {
  const symbols = step.operation.symbols || [];
  if (step.op !== 'send_tokens') return symbols;
  const lockCalls = symbols.filter((s) => HTLC_LOCK_CALL.test(`${s.symbol} ${s.signature || ''}`));
  if (!lockCalls.length) throw new Error('send_tokens has no symbol that takes the hash lock');
  return [symbols[0], ...lockCalls];
}

/** send_tokens notes are mostly about plain transfers; keep the ones about the lock. */
function htlcNotes(step) {
  const notes = step.operation.notes || [];
  return step.op === 'send_tokens' ? notes.filter((n) => /lock/i.test(n)) : notes;
}

function htlcCliLine(lang) {
  return `Not exposed by the \`${LANG_META[lang].cliCommand}\` CLI: library API only.`;
}

/** Concise HTLC section for llms.txt. */
function renderHtlcLlms(lang, m) {
  const L = [];
  L.push('## Hash-locked transfers (HTLC) — library API only');
  L.push(HTLC_SUMMARY);
  L.push('');
  htlcOps(lang, m).forEach((step, i) => {
    const names = [...new Set(htlcSymbols(step).map((s) => `\`${s.symbol}\``))].join(', ');
    L.push(`${i + 1}. **${step.title}** (\`${step.op}\`): ${names}`);
  });
  L.push('');
  for (const f of HTLC_FACTS) L.push(`- ${f}`);
  L.push(`- **Refund status:** ${HTLC_REFUND}`);
  L.push(`- ${htlcCliLine(lang)}`);
  L.push('- Inputs, outputs and the per-SDK traps for each step: `llms-full.txt`.');
  L.push('');
  return L;
}

/** Full HTLC section for llms-full.txt: symbols and the manifest notes for each step. */
function renderHtlcFull(lang, m) {
  const L = [];
  L.push('## Hash-locked transfers (HTLC, Accumulate 1.4.6.4+) — library API only');
  L.push(HTLC_SUMMARY);
  L.push('');
  L.push('Four steps, in order. Each is also listed under Operations below with its inputs and outputs.');
  L.push('');
  htlcOps(lang, m).forEach((step, i) => {
    L.push(`### ${i + 1}. ${step.title} — \`${step.op}\``);
    L.push('Symbols:');
    for (const s of htlcSymbols(step)) L.push(`  - \`${s.symbol}\`${s.signature ? ` — \`${s.signature}\`` : ''}`);
    const notes = htlcNotes(step);
    if (notes.length) {
      L.push('Notes:');
      for (const n of notes) L.push(`  - ${n}`);
    }
    L.push('');
  });
  L.push('### Limits and rules');
  for (const f of HTLC_FACTS) L.push(`- ${f}`);
  L.push(`- **Refund status:** ${HTLC_REFUND}`);
  L.push(`- ${htlcCliLine(lang)}`);
  L.push('');
  return L;
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
  L.push(
    '- **Errors are typed:** catch `' +
      (m.errorBinding?.base || 'the SDK error type') +
      '` (`' +
      (m.errorBinding?.catch || '') +
      '`) and branch on the code. The full catalog — every code, its `retryable` flag, and the fix — is the **Error catalog** section of `llms-full.txt`. **Retry ONLY `ACC_NETWORK_UNAVAILABLE` / `ACC_INTERNAL`;** every other code is a condition that will not change on its own, so retrying it just burns turns.'
  );
  L.push('- **One canonical client:** connect with `' + m.entrypoints[0]?.symbol + '`, build with `TxBody`, sign with `SmartSigner`. Do not hand-roll envelopes/signing, and ignore any alternate or legacy client classes — this is the only path you need.');
  L.push('');
  for (const line of checkHtlcRefundWording(renderHtlcLlms(lang, m))) L.push(line);
  // RB-04. A terminal-based agent that finds this never writes a program for a
  // balance check: it is one command instead of create-project/compile/run/delete.
  L.push('## CLI (no code required)');
  L.push('```');
  L.push(meta.cliInstall);
  L.push(`${meta.cliCommand} query acc://<account>            ${cmt} any account`);
  L.push(`${meta.cliCommand} balance acc://<lta>              ${cmt} token balance`);
  L.push(`${meta.cliCommand} faucet acc://<lta>               ${cmt} testnet ACME`);
  L.push('```');
  L.push(`Scoped invocation (no global shim): \`${meta.cliScoped}\``);
  L.push('- **`--json` emits exactly one envelope object on stdout**, nothing else. Logs go to stderr.');
  L.push('- **Exit codes:** `0` ok · `1` operation failed · `2` usage error · `3` network unreachable. Branch on these without parsing.');
  L.push('- Failures carry the same `ACC_*` codes and `retryable` flag as the SDK, so the retry decision is identical either way.');
  L.push('- `' + meta.cliCommand + ' --help --json` returns the whole command tree (verbs, flags, types) in one call.');
  L.push('- Defaults to testnet. Mainnet needs `--network mainnet` AND `ACCUMULATE_ALLOW_MAINNET=1`.');
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
    L.push(`## Error catalog (v${m.errorCatalogVersion})`);
    L.push('');
    L.push('Branch on `code`. **`retryable` decides whether a retry is productive** — retrying a');
    L.push('validation or auth error only burns turns; the condition will not change on its own.');
    L.push('');
    if (m.errorBinding) {
      L.push('```');
      if (m.errorBinding.import) L.push(m.errorBinding.import);
      L.push(m.errorBinding.catch);
      L.push(`    ${m.errorBinding.codeAccess}`);
      L.push('```');
      L.push('');
    }
    for (const e of m.errors) {
      const wire = e.protocolCodes.length ? ` · wire ${e.protocolCodes.join(', ')}` : '';
      L.push(`### \`${e.code}\``);
      L.push(`${e.hint}`);
      L.push('');
      L.push(`- category: \`${e.category}\`${wire}`);
      L.push(`- retryable: **${e.retryable ? 'yes' : 'no'}**`);
      if (e.type) L.push(`- ${LANG_META[lang].display} type: \`${e.type}\``);
      L.push(`- fix: ${e.remediation}`);
      L.push('');
    }
  }
  for (const line of checkHtlcRefundWording(renderHtlcFull(lang, m))) L.push(line);
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
  const tests = repo.htlcTest
    ? [...repo.test, { cmd: repo.htlcTest, desc: 'hash-lock (HTLC) golden vectors and API', network: false }]
    : repo.test;
  for (const t of tests) {
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

  // RB-04. AGENTS.md is the CONTRIBUTOR manifest, so this is how to run and
  // re-verify the CLI in this checkout — not how to consume it (that is llms.txt).
  L.push('## CLI');
  L.push('');
  L.push('This repo ships the `' + meta.cliCommand + '` CLI. Run it from the checkout with:');
  L.push('');
  L.push('```bash');
  L.push(meta.cliDev + ' --json version');
  L.push('```');
  L.push('');
  L.push('It conforms to `docs/ai-agent-readiness/CLI-SPEC.md` in accumulate-studio: one JSON');
  L.push('envelope on stdout, `ACC_*` error codes, exit codes 0/1/2/3. **Changing its output shape');
  L.push('is a contract change** — re-run the shared conformance suite, which gates all five SDKs:');
  L.push('');
  L.push('```bash');
  L.push('node tools/cli-conformance/run.mjs --cmd "' + meta.cliDev + '" --cwd . --sdk ' + lang);
  L.push('```');
  L.push('');

  L.push('## Gotchas');
  L.push('');
  for (const g of repo.gotchas) L.push(`- ${g}`);
  if (repo.htlcTest) {
    L.push(
      `- Hash locks (HTLC) are library-only. \`hashLock\` is TransactionHeader field 8 and part of the transaction hash; \`${repo.htlcTest}\` pins those bytes. A failing vector means the signing bytes changed — a consensus-visible break, not a test to update. Refund on expiry is not currently functional on the network, so no test or doc may claim it works.`,
    );
  }
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
