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
import { existsSync } from 'node:fs';
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
  test('lists 16 tools', async () => {
    const r = await client.send('tools/list');
    assert.equal(r.result.tools.length, 16);
    for (const t of r.result.tools) {
      assert.ok(t.name && t.description && t.inputSchema, `${t.name} is fully described`);
    }
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

  test('every SDK operation catalog resolves with 25 operations', async () => {
    for (const lang of ['python', 'rust', 'dart', 'csharp', 'javascript']) {
      const r = await client.send('resources/read', {
        uri: `accumulate://sdk/${lang}/operations`,
      });
      const cat = JSON.parse(r.result.contents[0].text);
      assert.equal(cat.language, lang);
      assert.equal(cat.operations.length, 25, `${lang} operation count`);
      assert.ok(cat.package, `${lang} package name`);
      assert.ok(cat.install, `${lang} install command`);
      // Signatures are what make the catalog useful over prose.
      const withSymbols = cat.operations.filter((o) => o.symbols?.length);
      assert.equal(withSymbols.length, 25, `${lang} ops all carry symbols`);
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
  test('lists all 8 golden paths as prompts', async () => {
    const r = await client.send('prompts/list');
    assert.equal(r.result.prompts.length, 8);
    const names = r.result.prompts.map((p) => p.name);
    for (const id of [
      'lite-account-setup', 'create-adi', 'zero-to-hero', 'token-transfer',
      'data-writing', 'custom-token', 'multi-sig-setup', 'key-rotation',
    ]) {
      assert.ok(names.includes(id), `prompt ${id}`);
    }
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
