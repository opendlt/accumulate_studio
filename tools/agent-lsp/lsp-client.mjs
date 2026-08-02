/**
 * Minimal LSP client over stdio.
 *
 * Diagnostics can be had from a compiler, but jump-to-definition and
 * find-references cannot — they need a server that has indexed the project. This
 * speaks just enough of the protocol to ask those two questions and get
 * machine-readable answers back.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

/** LSP frames messages with a Content-Length header, not newlines. */
function frame(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
}

export class LspClient {
  constructor({ command, args = [], rootPath, env = {} }) {
    this.rootPath = rootPath;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      // A shell mangles absolute paths; real executables are spawned directly.
      shell: process.platform === 'win32' && command !== process.execPath && !command.endsWith('.exe'),
    });
    this.proc.stdout.on('data', (d) => this.#onData(d));
    this.proc.stderr.on('data', () => {}); // servers log freely; not our channel
    this.exited = new Promise((res) => this.proc.on('exit', res));
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.slice(0, headerEnd).toString('ascii');
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) { this.buffer = this.buffer.slice(headerEnd + 4); continue; }
      const len = Number(m[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + len) return; // wait for the rest
      const body = this.buffer.slice(start, start + len).toString('utf8');
      this.buffer = this.buffer.slice(start + len);
      let msg;
      try { msg = JSON.parse(body); } catch { continue; }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve(msg.result ?? msg.error ?? null);
      }
    }
  }

  request(method, params, timeoutMs = 60000) {
    const id = this.nextId++;
    this.proc.stdin.write(frame({ jsonrpc: '2.0', id, method, params }));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ error: `timeout after ${timeoutMs}ms waiting for ${method}` });
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (r) => { clearTimeout(timer); resolve(r); },
      });
    });
  }

  notify(method, params) {
    this.proc.stdin.write(frame({ jsonrpc: '2.0', method, params }));
  }

  async initialize() {
    const rootUri = pathToFileURL(this.rootPath).href;
    const res = await this.request('initialize', {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: 'root' }],
      capabilities: {
        textDocument: {
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
        },
        workspace: { symbol: { dynamicRegistration: false }, workspaceFolders: true },
      },
    }, 120000);
    this.notify('initialized', {});
    return res;
  }

  /** Servers answer positional queries only for documents they have been told about. */
  openDocument(filePath, languageId) {
    const uri = pathToFileURL(filePath).href;
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text: readFileSync(filePath, 'utf8') },
    });
    return uri;
  }

  async shutdown() {
    try {
      await this.request('shutdown', null, 5000);
      this.notify('exit', null);
    } catch { /* server already gone */ }
    this.proc.kill();
  }
}

/** LSP positions are 0-based; humans and compilers count from 1. */
export const toLspPosition = (line, column) => ({ line: line - 1, character: column - 1 });

/** Normalise Location | Location[] | LocationLink[] to one shape. */
export function normaliseLocations(result) {
  if (!result) return [];
  const arr = Array.isArray(result) ? result : [result];
  const out = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const uri = r.uri ?? r.targetUri;
    const range = r.range ?? r.targetSelectionRange ?? r.targetRange;
    if (!uri || !range) continue;
    let file = uri;
    try { file = fileURLToPath(uri); } catch { /* keep the uri */ }
    out.push({
      file,
      line: (range.start?.line ?? 0) + 1,
      column: (range.start?.character ?? 0) + 1,
      endLine: (range.end?.line ?? 0) + 1,
      endColumn: (range.end?.character ?? 0) + 1,
    });
  }
  return out;
}
