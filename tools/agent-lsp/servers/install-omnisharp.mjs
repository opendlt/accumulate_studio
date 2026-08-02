#!/usr/bin/env node
/**
 * Fetch OmniSharp, the C# language server.
 *
 * It is ~165 MB, so it is downloaded on demand rather than committed. This
 * directory is gitignored apart from this script.
 *
 * `csharp-ls` is the obvious alternative and does not work here: every release
 * from 0.21.0 onward ships a malformed `DotnetToolSettings.xml` and fails to
 * install, and 0.17.0 (the newest that installs) never loads a project under
 * .NET 9 — it initializes and then answers nothing.
 *
 *   node tools/agent-lsp/servers/install-omnisharp.mjs
 */
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEST = join(HERE, 'omnisharp');

const ASSET = {
  win32: 'omnisharp-win-x64-net6.0.zip',
  linux: 'omnisharp-linux-x64-net6.0.zip',
  darwin: 'omnisharp-osx-x64-net6.0.zip',
}[process.platform];

async function main() {
  if (existsSync(join(DEST, process.platform === 'win32' ? 'OmniSharp.exe' : 'OmniSharp'))) {
    console.log('OmniSharp already present at', DEST);
    return;
  }
  if (!ASSET) {
    console.error(`no OmniSharp asset known for platform ${process.platform}`);
    process.exit(2);
  }

  const rel = await (await fetch('https://api.github.com/repos/OmniSharp/omnisharp-roslyn/releases/latest')).json();
  const asset = (rel.assets ?? []).find((a) => a.name === ASSET)
    ?? (rel.assets ?? []).find((a) => a.name.includes('win-x64') && a.name.endsWith('.zip'));
  if (!asset) {
    console.error(`could not find ${ASSET} in release ${rel.tag_name}`);
    process.exit(2);
  }

  mkdirSync(DEST, { recursive: true });
  const zip = join(DEST, 'omnisharp.zip');
  console.log(`downloading ${asset.name} (${rel.tag_name})...`);
  const res = await fetch(asset.browser_download_url);
  const buf = Buffer.from(await res.arrayBuffer());
  await new Promise((r, j) => {
    const s = createWriteStream(zip);
    s.on('finish', r); s.on('error', j);
    s.end(buf);
  });

  // tar handles zip on modern Windows, and is present on macOS/Linux too.
  execFileSync('tar', ['-xf', zip, '-C', DEST], { stdio: 'inherit' });
  console.log('OmniSharp installed at', DEST);
}

main().catch((e) => { console.error(e.message); process.exit(2); });
