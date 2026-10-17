/**
 * protocol.test.mjs — end-to-end MCP protocol tests against the BUILT bundle.
 *
 * These drive the real published artifact (dist/index.js) over stdio, because
 * the bundling constraint is the thing most likely to break: the server is
 * built with `esbuild --bundle` and published with `files: ["dist"]`, so any
 * content read at runtime via `fs` would exist in the source tree and be absent
 * from the package. Testing the source would hide exactly that failure.
 *
 * Run: node --test apps/mcp-server/test/protocol.test.mjs
 * Requires: npm run build:mcp
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, '..', 'dist', 'index.js');

/** Minimal stdio JSON-RPC client — no SDK dependency, so we test the wire format. */
class McpClient {
  constructor(extraArgs = []) {
    this.child = spawn(process.execPath, [BUNDLE, ...extraArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ACCUMULATE_NETWORK: 'kermit' },
    });
    this.buf = '';
    this.pending = new Map();
    this.nextId = 0;
    this.stderr = '';
    this.child.stdout.setEncoding('utf-8');
    this.child.stderr.setEncoding('utf-8');
    this.child.stderr.on('data', (d) => { this.stderr += d; });
    this.child.stdout.on('data', (d) => this._onData(d));
  }

  _onData(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        throw new Error(`server wrote non-JSON to stdout (stdout is the protocol channel): ${line.slice(0, 200)}`);
      }
      const resolve = this.pending.get(msg.id);
      if (resolve) {
        this.pending.delete(msg.id);
        resolve(msg);
      }
    }
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 20000);
      this.pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async initialize() {
    const r = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'harness-test', version: '1.0.0' },
    });
    this.notify('notifications/initialized');
    return r;
  }

  close() {
    this.child.kill();
  }
}

describe('MCP protocol — built bundle', () => {
  let client;

  before(async () => {
    assert.ok(existsSync(BUNDLE), 'dist/index.js missing — run `npm run build:mcp` first');
    client = new McpClient();
    await client.initialize();
  });

  after(() => client?.close());

  test('advertises tools, resources and prompts capabilities', async () => {
    const c = new McpClient();
    const init = await c.initialize();
    const caps = init.result.capabilities;
    assert.ok(caps.tools, 'tools capability');
    assert.ok(caps.resources, 'resources capability');
    assert.ok(caps.prompts, 'prompts capability');
    c.close();
  });

  test('logs to stderr, never stdout', async () => {
    // stdout is the protocol channel; any stray console.log corrupts the stream.
    // _onData throws on non-JSON, so reaching here with a populated stderr and a
    // working request proves the separation holds.
    assert.match(client.stderr, /Accumulate|Registered|Permission/i);
  });

  // --- tools ---------------------------------------------------------------
  test('lists 17 tools', async () => {
    const r = await client.send('tools/list');
    assert.equal(r.result.tools.length, 17);
    for (const t of r.result.tools) {
      assert.ok(t.name && t.description && t.inputSchema, `${t.name} is fully described`);
    }
  });

  // --- tools: hash-locked sendTokens and the release ----------------------
  const LOCK_HASH = 'ab'.repeat(32);
  const SENDER = 'acc://sender.acme/tokens';
  const RECIPIENTS = [{ url: 'acc://receiver.acme/tokens', amount: '100000000' }];
  const DEPOSIT = `acc://${'cd'.repeat(32)}@receiver.acme/tokens`;
  const inMinutes = (m) => Date.now() + m * 60_000;
  const rfc3339 = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

  async function callTool(c, name, args) {
    const r = await c.send('tools/call', { name, arguments: args });
    return JSON.parse(r.result.content[0].text);
  }

  const buildSend = (c, hashLock) =>
    callTool(c, 'tx.build', {
      type: 'sendTokens',
      principal: SENDER,
      payload: { to: RECIPIENTS },
      ...(hashLock === undefined ? {} : { hashLock }),
    });

  const buildRelease = (c, payload) =>
    callTool(c, 'tx.build', {
      type: 'releaseLockedOperation',
      principal: 'acc://receiver.acme/tokens',
      payload,
    });

  test('tx.build advertises the optional hashLock header', async () => {
    const r = await client.send('tools/list');
    const build = r.result.tools.find((t) => t.name === 'tx.build');
    const lock = build.inputSchema.properties.hashLock;
    assert.ok(lock, 'hashLock is declared');
    assert.deepEqual(lock.required, ['hashAlgorithm', 'hash', 'expiration']);
    assert.deepEqual(lock.properties.hashAlgorithm.enum, ['sha256', 'sha256d']);
    assert.ok(!build.inputSchema.required.includes('hashLock'), 'hashLock stays optional');
  });

  test('a locked sendTokens carries the normalised hashLock and never promises a refund', async () => {
    // Unix seconds, upper-case hash and a mixed-case algorithm come back in wire form.
    const seconds = Math.floor(inMinutes(60) / 1000);
    const out = await buildSend(client, {
      hashAlgorithm: 'SHA256',
      hash: LOCK_HASH.toUpperCase(),
      expiration: seconds,
    });
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    assert.deepEqual(out.data.transaction.header.hashLock, {
      hashAlgorithm: 'sha256',
      hash: LOCK_HASH,
      expiration: rfc3339(seconds * 1000),
    });
    const warnings = (out.warnings ?? []).join('\n');
    assert.match(warnings, /credited only when a releaseLockedOperation/);
    assert.match(warnings, /not currently functional/i);
    assert.doesNotMatch(warnings, /refunded to the sender/i);
  });

  test('a locked sendTokens accepts sha256d and an RFC 3339 expiration', async () => {
    const expiration = rfc3339(inMinutes(120));
    const out = await buildSend(client, { hashAlgorithm: 'sha256d', hash: LOCK_HASH, expiration });
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    assert.equal(out.data.transaction.header.hashLock.hashAlgorithm, 'sha256d');
    assert.equal(out.data.transaction.header.hashLock.expiration, expiration);
  });

  test('a send without a hashLock is unchanged: no lock in the header, no HTLC warnings', async () => {
    const out = await buildSend(client);
    assert.equal(out.ok, true);
    assert.equal(out.data.transaction.header.hashLock, undefined);
    assert.doesNotMatch((out.warnings ?? []).join('\n'), /hashLock|refund/i);
  });

  test('an expiration under 15 minutes passes the node floor but warns about the thin margin', async () => {
    const out = await buildSend(client, {
      hashAlgorithm: 'sha256',
      hash: LOCK_HASH,
      expiration: rfc3339(inMinutes(12)),
    });
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    assert.match((out.warnings ?? []).join('\n'), /under 15 minutes/);
  });

  test('a hashLock the node would refuse is rejected at build, with the node\'s wording', async () => {
    const good = { hashAlgorithm: 'sha256', hash: LOCK_HASH, expiration: rfc3339(inMinutes(60)) };
    const cases = [
      ['not an object', 'abc', /must be an object/],
      ['an array', [good], /must be an object/],
      ['hash160', { ...good, hashAlgorithm: 'hash160' }, /hash160 is not supported/],
      ['an unknown algorithm', { ...good, hashAlgorithm: 'md5' }, /unsupported hashlock algorithm/],
      ['no algorithm', { hash: good.hash, expiration: good.expiration }, /unsupported hashlock algorithm/],
      ['no hash', { ...good, hash: undefined }, /hash cannot be empty/],
      ['an empty hash', { ...good, hash: '' }, /hash cannot be empty/],
      ['a non-hex hash', { ...good, hash: 'zz'.repeat(32) }, /must be hex/],
      ['a 31-byte hash', { ...good, hash: 'ab'.repeat(31) }, /must be 32 bytes for sha256, got 31/],
      ['a 20-byte hash for sha256d', { ...good, hashAlgorithm: 'sha256d', hash: 'ab'.repeat(20) }, /must be 32 bytes for sha256d, got 20/],
      ['no expiration', { ...good, expiration: undefined }, /expiration is required/],
      ['an unparseable expiration', { ...good, expiration: 'tomorrow' }, /must be RFC 3339/],
      ['an expiration in the past', { ...good, expiration: rfc3339(inMinutes(-5)) }, /at least 10 minutes/],
      ['an expiration 5 minutes ahead', { ...good, expiration: rfc3339(inMinutes(5)) }, /at least 10 minutes/],
      ['an expiration 31 days ahead', { ...good, expiration: rfc3339(inMinutes(31 * 24 * 60)) }, /cannot exceed 30 days/],
      ['milliseconds instead of seconds', { ...good, expiration: inMinutes(60) }, /looks like milliseconds/],
      ['fractional Unix seconds', { ...good, expiration: Math.floor(inMinutes(60) / 1000) + 0.5 }, /whole Unix seconds/],
      ['a sub-second RFC 3339 expiration', { ...good, expiration: new Date(Math.floor(inMinutes(60) / 1000) * 1000 + 500).toISOString() }, /whole seconds/],
    ];
    for (const [label, hashLock, message] of cases) {
      const out = await buildSend(client, hashLock);
      assert.equal(out.ok, false, `${label} must be rejected`);
      assert.equal(out.errors[0].code, 'INVALID_HASH_LOCK', label);
      assert.match(out.errors.map((e) => e.message).join('\n'), message, label);
    }
  });

  test('a hashLock on any type but sendTokens is rejected, because the node would silently ignore it', async () => {
    const out = await callTool(client, 'tx.build', {
      type: 'addCredits',
      principal: SENDER,
      payload: { recipient: 'acc://sender.acme/book/1', amount: 100 },
      hashLock: { hashAlgorithm: 'sha256', hash: LOCK_HASH, expiration: rfc3339(inMinutes(60)) },
    });
    assert.equal(out.ok, false);
    assert.equal(out.errors[0].code, 'INVALID_HASH_LOCK');
    assert.match(out.errors[0].message, /only honoured on sendTokens/);
  });

  test('releaseLockedOperation is a known type with the protocol field names and a real credit estimate', async () => {
    const out = await buildRelease(client, { lockedTxID: DEPOSIT, preimage: 'ef'.repeat(32) });
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    assert.equal(out.data.transaction.body.type, 'releaseLockedOperation');
    assert.equal(out.data.transaction.body.payload.lockedTxID, DEPOSIT);
    // 1 credit, not the unknown-type default of 10.
    assert.equal(out.data.transaction.estimatedCredits, 1);
    const warnings = (out.warnings ?? []).join('\n');
    assert.match(warnings, /recipient account of the locked deposit/);
    assert.match(warnings, /fails at execute/);
  });

  test('a release written with the SDK spelling lockedTxId is sent under the wire name lockedTxID', async () => {
    const out = await buildRelease(client, { lockedTxId: DEPOSIT, preimage: 'ef'.repeat(32) });
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    const payload = out.data.transaction.body.payload;
    assert.equal(payload.lockedTxID, DEPOSIT);
    assert.equal(payload.lockedTxId, undefined);
  });

  test('a malformed release is rejected at build, with the node\'s wording', async () => {
    const cases = [
      ['no locked id', { preimage: 'ef'.repeat(32) }, /locked transaction ID is required/],
      ['a send-style id with no hash', { lockedTxID: 'acc://receiver.acme/tokens', preimage: 'ef' }, /must be a transaction id of the form acc:\/\/<64 hex>@/],
      ['no preimage', { lockedTxID: DEPOSIT }, /preimage is required/],
      ['an empty preimage', { lockedTxID: DEPOSIT, preimage: '' }, /preimage is required/],
      ['an odd-length preimage', { lockedTxID: DEPOSIT, preimage: 'abc' }, /even-length hex/],
      ['a non-hex preimage', { lockedTxID: DEPOSIT, preimage: 'zz' }, /even-length hex/],
      ['a 257-byte preimage', { lockedTxID: DEPOSIT, preimage: 'ab'.repeat(257) }, /preimage too large \(max 256 bytes\)/],
    ];
    for (const [label, payload, message] of cases) {
      const out = await buildRelease(client, payload);
      assert.equal(out.ok, false, `${label} must be rejected`);
      assert.equal(out.errors[0].code, 'INVALID_PAYLOAD', label);
      assert.match(out.errors.map((e) => e.message).join('\n'), message, label);
    }
    // The boundary itself is valid: 256 bytes.
    const edge = await buildRelease(client, { lockedTxID: DEPOSIT, preimage: 'ab'.repeat(256) });
    assert.equal(edge.ok, true, JSON.stringify(edge.errors));
  });

  test('tx.submit re-checks the lock window and the type, before any network call', async () => {
    const c = new McpClient(['--permission-mode', 'SIGN_AND_SUBMIT']);
    await c.initialize();
    const built = await buildSend(c, {
      hashAlgorithm: 'sha256',
      hash: LOCK_HASH,
      expiration: rfc3339(inMinutes(60)),
    });
    assert.equal(built.ok, true, JSON.stringify(built.errors));
    const submit = (transaction) =>
      callTool(c, 'tx.submit', { transaction, signature: 'aa'.repeat(64), signer: 'bb'.repeat(32) });

    // The lock expired between build and submit.
    const stale = structuredClone(built.data.transaction);
    stale.header.hashLock.expiration = rfc3339(inMinutes(2));
    const expired = await submit(stale);
    assert.equal(expired.ok, false);
    assert.equal(expired.errors[0].code, 'INVALID_HASH_LOCK');
    assert.match(expired.errors[0].message, /at least 10 minutes/);

    // A hand-built transaction with a lock on the wrong type.
    const wrongType = structuredClone(built.data.transaction);
    wrongType.body.type = 'addCredits';
    const ignored = await submit(wrongType);
    assert.equal(ignored.ok, false);
    assert.equal(ignored.errors[0].code, 'INVALID_HASH_LOCK');
    assert.match(ignored.errors[0].message, /only honoured on sendTokens/);

    // A malformed lock supplied directly, bypassing tx.build.
    const bad = structuredClone(built.data.transaction);
    bad.header.hashLock.hash = 'ab'.repeat(20);
    const short = await submit(bad);
    assert.equal(short.ok, false);
    assert.equal(short.errors[0].code, 'INVALID_HASH_LOCK');
    assert.match(short.errors[0].message, /must be 32 bytes/);
    c.close();
  });

  test('tx.submit stays refused in BUILD_ONLY even with a valid lock', async () => {
    const built = await buildSend(client, {
      hashAlgorithm: 'sha256',
      hash: LOCK_HASH,
      expiration: rfc3339(inMinutes(60)),
    });
    const r = await callTool(client, 'tx.submit', {
      transaction: built.data.transaction,
      signature: 'aa'.repeat(64),
      signer: 'bb'.repeat(32),
    });
    assert.equal(r.ok, false);
    assert.match(JSON.stringify(r.errors), /SIGN_AND_SUBMIT|PERMISSION/i);
  });

  // --- resources -----------------------------------------------------------
  test('lists static resources', async () => {
    const r = await client.send('resources/list');
    const uris = r.result.resources.map((x) => x.uri);
    assert.ok(uris.includes('accumulate://networks'));
    assert.ok(uris.includes('accumulate://templates'));
    assert.ok(uris.includes('accumulate://concepts/amount-scaling'));
    assert.ok(uris.includes('accumulate://concepts/credits'));
    for (const res of r.result.resources) {
      assert.ok(res.name && res.description && res.mimeType, `${res.uri} fully described`);
    }
  });

  test('lists resource templates for the parameterized families', async () => {
    const r = await client.send('resources/templates/list');
    const t = r.result.resourceTemplates.map((x) => x.uriTemplate);
    assert.ok(t.includes('accumulate://sdk/{language}/operations'));
    assert.ok(t.includes('accumulate://concepts/{topic}'));
    assert.ok(t.includes('accumulate://templates/{id}'));
    assert.ok(t.includes('accumulate://errors/{code}'));
  });

  // --- error catalog (RB-05) ----------------------------------------------
  test('serves the error catalog, every entry actionable', async () => {
    const r = await client.send('resources/read', { uri: 'accumulate://errors' });
    const cat = JSON.parse(r.result.contents[0].text);
    assert.ok(cat.errors.length > 0, 'catalog is populated');
    for (const e of cat.errors) {
      // K7's definition of actionable: a code carrying a non-empty remediation
      // and an explicit retryable. A catalog entry missing either is noise.
      assert.match(e.code, /^ACC_[A-Z0-9_]+$/, `${e.code} is well-formed`);
      assert.equal(typeof e.retryable, 'boolean', `${e.code} declares retryable`);
      assert.ok(e.remediation && e.remediation.length > 20, `${e.code} has a real fix`);
      assert.ok(cat.categories[e.category], `${e.code} category is defined`);
    }
  });

  test('serves a single error entry by code', async () => {
    const r = await client.send('resources/read', {
      uri: 'accumulate://errors/ACC_INSUFFICIENT_CREDITS',
    });
    const e = JSON.parse(r.result.contents[0].text);
    assert.equal(e.code, 'ACC_INSUFFICIENT_CREDITS');
    assert.equal(e.retryable, false);
  });

  test('explain_error maps a raw protocol string to the fix, and says do-not-retry', async () => {
    const r = await client.send('tools/call', {
      name: 'acc.explain_error',
      arguments: {
        error: 'unauthorized: key does not belong to signer',
        language: 'dart',
      },
    });
    const out = JSON.parse(r.result.content[0].text);
    const data = out.data ?? out;
    assert.equal(data.matched, true);
    assert.equal(data.matches[0].code, 'ACC_UNAUTHORIZED_SIGNER');
    assert.equal(data.matches[0].retryable, false);
    assert.match(data.guidance, /DO NOT RETRY/);
    assert.ok(data.matches[0].catchSyntax, 'returns Dart catch syntax');
  });

  test('explain_error resolves the -33404 wire code and flags network errors retryable', async () => {
    const byCode = await client.send('tools/call', {
      name: 'acc.explain_error',
      arguments: { error: 'query failed', code: -33404 },
    });
    const a = JSON.parse(byCode.result.content[0].text);
    assert.equal((a.data ?? a).matches[0].code, 'ACC_ACCOUNT_NOT_FOUND');

    const net = await client.send('tools/call', {
      name: 'acc.explain_error',
      arguments: { error: 'connect ETIMEDOUT 10.0.0.1:443' },
    });
    const b = JSON.parse(net.result.content[0].text);
    const d = b.data ?? b;
    assert.equal(d.matches[0].retryable, true);
    assert.match(d.guidance, /RETRY is productive/);
  });

  test('explain_error defaults an unknown error to do-not-retry', async () => {
    const r = await client.send('tools/call', {
      name: 'acc.explain_error',
      arguments: { error: 'something entirely unclassified happened' },
    });
    const out = JSON.parse(r.result.content[0].text);
    const data = out.data ?? out;
    assert.equal(data.matched, false);
    assert.match(data.guidance, /NOT retryable/i);
  });

  test('amount-scaling concept states the 1e8 rule', async () => {
    const r = await client.send('resources/read', { uri: 'accumulate://concepts/amount-scaling' });
    const text = r.result.contents[0].text;
    assert.match(text, /1 ACME = 100,000,000/);
    assert.match(text, /100000000/);
  });

  test('credits concept states the prerequisite chain', async () => {
    const r = await client.send('resources/read', { uri: 'accumulate://concepts/credits' });
    const text = r.result.contents[0].text;
    assert.match(text, /credits/i);
    assert.match(text, /key page/i);
  });

  test('networks resource reflects the live selection and flags mainnet read-only', async () => {
    const r = await client.send('resources/read', { uri: 'accumulate://networks' });
    const data = JSON.parse(r.result.contents[0].text);
    assert.equal(data.current, 'kermit', 'honors ACCUMULATE_NETWORK');
    const mainnet = data.networks.find((n) => n.id === 'mainnet');
    assert.equal(mainnet.readOnly, true);
    assert.equal(mainnet.faucetAvailable, false);
  });

  test('every SDK operation catalog resolves with every manifest operation', async () => {
    for (const lang of ['python', 'rust', 'dart', 'csharp', 'javascript']) {
      // The catalog is generated from the manifest minus the `comment` pseudo-operation, so that
      // is the expected count (25 blocks plus the 3 HTLC operations = 28); the floor guards
      // against a silent drop.
      const expected = JSON.parse(
        readFileSync(join(HERE, '..', '..', '..', 'packages', 'codegen', 'src', 'manifests', `${lang}.sdk-manifest.json`), 'utf8'),
      ).operations.filter((o) => o.op !== 'comment').length;
      assert.ok(expected >= 28, `${lang} manifest has at least 28 operations`);
      const r = await client.send('resources/read', {
        uri: `accumulate://sdk/${lang}/operations`,
      });
      const cat = JSON.parse(r.result.contents[0].text);
      assert.equal(cat.language, lang);
      assert.equal(cat.operations.length, expected, `${lang} operation count`);
      assert.ok(cat.package, `${lang} package name`);
      assert.ok(cat.install, `${lang} install command`);
      // Signatures are what make the catalog useful over prose.
      const withSymbols = cat.operations.filter((o) => o.symbols?.length);
      assert.equal(withSymbols.length, expected, `${lang} ops all carry symbols`);
    }
  });

  test('operation catalogs carry the prerequisite data', async () => {
    const r = await client.send('resources/read', { uri: 'accumulate://sdk/python/operations' });
    const cat = JSON.parse(r.result.contents[0].text);
    const withRequires = cat.operations.filter((o) => o.requires?.length);
    assert.ok(withRequires.length >= 20, `expected >=20 ops with requires, got ${withRequires.length}`);
  });

  test('unknown resource URI returns an actionable error', async () => {
    const r = await client.send('resources/read', { uri: 'accumulate://nope' });
    assert.ok(r.error, 'errors rather than returning empty content');
    assert.match(r.error.message, /Valid prefixes/);
  });

  test('unknown concept lists the available topics', async () => {
    const r = await client.send('resources/read', { uri: 'accumulate://concepts/does-not-exist' });
    assert.ok(r.error);
    assert.match(r.error.message, /amount-scaling/);
  });

  test('unknown SDK language lists the available languages', async () => {
    const r = await client.send('resources/read', { uri: 'accumulate://sdk/cobol/operations' });
    assert.ok(r.error);
    assert.match(r.error.message, /python/);
  });

  // --- prompts -------------------------------------------------------------
  test('lists all 9 golden paths as prompts', async () => {
    const r = await client.send('prompts/list');
    assert.equal(r.result.prompts.length, 9);
    const names = r.result.prompts.map((p) => p.name);
    for (const id of [
      'lite-account-setup', 'create-adi', 'zero-to-hero', 'token-transfer',
      'data-writing', 'custom-token', 'multi-sig-setup', 'key-rotation', 'hash-lock',
    ]) {
      assert.ok(names.includes(id), `prompt ${id}`);
    }
  });

  test('the hash-lock prompt describes the lock/deposit/release flow and does not promise a refund', async () => {
    const r = await client.send('prompts/get', { name: 'hash-lock' });
    const text = r.result.messages[0].content.text;
    assert.match(text, /Hash Lock \(HTLC\) Payment/);
    assert.match(text, /locked deposit/i);
    assert.match(text, /reveal/i);
    // Refund on expiry is unreachable in core: the copy must say so rather than promise it.
    assert.match(text, /not currently functional/i);
    assert.doesNotMatch(text, /refunded to the sender/i);
  });

  test('every prompt states the 1e8 rule and the credit prerequisite', async () => {
    const list = await client.send('prompts/list');
    for (const p of list.result.prompts) {
      const r = await client.send('prompts/get', { name: p.name });
      const text = r.result.messages[0].content.text;
      assert.match(text, /1 ACME = 1e8 base units/, `${p.name} states amount scaling`);
      assert.match(text, /credits/i, `${p.name} mentions credits`);
      assert.match(text, /## Steps/, `${p.name} has numbered steps`);
    }
  });

  test('prompt arguments are declared', async () => {
    const r = await client.send('prompts/list');
    for (const p of r.result.prompts) {
      assert.ok(Array.isArray(p.arguments), `${p.name} declares arguments`);
      assert.ok(p.arguments.some((a) => a.name === 'network'), `${p.name} takes a network`);
    }
  });

  test('prompt honors the network argument', async () => {
    const r = await client.send('prompts/get', {
      name: 'create-adi',
      arguments: { network: 'devnet', adiName: 'mycorp' },
    });
    const text = r.result.messages[0].content.text;
    assert.match(text, /devnet/);
    assert.match(text, /acc:\/\/mycorp\.acme/);
  });

  test('unknown prompt returns an actionable error', async () => {
    const r = await client.send('prompts/get', { name: 'not-a-workflow' });
    assert.ok(r.error);
    assert.match(r.error.message, /Available:/);
  });

  test('BUILD_ONLY prompts disclose that submit will be refused', async () => {
    // Default mode is BUILD_ONLY. A workflow that ends in a submit must say the
    // submit will fail rather than walking the agent into a dead end.
    const r = await client.send('prompts/get', { name: 'token-transfer' });
    const text = r.result.messages[0].content.text;
    assert.match(text, /BUILD_ONLY/);
    assert.match(text, /SIGN_AND_SUBMIT/);
  });

  test('SIGN_AND_SUBMIT prompts carry no permission warning', async () => {
    const c = new McpClient(['--permission-mode', 'SIGN_AND_SUBMIT']);
    await c.initialize();
    const r = await c.send('prompts/get', { name: 'token-transfer' });
    const text = r.result.messages[0].content.text;
    assert.ok(!/will be refused/.test(text), 'no false warning when signing is allowed');
    c.close();
  });

  test('resources remain readable in READ_ONLY mode', async () => {
    const c = new McpClient(['--permission-mode', 'READ_ONLY']);
    await c.initialize();
    const r = await c.send('resources/read', { uri: 'accumulate://concepts/credits' });
    assert.ok(r.result?.contents?.[0]?.text, 'context is available in every mode');
    c.close();
  });
});
