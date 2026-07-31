#!/usr/bin/env node
/**
 * generate-mcp-content.mjs — RB-02
 *
 * Emits the MCP server's Resources and Prompts content as a generated TypeScript
 * module, from the same single source of truth that drives llms.txt:
 *   packages/codegen/src/manifests/*.sdk-manifest.json  -> operation resources
 *   apps/studio/src/data/flow-templates.ts              -> golden-path prompts
 *
 * Two constraints drive the generated-module approach:
 *
 *  1. The MCP server is bundled with `esbuild --bundle` and published with
 *     `files: ["dist"]`. Anything read at runtime via `fs` would not exist in
 *     the published package, so content must be inlined at build time.
 *
 *  2. The server must not import from apps/studio — that would pull React into
 *     the bundle. So the flow templates are parsed here and reduced to the
 *     metadata prompts actually need.
 *
 * Hand-editing the output is a drift bug waiting to happen; regenerate instead.
 *
 * Usage: node scripts/generate-mcp-content.mjs   (runs automatically in build:mcp)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const MANIFESTS = join(REPO, 'packages', 'codegen', 'src', 'manifests');
const TEMPLATES = join(REPO, 'apps', 'studio', 'src', 'data', 'flow-templates.ts');
const OUT_DIR = join(REPO, 'apps', 'mcp-server', 'src', 'generated');
const OUT_FILE = join(OUT_DIR, 'content.ts');

const LANGS = ['python', 'rust', 'dart', 'csharp', 'javascript'];

// Curated per-language install/import facts. Must stay in step with LANG_META in
// generate-agent-artifacts.mjs — the consistency check below enforces that.
const LANG_META = {
  python: { display: 'Python', pkg: 'accumulate-sdk-opendlt', install: 'pip install accumulate-sdk-opendlt' },
  rust: { display: 'Rust', pkg: 'accumulate-sdk', install: 'cargo add accumulate-sdk' },
  dart: { display: 'Dart', pkg: 'opendlt_accumulate', install: 'dart pub add opendlt_accumulate' },
  csharp: { display: 'C#', pkg: 'Acme.Net.Sdk', install: 'dotnet add package Acme.Net.Sdk' },
  javascript: { display: 'JavaScript / TypeScript', pkg: 'accumulate-sdk-opendlt', install: 'npm install accumulate-sdk-opendlt' },
};

// ---------------------------------------------------------------------------
// Concept documents — the knowledge the server currently withholds from agents.
// Hand-authored (they are not derivable from a manifest), but small and stable.
// ---------------------------------------------------------------------------
const CONCEPTS = {
  'amount-scaling': {
    title: 'Amount scaling (the 1e8 rule)',
    body: `# Amount scaling

**1 ACME = 100,000,000 (1e8) base units.** Every amount field in every Accumulate
transaction is denominated in base units. Passing whole ACME is the single most
common integration bug.

| You mean | You must pass |
|---|---|
| 1 ACME | \`100000000\` |
| 5 ACME | \`500000000\` |
| 0.5 ACME | \`50000000\` |

Each SDK ships an \`Amount\` helper — use it rather than writing the multiplication
by hand:

- Python: \`Amount.acme(5)\`
- Rust: \`Amount::acme(5)\`
- Dart: \`Amount.acme(5)\`
- C#: \`Amount.Acme(5)\`
- JavaScript: \`Amount.acme(5)\`

## Credits are different

Credits are NOT ACME. Buying credits converts ACME at the network oracle price,
which you must query rather than assume. \`Amount.credits(n, oracle)\` handles the
conversion. Credit balances are reported in hundredths of a credit.`,
  },

  credits: {
    title: 'Credits and the prerequisite chain',
    body: `# Credits and the prerequisite chain

Accumulate charges **credits**, not tokens, for transactions. An account that
holds ACME but no credits cannot sign anything.

## The chain, in order

1. **Generate a key** → its lite identity and lite token account exist implicitly.
2. **Fund the lite token account** (testnet: faucet).
3. **Buy credits for the lite identity** — note: credits go to the lite
   *identity*, not the lite *token account*.
4. **Create an ADI**, signed by the lite identity. A key book and key page 1 are
   provisioned automatically.
5. **Buy credits for the ADI's key page** (\`acc://you.acme/book/1\`). Until this
   happens the ADI cannot sign, even though it exists.
6. Now the ADI can create accounts, send tokens, write data, and so on.

## Settlement is not instant

Faucet deposits and credit purchases are delivered by synthetic transactions and
take several seconds. Poll the account until the balance reflects, rather than
proceeding immediately — most "transaction is not signed" and "insufficient
credits" errors are really "you did not wait".

## Who signs what

After creating an ADI, transactions on ADI-owned accounts are signed by the key
page (\`acc://you.acme/book/1\`) — but *buying credits* for that page must still
be signed by the lite identity, because the page has no credits yet.`,
  },

  'adi-vs-lite': {
    title: 'Lite accounts vs ADIs',
    body: `# Lite accounts vs ADIs

**Lite accounts** are derived directly from a key hash. They need no on-chain
creation step and are the entry point for every new user.

- Lite identity: \`acc://<40 hex><8 hex checksum>\`
- Lite token account: \`<lite identity>/ACME\`

The URL is derived as: \`sha256(publicKey)\` → first 20 bytes as hex → append a
4-byte checksum computed over the **ASCII text** of that hex string.

**ADIs** (Accumulate Digital Identifiers) are human-readable, hierarchical
identities: \`acc://example.acme\`. They must be created on chain and paid for,
they own sub-accounts (\`acc://example.acme/tokens\`, \`/data\`, \`/book\`), and they
support key books, key pages, multi-signature, and key rotation.

Use a lite account to bootstrap; use an ADI for anything real.`,
  },

  'key-hierarchy': {
    title: 'Key books, key pages, and authorities',
    body: `# Key books, key pages, and authorities

- **Key book** (\`acc://you.acme/book\`) — the authority set for an ADI.
- **Key page** (\`acc://you.acme/book/1\`) — an ordered set of keys plus a
  signature threshold. Pages hold credits and are what actually sign.
- **Threshold** — how many distinct keys on the page must sign. Threshold 2 with
  2 keys is a 2-of-2 multisig.

## The rule that surprises people

Accumulate requires **all** authorities on an account to approve a transaction.
When updating a key page that has its own book (e.g. \`multisig-book/1\`), sign
with **that page's own book**, not the ADI's default \`book\`. Signing with the
page's own book satisfies both the ADI authority and the page's own authority.

## Key rotation is ONE atomic transaction

Use **\`updateKey\`** (\`TxBody.update_key(new_key_hash)\`). It replaces the signing
key in a single transaction, **signed by the key being replaced**:

\`\`\`
body = TxBody.update_key(sha256(new_public_key))
sign with the OLD key, signer = the key page
\`\`\`

Do **not** rotate with add-key-then-remove-key. That is two \`updateKeyPage\`
transactions, two settles, and a window where the page holds both keys — and if
the page threshold is above 1, each of those transactions itself needs multiple
signatures. \`updateKey\` avoids all of it.

Keys are stored as \`sha256(publicKey)\` hashes, not raw public keys — compare
hashes when verifying a rotation took effect.

## Satisfying a threshold (M-of-N)

A threshold above 1 needs **distinct keys signing the SAME transaction**. Signing
the same body twice does not work: the first signature's metadata becomes the
transaction's \`initiator\` and is baked into the header, so a second independent
signature produces a *different transaction hash* and neither reaches threshold.

Co-sign the existing envelope instead:

\`\`\`
accumulate tx build <op> --param ... --out body.json
accumulate tx sign --body body.json --principal <acct> --signer <page> --key-env K1 --out env1.json
accumulate tx sign --envelope env1.json --signer <page> --key-env K2 --out env2.json   # co-sign
accumulate tx submit --envelope env2.json
\`\`\`

In the SDKs this is \`SmartSigner.sign_existing\` / \`signExisting\` /
\`SignExistingAsync\`. Collect all signatures BEFORE submitting: once a signature
is on chain, resubmitting it trips replay protection
(\`invalid timestamp: have … got …\`).`,
  },

  networks: {
    title: 'Networks and safety defaults',
    body: `# Networks

| Network | Purpose | Faucet |
|---|---|---|
| \`kermit\` | Primary test network used by all examples | yes |
| \`testnet\` | Public test network | yes |
| \`devnet\` | Development network | yes |
| \`mainnet\` | Production — **real value** | no |
| \`local\` | Local node on :26660 | yes |

**Default to Kermit.** This MCP server defaults to testnet and never selects
mainnet implicitly. Mainnet is read-only in Studio.

Develop and test against Kermit, fund from the faucet, and only move to mainnet
deliberately.`,
  },
};

// ---------------------------------------------------------------------------
function loadManifest(lang) {
  return JSON.parse(readFileSync(join(MANIFESTS, `${lang}.sdk-manifest.json`), 'utf-8'));
}

/**
 * RB-05 canonical error catalog. Normalized so every entry has the optional
 * arrays present — the MCP matcher and `acc.explain_error` can then read them
 * without defensive checks.
 */
const errorCatalog = (() => {
  const c = JSON.parse(readFileSync(join(MANIFESTS, 'errors.catalog.json'), 'utf-8'));
  return {
    version: c.version,
    description: c.description,
    categories: c.categories,
    bindings: c.bindings,
    errors: c.errors.map((e) => ({
      code: e.code,
      protocolCodes: e.protocolCodes ?? [],
      category: e.category,
      retryable: e.retryable,
      observed: e.observed ?? false,
      hint: e.hint,
      messagePatterns: e.messagePatterns ?? [],
      causes: e.causes ?? [],
      remediation: e.remediation,
      relatedOps: e.relatedOps ?? [],
      bindings: e.bindings ?? {},
    })),
  };
})();

/**
 * Extract prompt-relevant metadata from GOLDEN_PATH_TEMPLATES.
 *
 * Parsing TypeScript with regex is normally a bad idea; it is acceptable here
 * because the target is a single well-known literal array in a file we own, and
 * the alternative (importing apps/studio) drags React into the MCP bundle. The
 * count assertion below fails loudly if the shape ever drifts.
 */
function loadTemplates() {
  const src = readFileSync(TEMPLATES, 'utf-8');
  const start = src.indexOf('export const GOLDEN_PATH_TEMPLATES');
  if (start < 0) throw new Error('GOLDEN_PATH_TEMPLATES not found in flow-templates.ts');
  const tail = src.slice(start);

  const templates = [];
  const entryRe = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*description:\s*\n?\s*((?:'[^']*'\s*\+?\s*)+),\s*category:\s*'([^']+)',\s*estimatedTime:\s*'([^']+)',\s*tags:\s*\[([^\]]*)\],\s*flow:\s*(\w+),\s*instructions:\s*\[([\s\S]*?)\],\s*prerequisites:\s*\[([\s\S]*?)\],/g;

  let m;
  while ((m = entryRe.exec(tail)) !== null) {
    const strList = (s) =>
      [...s.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
    templates.push({
      id: m[1],
      name: m[2],
      description: strList(m[3]).join(' ').trim(),
      category: m[4],
      estimatedTime: m[5],
      tags: strList(m[6]),
      instructions: strList(m[8]),
      prerequisites: strList(m[9]),
    });
  }
  return templates;
}

function ts(v) {
  return JSON.stringify(v, null, 2);
}

// ---------------------------------------------------------------------------
const manifests = {};
for (const lang of LANGS) manifests[lang] = loadManifest(lang);

const templates = loadTemplates();
if (templates.length !== 8) {
  throw new Error(
    `expected 8 golden-path templates, parsed ${templates.length}. ` +
      `flow-templates.ts shape changed — update the parser in generate-mcp-content.mjs.`,
  );
}

// Consistency gate: the MCP resources must describe the same packages the agent
// artifacts tell agents to install, or the two front doors disagree.
const agentGen = readFileSync(join(REPO, 'scripts', 'generate-agent-artifacts.mjs'), 'utf-8');
for (const [lang, meta] of Object.entries(LANG_META)) {
  if (!agentGen.includes(`pkg: '${meta.pkg}'`)) {
    throw new Error(`${lang}: package "${meta.pkg}" not declared in generate-agent-artifacts.mjs LANG_META`);
  }
}

// Per-language operation catalogs: machine-readable, which is what an agent
// choosing an operation should read (llms-full.txt is prose for humans/LLMs).
const operations = {};
for (const lang of LANGS) {
  const m = manifests[lang];
  operations[lang] = {
    language: lang,
    display: LANG_META[lang].display,
    package: LANG_META[lang].pkg,
    install: LANG_META[lang].install,
    sdkVersion: m.sdk_version,
    entrypoints: m.entrypoints,
    operations: m.operations
      .filter((o) => o.op !== 'comment')
      .map((o) => ({
        op: o.op,
        category: o.category,
        symbols: o.symbols,
        inputs: o.inputs ?? [],
        outputs: o.outputs ?? [],
        requires: o.requires ?? [],
      })),
  };
}

const header = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by scripts/generate-mcp-content.mjs from:
 *   packages/codegen/src/manifests/*.sdk-manifest.json
 *   apps/studio/src/data/flow-templates.ts
 *
 * Regenerate with: npm run gen:mcp
 */
`;

const body = `
export interface ConceptDoc {
  id: string;
  title: string;
  body: string;
}

export interface OperationCatalog {
  language: string;
  display: string;
  package: string;
  install: string;
  sdkVersion: string;
  entrypoints: unknown[];
  operations: Array<{
    op: string;
    category: string;
    symbols: unknown[];
    inputs: unknown[];
    outputs: unknown[];
    requires: string[];
  }>;
}

export interface GoldenPathTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  estimatedTime: string;
  tags: string[];
  instructions: string[];
  prerequisites: string[];
}

export const SDK_LANGUAGES = ${ts(LANGS)} as const;

export const CONCEPTS: Record<string, ConceptDoc> = ${ts(
  Object.fromEntries(Object.entries(CONCEPTS).map(([id, c]) => [id, { id, ...c }])),
)};

export const OPERATION_CATALOGS: Record<string, OperationCatalog> = ${ts(operations)};

export const GOLDEN_PATHS: GoldenPathTemplate[] = ${ts(templates)};

export interface ErrorCatalogEntry {
  code: string;
  protocolCodes: number[];
  category: string;
  retryable: boolean;
  observed?: boolean;
  hint: string;
  messagePatterns: string[];
  causes: string[];
  remediation: string;
  relatedOps: string[];
  bindings: Record<string, string>;
}

export interface ErrorCatalog {
  version: string;
  description: string;
  categories: Record<string, string>;
  bindings: Record<string, { base: string; catch: string; codeAccess: string; import?: string }>;
  errors: ErrorCatalogEntry[];
}

export const ERROR_CATALOG: ErrorCatalog = ${ts(errorCatalog)};
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, header + body);

const opCount = LANGS.reduce((n, l) => n + operations[l].operations.length, 0);
console.log(
  `Generated apps/mcp-server/src/generated/content.ts: ` +
    `${Object.keys(CONCEPTS).length} concepts, ${LANGS.length} operation catalogs (${opCount} ops), ${templates.length} golden paths.`,
);
