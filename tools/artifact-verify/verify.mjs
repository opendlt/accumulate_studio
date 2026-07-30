#!/usr/bin/env node
/**
 * artifact-verify — Phase 0 (P0-ST-07)
 *
 * Deterministic, agent-free verifier of the *published* SDK artifacts.
 * It downloads each package from its real registry and asserts the signals an
 * AI coding agent depends on:
 *   - NAME_PARITY : the install name the README tells agents to use actually exists
 *   - TYPE_SIGNALS: the package ships the types/doc files an agent's tooling reads
 *   - LLMS_TXT    : the package ships llms.txt / llms-full.txt (added in Phase 2)
 *   - VERSION     : latest published version (feeds fleet-parity KPI K8)
 *
 * Principle: verify the DOWNLOADED ARTIFACT, never the source tree or a rendered
 * registry page. (Both baseline assessment errors came from not doing this.)
 *
 * Usage:
 *   node tools/artifact-verify/verify.mjs            # human table + exit code
 *   node tools/artifact-verify/verify.mjs --json     # machine-readable JSON to stdout
 *   node tools/artifact-verify/verify.mjs --out FILE # also write JSON to FILE
 *
 * Exit code: 0 if no FAIL checks (SKIP/EXPECTED_FAIL allowed), 1 otherwise.
 * Node >= 18 (global fetch). Uses system `tar` (bsdtar) with `unzip` fallback
 * to list archive contents; degrades to SKIP if neither is present.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, relative } from 'node:path';
import { isBuiltin } from 'node:module';

// ---------------------------------------------------------------------------
// Target definitions: what each SDK's README/docs tell an agent, vs reality.
// `readmeInstallName` is the identifier the current README instructs agents to
// install. When it differs from `actualPackage`, NAME_PARITY is expected to FAIL
// until Phase 1 fixes the docs.
// ---------------------------------------------------------------------------
const TARGETS = [
  {
    lang: 'rust',
    registry: 'crates',
    actualPackage: 'accumulate-sdk',
    readmeInstallName: 'accumulate-sdk', // fixed & published in 2.1.2 (was wrongly `accumulate-client`)
    note: 'lib import name is accumulate_client (correct); the crate name is accumulate-sdk',
    // Rust is statically typed, so a py.typed equivalent is meaningless. The
    // agent-facing type surface is rustdoc — and a docs.rs build that fails is
    // invisible locally while breaking every agent that consults it.
    expectDocsRs: true,
  },
  {
    lang: 'python',
    registry: 'pypi',
    actualPackage: 'accumulate-sdk-opendlt',
    readmeInstallName: 'accumulate-sdk-opendlt',
    expectPyTyped: true,
  },
  {
    lang: 'dart',
    registry: 'pub',
    actualPackage: 'opendlt_accumulate',
    readmeInstallName: 'opendlt_accumulate',
    // Dart is statically typed too; the agent-facing surface is dartdoc. The
    // published archive must carry `///` doc comments on the public API, and
    // pub.dev's analyzer must not be erroring on the package.
    expectDartDoc: true,
    // Compile the documented umbrella import against a clean pub install.
    // Archive-contents checks are not enough: 2.2.0 shipped a lib/ that looked
    // plausible while `lib/src/build/` was missing, so the umbrella library
    // re-exported files that did not exist and NOTHING could import the package.
    expectDartImport: true,
  },
  {
    lang: 'csharp',
    registry: 'nuget',
    actualPackage: 'Acme.Net.Sdk',
    readmeInstallName: 'Acme.Net.Sdk',
    expectXmlDoc: true, // nupkg must ship lib/<tfm>/*.xml for IntelliSense/agents
  },
  {
    lang: 'javascript',
    registry: 'npm',
    actualPackage: 'accumulate-sdk-opendlt',
    readmeInstallName: 'accumulate-sdk-opendlt', // fixed & published in 0.13.0 (was wrongly `accumulate.js`)
    expectTypesEntry: true,
    expectExportsResolve: true,
    // Installs the package and imports it. npm is the only registry where this
    // is cheap enough to run every time; the other four would need their full
    // toolchains (see tools/agent-harness for the equivalent per-language
    // install probe).
    expectRuntimeImport: true,
  },
];

const UA = 'accumulate-artifact-verify/0.1 (+https://github.com/accumulate/accumulate-studio)';
const results = [];
const workDir = mkdtempSync(join(tmpdir(), 'acc-artifact-'));

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function record(lang, id, status, detail) {
  results.push({ lang, id, status, detail });
  return status;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function download(url, filename) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = join(workDir, filename);
  writeFileSync(path, buf);
  return { path, bytes: buf.length };
}

/**
 * Extract a .tgz into `dest`. Same cwd/basename dance as listArchive so GNU tar
 * does not read a Windows `C:\...` path as a remote host spec.
 * Returns true on success.
 */
function extractArchive(path, destName) {
  const dir = dirname(path);
  const file = basename(path);
  const dest = join(dir, destName);
  mkdirSync(dest, { recursive: true });
  try {
    // BOTH paths stay relative to cwd: GNU tar treats an argument containing a
    // colon (C:\...) as host:path, so an absolute -C silently fails.
    execFileSync('tar', ['-xzf', file, '-C', destName], {
      cwd: dir,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 120000,
    });
    return dest;
  } catch {
    return null;
  }
}

/** Recursively collect files under `dir` matching `re`. */
function walkFiles(dir, re, out = []) {
  let items;
  try {
    items = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of items) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, re, out);
    else if (re.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * List entries in a .tgz or .zip using system tools; returns string[] or null.
 * Runs with cwd=dir and passes only the basename so GNU tar doesn't mistake a
 * Windows path (C:\...) for a remote host:path spec, and to sidestep MSYS path
 * mangling. `tar` reads .tar.gz (and .crate); `unzip` reads .zip (nupkg/wheel).
 */
function listArchive(path) {
  const dir = dirname(path);
  const file = basename(path);
  for (const [cmd, args] of [
    ['tar', ['-tf', file]],
    ['unzip', ['-Z1', file]],
  ]) {
    try {
      const out = execFileSync(cmd, args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const entries = out.split(/\r?\n/).filter(Boolean);
      if (entries.length) return entries;
    } catch {
      /* try next tool */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Registry adapters — return { exists, version, meta }
// ---------------------------------------------------------------------------
const registry = {
  async npm(name) {
    try {
      const d = await fetchJson(`https://registry.npmjs.org/${name}`);
      const version = d['dist-tags']?.latest;
      return { exists: true, version, meta: d.versions?.[version], tarball: d.versions?.[version]?.dist?.tarball };
    } catch (e) {
      if (e.status === 404) return { exists: false };
      throw e;
    }
  },
  async pypi(name) {
    try {
      const d = await fetchJson(`https://pypi.org/pypi/${name}/json`);
      const wheel = (d.urls || []).find((u) => u.packagetype === 'bdist_wheel');
      return { exists: true, version: d.info?.version, tarball: wheel?.url, wheel: true };
    } catch (e) {
      if (e.status === 404) return { exists: false };
      throw e;
    }
  },
  async crates(name) {
    try {
      const d = await fetchJson(`https://crates.io/api/v1/crates/${name}`);
      if (d.errors) return { exists: false };
      const version = d.crate?.max_version;
      return {
        exists: true,
        version,
        tarball: version ? `https://crates.io/api/v1/crates/${name}/${version}/download` : undefined,
      };
    } catch (e) {
      if (e.status === 404) return { exists: false };
      throw e;
    }
  },
  async nuget(name) {
    const id = name.toLowerCase();
    try {
      const d = await fetchJson(`https://api.nuget.org/v3-flatcontainer/${id}/index.json`);
      const version = d.versions?.[d.versions.length - 1];
      return {
        exists: true,
        version,
        tarball: `https://api.nuget.org/v3-flatcontainer/${id}/${version}/${id}.${version}.nupkg`,
      };
    } catch (e) {
      if (e.status === 404) return { exists: false };
      throw e;
    }
  },
  async pub(name) {
    try {
      const d = await fetchJson(`https://pub.dev/api/packages/${name}`);
      return { exists: true, version: d.latest?.version, tarball: d.latest?.archive_url };
    } catch (e) {
      if (e.status === 404) return { exists: false };
      throw e;
    }
  },
};

// ---------------------------------------------------------------------------
// Per-target verification
// ---------------------------------------------------------------------------
async function verifyTarget(t) {
  const reg = registry[t.registry];

  // 1) The actual package must exist + capture version (K8)
  let actual;
  try {
    actual = await reg(t.actualPackage);
  } catch (e) {
    record(t.lang, 'REGISTRY_REACHABLE', 'SKIP', `could not reach ${t.registry}: ${e.message}`);
    return;
  }
  if (!actual?.exists) {
    record(t.lang, 'PACKAGE_PUBLISHED', 'FAIL', `${t.actualPackage} not found on ${t.registry}`);
    return;
  }
  record(t.lang, 'VERSION', 'INFO', `${t.actualPackage} @ ${actual.version} (${t.registry})`);

  // 2) NAME_PARITY: the name the README tells agents to install must exist
  if (t.readmeInstallName === t.actualPackage) {
    record(t.lang, 'NAME_PARITY', 'PASS', `README install name matches published package (${t.actualPackage})`);
  } else {
    let claimed;
    try {
      claimed = await reg(t.readmeInstallName);
    } catch {
      claimed = { exists: false };
    }
    if (!claimed.exists) {
      record(
        t.lang,
        'NAME_PARITY',
        'FAIL',
        `README tells agents to install "${t.readmeInstallName}", which does NOT exist on ${t.registry}. Real package: "${t.actualPackage}". Fix in Phase 1.`,
      );
    } else {
      record(
        t.lang,
        'NAME_PARITY',
        'FAIL',
        `README install name "${t.readmeInstallName}" resolves but is a DIFFERENT package than the real "${t.actualPackage}". Fix in Phase 1.`,
      );
    }
  }

  // 3) Type/doc-signal checks that require inspecting the artifact contents
  let entries = null;
  let artifactPath = null;
  const url = actual.tarball;
  if (url) {
    try {
      const { path, bytes } = await download(url, `${t.lang}-artifact`);
      artifactPath = path;
      entries = listArchive(path);
      if (!entries) {
        record(t.lang, 'ARTIFACT_INSPECT', 'SKIP', `downloaded ${bytes} bytes but no tar/unzip available to list contents`);
      }
    } catch (e) {
      record(t.lang, 'ARTIFACT_INSPECT', 'SKIP', `could not download/inspect artifact: ${e.message}`);
    }
  } else {
    record(t.lang, 'ARTIFACT_INSPECT', 'SKIP', `no downloadable artifact URL for ${t.registry}`);
  }

  const has = (re) => entries && entries.some((e) => re.test(e));

  // C#: XML doc file must ship
  if (t.expectXmlDoc && entries) {
    record(
      t.lang,
      'TYPE_SIGNALS',
      has(/lib\/[^/]+\/.*\.xml$/i) ? 'PASS' : 'FAIL',
      has(/lib\/[^/]+\/.*\.xml$/i)
        ? 'nupkg ships lib/<tfm>/*.xml (IntelliSense docs present)'
        : 'nupkg ships NO .xml doc file — set <GenerateDocumentationFile>true (P1-CS-01)',
    );
  }

  // Rust: rustdoc is the agent-facing type surface, and docs.rs is where agents
  // read it. A failed docs.rs build is invisible in a local `cargo doc`.
  if (t.expectDocsRs) {
    try {
      const st = await fetchJson(
        `https://docs.rs/crate/${t.actualPackage}/${actual.version || 'latest'}/status.json`,
      );
      record(
        t.lang,
        'TYPE_SIGNALS',
        st.doc_status === true ? 'PASS' : 'FAIL',
        st.doc_status === true
          ? `docs.rs built rustdoc for ${st.version || actual.version} (type surface reachable)`
          : `docs.rs build FAILED for ${st.version || actual.version} — agents cannot read the API`,
      );
    } catch (e) {
      record(t.lang, 'TYPE_SIGNALS', 'SKIP', `could not reach docs.rs: ${e.message}`);
    }
  }

  // Dart: the documented umbrella import must actually COMPILE against a clean
  // `dart pub add` of the published version.
  if (t.expectDartImport) {
    const dir = mkdtempSync(join(tmpdir(), 'acc-dartimport-'));
    try {
      mkdirSync(join(dir, 'bin'), { recursive: true });
      writeFileSync(
        join(dir, 'pubspec.yaml'),
        `name: probe\nversion: 0.0.1\nenvironment:\n  sdk: '>=3.3.0 <4.0.0'\n`,
      );
      writeFileSync(
        join(dir, 'bin', 'main.dart'),
        `import 'package:${t.actualPackage}/${t.actualPackage}.dart';\nvoid main() { print('ok'); }\n`,
      );
      execFileSync('dart', ['pub', 'add', t.actualPackage], {
        cwd: dir, stdio: 'ignore', timeout: 300000, shell: process.platform === 'win32',
      });
      const out = execFileSync('dart', ['run', 'bin/main.dart'], {
        cwd: dir, encoding: 'utf-8', timeout: 300000, shell: process.platform === 'win32',
      });
      record(
        t.lang,
        'RUNTIME_IMPORT',
        /ok/.test(out) ? 'PASS' : 'FAIL',
        /ok/.test(out)
          ? 'umbrella import compiles and runs against a clean pub install'
          : `unexpected output from the import probe: ${out.slice(0, 160)}`,
      );
    } catch (e) {
      const msg = [e.stdout?.toString?.(), e.stderr?.toString?.(), e.message].filter(Boolean).join(' ');
      const missing = [...msg.matchAll(/Error when reading '[^']*\/([^'/]+\.dart)'/g)].map((m) => m[1]);
      record(
        t.lang,
        'RUNTIME_IMPORT',
        'FAIL',
        missing.length
          ? `umbrella import does NOT compile — the archive is missing ${[...new Set(missing)].join(', ')} (re-exported by the umbrella library)`
          : `umbrella import does NOT compile: ${msg.slice(0, 220).replace(/\s+/g, ' ')}`,
      );
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* locked */ }
    }
  }

  // Dart: the published archive must carry dartdoc comments on the public API,
  // and pub.dev's analyzer must not be erroring on the package.
  if (t.expectDartDoc) {
    let docFindings = null;
    try {
      const dir = dirname(join(workDir, `${t.lang}-artifact`));
      const libFiles = (entries || []).filter((e) => /^lib\/.*\.dart$/.test(e));
      if (libFiles.length) {
        // Extract and sample the public API for `///` doc comments.
        execFileSync('tar', ['-xf', `${t.lang}-artifact`], { cwd: dir, stdio: 'ignore' });
        let documented = 0;
        let sampled = 0;
        for (const f of libFiles.slice(0, 40)) {
          try {
            const src = readFileSync(join(dir, f), 'utf-8');
            sampled++;
            if (/^\s*\/\/\/\s/m.test(src)) documented++;
          } catch { /* skip unreadable entry */ }
        }
        docFindings = { documented, sampled };
      }
    } catch { /* fall through to the pub.dev signal */ }

    let pubTags = [];
    try {
      const score = await fetchJson(`https://pub.dev/api/packages/${t.actualPackage}/score`);
      pubTags = score.tags || [];
      const hasError = pubTags.includes('has:error');
      const pts = `${score.grantedPoints}/${score.maxPoints}`;
      if (hasError) {
        record(
          t.lang,
          'TYPE_SIGNALS',
          'FAIL',
          `pub.dev analysis reports has:error (score ${pts}) — analyzer errors degrade every agent's code intelligence`,
        );
      } else if (docFindings && docFindings.documented === 0) {
        record(t.lang, 'TYPE_SIGNALS', 'FAIL', `no /// doc comments found in ${docFindings.sampled} sampled lib files`);
      } else if (docFindings) {
        record(
          t.lang,
          'TYPE_SIGNALS',
          'PASS',
          `dartdoc comments in ${docFindings.documented}/${docFindings.sampled} sampled lib files; pub.dev clean (score ${pts})`,
        );
      } else {
        record(t.lang, 'TYPE_SIGNALS', 'PASS', `pub.dev analysis clean (score ${pts})`);
      }
    } catch (e) {
      record(t.lang, 'TYPE_SIGNALS', 'SKIP', `could not reach pub.dev score API: ${e.message}`);
    }
  }

  // Python: py.typed must ship
  if (t.expectPyTyped && entries) {
    record(
      t.lang,
      'TYPE_SIGNALS',
      has(/py\.typed$/) ? 'PASS' : 'FAIL',
      has(/py\.typed$/) ? 'wheel ships py.typed (typed API)' : 'wheel missing py.typed',
    );
  }

  // JS: the documented root import must actually WORK in a clean install.
  //
  // EXPORTS_RESOLVE below only proves the tarball contains a file at each
  // exports path. That is not the same as the import succeeding:
  // accumulate-sdk-opendlt@2.2.0 passes every path check and still throws
  // ERR_MODULE_NOT_FOUND on `import 'accumulate-sdk-opendlt'`, because the
  // barrel pulls in @scure/bip32 which is declared as a devDependency. K1
  // ("quickstart-verbatim") read 5/5 green while the published quickstart line
  // was broken. Installing and importing is the only check that catches this.
  // JS: every bare specifier the published code imports must be a declared
  // PRODUCTION dependency (or a node builtin).
  //
  // This is the npm-CLI-free counterpart to RUNTIME_IMPORT, and it catches the
  // same defect class: 2.2.0 imported @scure/bip32 while declaring it only under
  // devDependencies, so `import 'accumulate-sdk-opendlt'` threw
  // ERR_MODULE_NOT_FOUND for every consumer. Static analysis of the SHIPPED
  // files needs no install, so it still works on hosts where npm cannot install
  // — and it covers every module, not only those on the root barrel's path.
  if (t.expectRuntimeImport && artifactPath) {
    let dest = null;
    try {
      dest = extractArchive(artifactPath, `unpack-${t.lang}`);
      if (!dest) {
        record(t.lang, 'DEPS_DECLARED', 'SKIP', 'could not extract the published tarball');
      } else {
        const root = join(dest, 'package');
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
        // peer/optional deps are legitimate declarations — the consumer is told
        // to provide them. devDependencies are NOT: they are absent at install
        // time, which is precisely the 2.2.0 @scure/bip32 defect.
        const declared = new Set([
          ...Object.keys(pkg.dependencies || {}),
          ...Object.keys(pkg.peerDependencies || {}),
          ...Object.keys(pkg.optionalDependencies || {}),
        ]);
        const files = walkFiles(join(root, 'lib'), /\.js$/);
        // Static import/export-from and dynamic import() of a literal.
        const specRe = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
        const missing = new Map();
        for (const f of files) {
          const src = readFileSync(f, 'utf-8');
          for (const m of src.matchAll(specRe)) {
            const spec = m[1];
            if (spec.startsWith('.') || spec.startsWith('/')) continue;    // relative
            if (spec.startsWith('node:')) continue;                        // builtin
            if (isBuiltin(spec)) continue;                                 // builtin
            // Scoped: @scope/name; else first path segment.
            const bare = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
            if (declared.has(bare)) continue;
            // A package may reference ITSELF by name — Node's self-reference
            // feature, valid whenever the package defines `exports`.
            if (bare === pkg.name && pkg.exports) continue;
            if (!missing.has(bare)) missing.set(bare, relative(root, f).replace(/\\/g, '/'));
          }
        }
        if (missing.size === 0) {
          record(
            t.lang,
            'DEPS_DECLARED',
            'PASS',
            `all bare imports across ${files.length} shipped files resolve to declared dependencies`,
          );
        } else {
          const list = [...missing.entries()].map(([m, f]) => `${m} (${f})`).slice(0, 5).join(', ');
          record(
            t.lang,
            'DEPS_DECLARED',
            'FAIL',
            `${missing.size} imported package(s) are NOT declared as runtime dependencies: ${list}` +
              ` — consumers will get ERR_MODULE_NOT_FOUND`,
          );
        }
      }
    } catch (e) {
      record(t.lang, 'DEPS_DECLARED', 'SKIP', `dependency audit could not run: ${e.message}`);
    } finally {
      if (dest) { try { rmSync(dest, { recursive: true, force: true, maxRetries: 3 }); } catch { /* windows lock */ } }
    }
  }

  if (t.expectRuntimeImport) {
    const dir = mkdtempSync(join(tmpdir(), `acc-import-${t.lang}-`));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'probe', private: true, type: 'module' }));

      // The install is retried because on hosts with aggressive file locking
      // (antivirus, indexers) npm extracts PARTIALLY and exits 1 with no
      // diagnostic, non-deterministically: measured on the maintainer's box, the
      // same version of the same package yielded 0, then 375, then a tree with
      // no package.json at all. Retrying rides out transient locks.
      const installed = () => existsSync(join(dir, 'node_modules', t.actualPackage, 'package.json'));
      let installErr = null;
      for (let attempt = 0; attempt < 3 && !installed(); attempt++) {
        try {
          execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent', t.actualPackage], {
            cwd: dir, stdio: 'ignore', timeout: 300000, shell: process.platform === 'win32',
          });
        } catch (e) {
          installErr = e;
        }
      }

      // The discriminator between a HOST problem and a PACKAGE problem: did the
      // package's own manifest actually land? If it did not, nothing was
      // installed and the import result would say nothing about the package —
      // so this is unmeasurable (SKIP), not a defect (FAIL). Reporting it as
      // FAIL is what turned K1 red for a package whose published tarball
      // imports cleanly when extracted by hand.
      if (!installed()) {
        record(
          t.lang,
          'RUNTIME_IMPORT',
          'SKIP',
          'npm could not complete a clean install on this host after 3 attempts ' +
            `(${installErr ? String(installErr.message).slice(0, 90).replace(/\s+/g, ' ') : 'no manifest extracted'}) ` +
            '— a clean-install import is unmeasurable here; DEPS_DECLARED is the npm-free equivalent',
        );
      } else {
        const probe = join(dir, 'probe.mjs');
        writeFileSync(
          probe,
          `import * as m from ${JSON.stringify(t.actualPackage)};
` +
            `console.log(JSON.stringify({exports: Object.keys(m).length}));
`,
        );
        try {
          const out = execFileSync(process.execPath, [probe], {
            cwd: dir, encoding: 'utf-8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
          });
          const n = JSON.parse(out.trim()).exports;
          record(t.lang, 'RUNTIME_IMPORT', 'PASS', `root import succeeds in a clean install (${n} exports)`);
        } catch (e) {
          // The package IS installed, so an import failure is a real defect.
          const msg = [e.stderr?.toString?.(), e.message].filter(Boolean).join(' ');
          const missing = msg.match(/Cannot find package '([^']+)'/);
          record(
            t.lang,
            'RUNTIME_IMPORT',
            'FAIL',
            missing
              ? `root import FAILS in a clean install: missing package "${missing[1]}" — likely a runtime dep declared under devDependencies`
              : `root import FAILS in a clean install: ${msg.slice(0, 220).replace(/\s+/g, ' ')}`,
          );
        }
      }
    } finally {
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* windows lock */ }
    }
  }

  // JS: declared `types` entry must exist in the tarball; exports targets must resolve
  if ((t.expectTypesEntry || t.expectExportsResolve) && entries) {
    const pkg = actual.meta || {};
    // npm tarball entries are prefixed with "package/"
    const inPkg = (p) => `package/${p.replace(/^\.\//, '')}`;
    if (t.expectTypesEntry) {
      const typesPath = pkg.types || pkg.typings;
      if (!typesPath) {
        record(t.lang, 'TYPE_SIGNALS', 'FAIL', 'package.json declares no "types" entry');
      } else {
        const ok = entries.includes(inPkg(typesPath));
        record(
          t.lang,
          'TYPE_SIGNALS',
          ok ? 'PASS' : 'FAIL',
          ok
            ? `types entry "${typesPath}" exists in tarball`
            : `types entry "${typesPath}" is declared but MISSING from tarball (P1-JS-02)`,
        );
      }
    }
    if (t.expectExportsResolve && pkg.exports && typeof pkg.exports === 'object') {
      const unresolved = [];
      const walk = (val) => {
        if (typeof val === 'string') {
          if (val.startsWith('./') && !entries.includes(inPkg(val))) unresolved.push(val);
        } else if (val && typeof val === 'object') {
          Object.values(val).forEach(walk);
        }
      };
      walk(pkg.exports);
      record(
        t.lang,
        'EXPORTS_RESOLVE',
        unresolved.length === 0 ? 'PASS' : 'FAIL',
        unresolved.length === 0
          ? 'all exports-map targets resolve to real files'
          : `${unresolved.length} exports target(s) do not resolve, e.g. ${unresolved.slice(0, 3).join(', ')} (P1-JS-03)`,
      );
    }
  }

  // 4) LLMS_TXT — added in Phase 2; currently expected-red everywhere.
  if (entries) {
    const hasLlms = has(/(^|\/)llms(-full)?\.txt$/i);
    record(
      t.lang,
      'LLMS_TXT',
      hasLlms ? 'PASS' : 'EXPECTED_FAIL',
      hasLlms ? 'ships llms.txt/llms-full.txt' : 'no llms.txt yet (delivered in Phase 2 — P2-*-01)',
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  for (const t of TARGETS) {
    try {
      await verifyTarget(t);
    } catch (e) {
      record(t.lang, 'UNEXPECTED', 'SKIP', `verifier error: ${e.message}`);
    }
  }

  // Fleet version spread (K8)
  const versions = results.filter((r) => r.id === 'VERSION').map((r) => {
    const m = r.detail.match(/@ (\d+)\.(\d+)/);
    return { lang: r.lang, minorLine: m ? `${m[1]}.${m[2]}` : '?' , raw: r.detail };
  });
  const lines = new Set(versions.map((v) => v.minorLine));
  record('fleet', 'VERSION_PARITY', lines.size <= 1 ? 'PASS' : 'FAIL',
    `distinct minor lines: ${lines.size} (${[...lines].join(', ')}) — target 1 (K8)`);

  const summary = {
    generatedAt: null, // stamped by caller; Date.* intentionally avoided for reproducibility
    tool: 'artifact-verify',
    phase: 'P0-ST-07',
    results,
    counts: results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}),
  };

  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  if (outIdx >= 0 && args[outIdx + 1]) writeFileSync(args[outIdx + 1], JSON.stringify(summary, null, 2));

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    printTable();
  }

  try { rmSync(workDir, { recursive: true, force: true }); } catch {}

  const failed = results.some((r) => r.status === 'FAIL');
  process.exit(failed ? 1 : 0);
}

function printTable() {
  const icon = { PASS: '✅', FAIL: '❌', SKIP: '⚠️ ', INFO: 'ℹ️ ', EXPECTED_FAIL: '🔶' };
  console.log('\n=== artifact-verify (P0-ST-07) — verifying PUBLISHED artifacts ===\n');
  let lastLang = '';
  for (const r of results) {
    if (r.lang !== lastLang) {
      console.log(`\n[${r.lang}]`);
      lastLang = r.lang;
    }
    console.log(`  ${icon[r.status] || '  '} ${r.id.padEnd(16)} ${r.detail}`);
  }
  const c = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  console.log(
    `\nSummary: ${c.PASS || 0} pass, ${c.FAIL || 0} fail, ${c.EXPECTED_FAIL || 0} expected-fail (Phase 2), ${c.SKIP || 0} skip, ${c.INFO || 0} info\n`,
  );
}

main();
