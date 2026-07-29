# npm-publish

Publishes an npm package by talking to the registry HTTP API directly.

## Why this exists

The npm CLI cannot pack or publish on the maintainer's Windows box. `npm pack` and
`npm publish` both exit `1` immediately after the `prepare` script with no
diagnostic at all — the debug log ends at `verbose publish [ '.' ]`, which is the
packing step. This is the `spawn EPERM` breakage recorded in
`docs/ai-agent-readiness/PROGRESS.md`.

A previous release worked around it with an equivalent script that lived in a
scratchpad directory and was subsequently lost, so the next release had to
rediscover the problem. Hence: a committed tool.

## What it does

Exactly what the npm CLI does under the hood — `PUT` a packument to
`https://registry.npmjs.org/<package>` where:

- `_attachments[<tarball>].data` is the base64 tarball
- `dist.shasum` is its sha1, `dist.integrity` its sha512

The registry recomputes both and rejects a mismatch, so a corrupted upload fails
rather than publishing silently.

## Usage

```bash
# 1. Build the package (the tsc output is what `files` ships)
cd <package-dir> && npm run build

# 2. Build the tarball. npm always ships package.json/README/LICENSE; everything
#    else comes from the package.json `files` field. Paths must be prefixed
#    `package/`.
mkdir -p stage/package
cp -r package.json README.md LICENSE.md CHANGELOG.md llms.txt llms-full.txt AGENTS.md lib src stage/package/
(cd stage && tar --format=ustar -czf ../<name>-<version>.tgz package)

# 3. Verify before sending
node tools/npm-publish/publish.mjs <tarball> <package-dir> --dry-run

# 4. Publish
NPM_TOKEN=<automation-token> node tools/npm-publish/publish.mjs <tarball> <package-dir>
```

## Notes

- The token must be an **automation** token. A classic token is rejected for an
  OTP even when 2FA is otherwise satisfied.
- `NPM_TOKEN` is read from the environment and never logged.
- Publishing is irreversible. Run `--dry-run` first and check the version.
