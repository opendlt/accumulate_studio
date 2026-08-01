/**
 * workspace.mjs — build a scratch project with the SDK installed FROM THE REGISTRY.
 *
 * This is the load-bearing constraint of the whole harness (RB-01 step 3 / risk
 * "measuring the wrong thing"): if the agent can see the SDK source tree, we are
 * measuring "can an agent read this repo", not "can an agent use this package".
 * Every workspace is created outside the monorepo and installs only published
 * artifacts.
 *
 * Each language's install is the *documented* quickstart command from
 * scripts/generate-agent-artifacts.mjs LANG_META — so a broken install here is
 * a real K1 defect, not a harness bug.
 */

import { execFile, execSync } from 'node:child_process';
import {
  mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Registry package names — must match LANG_META in generate-agent-artifacts.mjs. */
export const PACKAGES = {
  python: 'accumulate-sdk-opendlt',
  rust: 'accumulate-sdk',
  dart: 'opendlt_accumulate',
  csharp: 'Acme.Net.Sdk',
  javascript: 'accumulate-sdk-opendlt',
};

export class InstallFailure extends Error {
  constructor(lang, message) {
    super(`[${lang}] install failed: ${message}`);
    this.name = 'InstallFailure';
    this.lang = lang;
  }
}

/**
 * Run a toolchain command WITHOUT blocking the event loop.
 *
 * These commands (`dotnet restore`, `cargo fetch`, `npm install`) take minutes.
 * The synchronous form starved every other worker's in-flight HTTP request:
 * with concurrency > 1, one workspace install froze the loop long enough that
 * concurrent chain queries hit their AbortController and failed as
 * `network-flake` — against an endpoint answering in ~180ms. Verified directly:
 * a 25s execFileSync aborts a concurrent fetch with TimeoutError.
 */
function run(cmd, args, cwd, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        cwd,
        encoding: 'utf-8',
        timeout: timeoutMs,
        shell: process.platform === 'win32',
        maxBuffer: 16 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/**
 * Create and populate a workspace. Returns { dir, lang, sdkVersion, installLog }.
 * Throws InstallFailure so the runner can classify it `install-fail`.
 */
export async function createWorkspace(lang, { keep = false, mode = 'sdk' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `acc-harness-${lang}-`));
  const log = [];
  let sdkVersion = null;

  try {
    switch (lang) {
      case 'python': {
        log.push(await run('python', ['-m', 'venv', '.venv'], dir));
        const pip = process.platform === 'win32' ? '.venv\\Scripts\\pip' : '.venv/bin/pip';
        log.push(await run(pip, ['install', '--disable-pip-version-check', PACKAGES.python], dir));
        const show = await run(pip, ['show', PACKAGES.python], dir);
        sdkVersion = (show.match(/^Version:\s*(.+)$/m) || [])[1]?.trim() ?? null;
        break;
      }

      case 'javascript': {
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'harness', private: true, type: 'module' }, null, 2));
        const pkgPath = join(dir, 'node_modules', PACKAGES.javascript, 'package.json');
        // npm is the documented quickstart path and is tried first. It can fail
        // for reasons that have nothing to do with the package: this Windows host
        // exits `npm install` with code 1 and an empty error log, which scored the
        // JavaScript SDK 0/8 `install-fail` while the same published tarball
        // installed and imported cleanly under yarn. Falling back keeps the KPI
        // measuring the package rather than the runner's toolchain — and the
        // installer that succeeded is recorded, so a package that npm genuinely
        // cannot install is still visible rather than silently rescued.
        let installer = 'npm';
        try {
          log.push(await run('npm', ['install', '--no-audit', '--no-fund', PACKAGES.javascript], dir));
        } catch (npmErr) {
          log.push(`[javascript] npm install failed, retrying with yarn: ${npmErr.message}`);
          try {
            log.push(await run('yarn', ['add', '--no-lockfile', PACKAGES.javascript], dir));
            installer = 'yarn';
          } catch {
            throw npmErr; // report the npm failure — yarn is the fallback, not the contract
          }
        }
        if (!existsSync(pkgPath)) {
          throw new Error(`[javascript] ${installer} reported success but ${PACKAGES.javascript} is not present`);
        }
        sdkVersion = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
        log.push(`[javascript] installed with ${installer}`);
        break;
      }

      case 'rust': {
        log.push(await run('cargo', ['init', '--name', 'harness', '--bin'], dir));
        log.push(await run('cargo', ['add', PACKAGES.rust], dir));
        log.push(await run('cargo', ['add', 'tokio', '--features', 'full'], dir));
        const lock = join(dir, 'Cargo.lock');
        if (existsSync(lock)) {
          const m = readFileSync(lock, 'utf-8').match(
            new RegExp(`name = "${PACKAGES.rust}"\\s*\\nversion = "([^"]+)"`),
          );
          sdkVersion = m ? m[1] : null;
        }
        break;
      }

      case 'dart': {
        mkdirSync(join(dir, 'bin'), { recursive: true });
        writeFileSync(
          join(dir, 'pubspec.yaml'),
          `name: harness\nversion: 0.0.1\nenvironment:\n  sdk: '>=3.3.0 <4.0.0'\n`,
        );
        writeFileSync(join(dir, 'bin', 'main.dart'), 'void main() {}\n');
        log.push(await run('dart', ['pub', 'add', PACKAGES.dart], dir));
        const lock = join(dir, 'pubspec.lock');
        if (existsSync(lock)) {
          const m = readFileSync(lock, 'utf-8').match(
            new RegExp(`${PACKAGES.dart}:[\\s\\S]{0,400}?version: "([^"]+)"`),
          );
          sdkVersion = m ? m[1] : null;
        }
        break;
      }

      case 'csharp': {
        log.push(await run('dotnet', ['new', 'console', '-o', '.', '--force'], dir));
        log.push(await run('dotnet', ['add', 'package', PACKAGES.csharp], dir));
        // `dotnet new console -o .` names the project after the temp directory,
        // so discover the .csproj rather than assuming a name.
        const csproj = readdirSync(dir).find((f) => f.endsWith('.csproj'));
        if (csproj) {
          const m = readFileSync(join(dir, csproj), 'utf-8').match(
            new RegExp(`Include="${PACKAGES.csharp}"\\s+Version="([^"]+)"`),
          );
          sdkVersion = m ? m[1] : null;
        }
        break;
      }

      default:
        throw new Error(`unknown language ${lang}`);
    }
  } catch (e) {
    const detail = [e.message, e.stdout?.toString?.(), e.stderr?.toString?.()]
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!keep) safeRemove(dir);
    throw new InstallFailure(lang, (detail || '(no output captured)').slice(0, 4000));
  }

  // RB-04 `cli` mode: the agent drives the published `accumulate` CLI instead of
  // writing a program, so the workspace needs the EXECUTABLE, not just the
  // library. Installing a package is not the same as installing its binary in
  // any of these ecosystems.
  let cliCmd = null;
  if (mode === 'cli') {
    try {
      cliCmd = await installCli(lang, dir, log);
    } catch (e) {
      const detail = [e.message, e.stdout?.toString?.(), e.stderr?.toString?.()]
        .filter(Boolean).join(String.fromCharCode(10)).trim();
      if (!keep) safeRemove(dir);
      throw new InstallFailure(lang, `CLI install failed: ${(detail || '(no output)').slice(0, 4000)}`);
    }
  }

  return { dir, lang, sdkVersion, cliCmd, installLog: log.join(String.fromCharCode(10)).slice(0, 20000) };
}


/**
 * Install the SDK's CLI executable into `dir` and return the command that runs it.
 *
 * Each ecosystem separates "add the library" from "install its binary", so this
 * cannot reuse the sdk-mode install:
 *   python  pip puts a console script in the venv's Scripts/bin
 *   js      the package `bin` is linked into node_modules/.bin, but bin-linking
 *           is unreliable on some hosts, so invoke the entry file directly
 *   dart    `pub add` does NOT expose executables; `pub global activate` does
 *   csharp  `dotnet add package` does NOT install a tool; `dotnet tool install` does
 *   rust    `cargo add` does NOT build a binary; `cargo install` does (and compiles)
 */
async function installCli(lang, dir, log) {
  switch (lang) {
    case 'python': {
      const exe = process.platform === 'win32'
        ? join(dir, '.venv', 'Scripts', 'accumulate.exe')
        : join(dir, '.venv', 'bin', 'accumulate');
      if (!existsSync(exe)) throw new Error(`pip did not install a console script at ${exe}`);
      return exe;
    }
    case 'javascript': {
      const entry = join(dir, 'node_modules', PACKAGES.javascript, 'lib', 'src', 'cli.js');
      if (!existsSync(entry)) throw new Error(`published package has no CLI entry at ${entry}`);
      return `node "${entry}"`;
    }
    case 'dart': {
      log.push(await run('dart', ['pub', 'global', 'activate', PACKAGES.dart], dir));
      return `dart pub global run ${PACKAGES.dart}:accumulate`;
    }
    case 'csharp': {
      // --tool-path keeps the tool inside the workspace: no global state, and
      // parallel runs of different versions cannot collide.
      log.push(await run('dotnet', ['tool', 'install', 'Acme.Net.Sdk.Cli', '--tool-path', '.'], dir));
      const exe = join(dir, process.platform === 'win32' ? 'accumulate.exe' : 'accumulate');
      if (!existsSync(exe)) throw new Error(`dotnet tool install produced no executable at ${exe}`);
      return exe;
    }
    case 'rust': {
      // Compiles from source, so it is slow; --root keeps it workspace-local.
      log.push(await run('cargo', ['install', PACKAGES.rust, '--bin', 'accumulate', '--root', '.'], dir));
      const exe = join(dir, 'bin', process.platform === 'win32' ? 'accumulate.exe' : 'accumulate');
      if (!existsSync(exe)) throw new Error(`cargo install produced no binary at ${exe}`);
      return exe;
    }
    default:
      throw new Error(`unknown language ${lang}`);
  }
}

/**
 * createWorkspace with one retry.
 *
 * Package managers share global caches (`~/.pub-cache`, the NuGet and cargo
 * registries) that are not concurrency-safe, so parallel installs of the same
 * package can collide. Observed: `dart pub add opendlt_accumulate` failed under
 * 4-way concurrency and succeeded immediately when run alone.
 *
 * That distinction matters for scoring — `install-fail` counts toward K2, so a
 * contention blip would be charged to the SDK. A genuinely broken package (the
 * JS root-import defect, say) fails both attempts and is still reported.
 */
export async function createWorkspaceWithRetry(lang, opts = {}, attempts = 4) {
  const failures = [];
  for (let i = 0; i < attempts; i++) {
    try {
      return await createWorkspace(lang, opts);
    } catch (e) {
      if (!(e instanceof InstallFailure)) throw e;
      failures.push(e.message);
      if (i < attempts - 1) {
        // Exponential backoff with jitter. A single retry is not enough against
        // an intermittently intercepting proxy: npm was observed failing 2 of
        // every 3 installs, which would still sink most runs at 2 attempts.
        const wait = 5000 * 2 ** i + Math.floor(Math.random() * 5000);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new InstallFailure(
    lang,
    `failed ${attempts}x (transient contention and flaky-registry retries exhausted).\n` +
      failures.map((m, i) => `--- attempt ${i + 1} ---\n${m}`).join('\n'),
  );
}

export function safeRemove(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Windows file locks from a just-exited toolchain are not worth failing on.
  }
}

/**
 * Remove abandoned harness temp directories.
 *
 * Workspaces are normally cleaned in executeRun's `finally`, but a killed run —
 * or a watchdog kill with a toolchain still holding a file lock — leaves them
 * behind. Each is tens to hundreds of MB (a populated node_modules, cargo
 * target, or NuGet cache), so they accumulate fast: one session left 35 stray
 * directories totalling 1.75 GB.
 *
 * The live setup-venv cache (acc-harness-setupenv-*) is deliberately preserved.
 *
 * @returns {{removed: number, freedMb: number}}
 */
export function sweepStaleWorkspaces({ olderThanMs = 2 * 60 * 60 * 1000 } = {}) {
  const root = tmpdir();
  let removed = 0;
  let freed = 0;
  const now = Date.now();

  let entries = [];
  try {
    entries = readdirSync(root);
  } catch {
    return { removed: 0, freedMb: 0 };
  }

  for (const name of entries) {
    // Match run workspaces only; never the setup-venv cache.
    if (!/^acc-harness-(rust|python|dart|csharp|javascript)-/.test(name)) continue;
    const dir = join(root, name);
    try {
      const st = statSync(dir);
      if (now - st.mtimeMs < olderThanMs) continue;
      freed += dirSizeMb(dir);
      rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
      removed++;
    } catch {
      // In use or locked — skip it.
    }
  }
  return { removed, freedMb: Math.round(freed) };
}

function dirSizeMb(dir) {
  let bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let items = [];
    try {
      items = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const it of items) {
      const p = join(d, it.name);
      try {
        if (it.isDirectory()) stack.push(p);
        else bytes += statSync(p).size;
      } catch {
        /* vanished mid-walk */
      }
    }
  }
  return bytes / (1024 * 1024);
}

/**
 * Preflight: can this machine build workspaces for these languages at all?
 * Runs before any agent is spawned so a missing toolchain is reported as a
 * setup problem rather than burning agent budget on a doomed run.
 */
export function checkToolchains(langs) {
  const probes = {
    python: ['python', '--version'],
    javascript: ['node', '--version'],
    rust: ['cargo', '--version'],
    dart: ['dart', '--version'],
    csharp: ['dotnet', '--version'],
  };
  const missing = [];
  for (const l of langs) {
    const p = probes[l];
    if (!p) continue;
    try {
      execSync(`${p[0]} ${p[1]}`, { stdio: 'ignore', timeout: 30000 });
    } catch {
      missing.push(`${l} (needs \`${p[0]}\`)`);
    }
  }
  return missing;
}
