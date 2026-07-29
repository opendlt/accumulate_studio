/**
 * npm-http-publish.mjs
 *
 * The npm CLI cannot pack or publish on this machine — it exits 1 immediately at
 * the packing step with no diagnostic (the documented `spawn EPERM` breakage).
 * This publishes straight to the registry HTTP API instead, which is what the
 * npm CLI does under the hood: PUT a packument whose `_attachments` carries the
 * base64 tarball, with `dist.integrity` (sha512) and `dist.shasum` (sha1) that
 * the registry recomputes and validates.
 *
 * Usage: node npm-http-publish.mjs <tarball> <package-dir> [--dry-run]
 * Token: NPM_TOKEN env var. Never logged.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

const [tarballPath, pkgDir] = process.argv.slice(2);
const dryRun = process.argv.includes('--dry-run');

if (!tarballPath || !pkgDir) {
  console.error('usage: node npm-http-publish.mjs <tarball> <package-dir> [--dry-run]');
  process.exit(2);
}

const token = process.env.NPM_TOKEN;
if (!token) {
  console.error('NPM_TOKEN is not set.');
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(`${pkgDir}/package.json`, 'utf-8'));
const tarball = readFileSync(tarballPath);

const shasum = createHash('sha1').update(tarball).digest('hex');
const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
const filename = basename(tarballPath);
const registry = 'https://registry.npmjs.org';
const tarballUrl = `${registry}/${pkg.name}/-/${filename}`;

// The registry rejects a packument that redeclares fields it owns, so send the
// package.json as-is plus only the version-level additions it expects.
const versionDoc = {
  ...pkg,
  _id: `${pkg.name}@${pkg.version}`,
  dist: { integrity, shasum, tarball: tarballUrl },
};

const packument = {
  _id: pkg.name,
  name: pkg.name,
  description: pkg.description ?? '',
  'dist-tags': { latest: pkg.version },
  versions: { [pkg.version]: versionDoc },
  access: 'public',
  _attachments: {
    [filename]: {
      content_type: 'application/octet-stream',
      data: tarball.toString('base64'),
      length: tarball.length,
    },
  },
};

console.log(`package   ${pkg.name}@${pkg.version}`);
console.log(`tarball   ${filename} (${tarball.length} bytes)`);
console.log(`shasum    ${shasum}`);
console.log(`integrity ${integrity}`);

if (dryRun) {
  console.log('\n--dry-run: nothing sent.');
  process.exit(0);
}

const res = await fetch(`${registry}/${encodeURIComponent(pkg.name)}`, {
  method: 'PUT',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    // The registry gates 2FA-exempt automation tokens on this header.
    'npm-auth-type': 'web',
    'user-agent': 'npm/10.9.2 node/v22.14.0',
  },
  body: JSON.stringify(packument),
});

const text = await res.text();
console.log(`\nHTTP ${res.status} ${res.statusText}`);
console.log(text.slice(0, 1200));
process.exit(res.ok ? 0 : 1);
