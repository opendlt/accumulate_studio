/**
 * claude-code.mjs — agent backend driving the Claude Code CLI headlessly.
 *
 * Contract (RB-01 "The measurement contract"):
 *   run(ctx) -> { turns, interventions, transcript, stderr, timedOut, artifacts }
 *
 * The backend NEVER decides pass/fail. It runs the agent and collects what
 * happened; the harness evaluates success_assertions against chain state
 * separately. That separation is what keeps a broken SDK from scoring itself.
 *
 * Turn accounting: this CLI version has no --max-turns, so the cap is enforced
 * by wall-clock timeout and `num_turns` is read back from the JSON result.
 */

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const name = 'claude-code';

/** The contract the agent must satisfy so the harness can verify its work. */
const ARTIFACT_CONTRACT = `
When you are finished, write a file named harness-artifacts.json in the working
directory containing ONLY the identifiers you created or used. Example shape:

{
  "liteIdentityUrl": "acc://<40hex><8hex>",
  "liteTokenAccountUrl": "acc://<40hex><8hex>/ACME",
  "adiUrl": "acc://something.acme",
  "keyBookUrl": "acc://something.acme/book",
  "keyPageUrl": "acc://something.acme/book/1",
  "recipientUrl": "acc://something.acme/tokens",
  "dataAccountUrl": "acc://something.acme/data",
  "tokenIssuerUrl": "acc://something.acme/TOKEN",
  "tokenAccountUrl": "acc://something.acme/token-account",
  "txid": "<primary transaction id>",
  "txids": ["<all transaction ids>"],
  "newKeyHash": "<hex sha256 of the new public key, if you rotated keys>",
  "oldKeyHash": "<hex sha256 of the previous public key, if you rotated keys>",
  "retrievedEntry": "<data entry content you read back, if any>"
}

Include only the keys that apply to this task. Do NOT include a success flag or
any claim about whether the task worked — correctness is verified independently
against the chain. Report identifiers only.
`.trim();

function buildPrompt(task, lang, env, inputs) {
  const spec = task.prompt_to_agent.replace(/<LANG>/g, lang);
  return [
    spec,
    '',
    '## Provided environment',
    `- Network: ${env.network} (testnet). Endpoints: V2 https://${env.network}.accumulatenetwork.io/v2, V3 https://${env.network}.accumulatenetwork.io/v3`,
    `- Funded lite token account: ${env.liteTokenAccount} (balance ${env.balanceAcme} ACME)`,
    `- Lite identity: ${env.liteIdentity}`,
    `- Ed25519 private key (hex, 32-byte seed): ${env.privateKeyHex}`,
    `- Ed25519 public key (hex): ${env.publicKeyHex}`,
    Object.keys(inputs).length
      ? `- Task inputs: ${JSON.stringify(inputs)}`
      : '- Task inputs: (none)',
    '',
    '## Rules',
    `- The SDK is ALREADY INSTALLED in this directory. Use it. Do not clone or vendor any source.`,
    `- Target ${env.network} only. Never mainnet.`,
    `- Run your program and confirm it succeeds before finishing.`,
    '',
    '## Required output',
    ARTIFACT_CONTRACT,
  ].join('\n');
}

/**
 * @param {object} ctx { task, lang, env, inputs, workspace, timeoutMs, model }
 */
export async function run(ctx) {
  const { task, lang, env, inputs, workspace, timeoutMs = 900000, model } = ctx;
  const prompt = buildPrompt(task, lang, env, inputs);

  // The prompt goes over STDIN, never argv. A multi-thousand-character
  // multi-line prompt passed as an argument gets mangled by the Windows shell
  // (observed: the agent received only the first word). stdin sidesteps all
  // shell quoting and platform argv limits.
  const args = ['-p', '--output-format', 'json', '--dangerously-skip-permissions'];
  if (model) args.push('--model', model);

  const started = Date.now();
  const { stdout, stderr, timedOut } = await new Promise((resolve) => {
    let settled = false;
    let watchdog = null;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      resolve(payload);
    };

    const child = execFile(
      'claude',
      args,
      {
        cwd: workspace.dir,
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          // Belt and braces: even if an SDK reads ambient config, keep it off mainnet.
          ACCUMULATE_NETWORK: env.network,
        },
      },
      (err, out, errOut) => {
        finish({
          stdout: out ?? '',
          stderr: errOut ?? '',
          timedOut: Boolean(err && (err.killed || err.signal === 'SIGTERM')),
        });
      },
    );

    // Independent watchdog. execFile's own `timeout` is NOT sufficient here:
    // with shell:true on Windows the direct child is cmd.exe, and Node kills
    // only that process. A surviving grandchild keeps the stdio pipes open, so
    // the 'close' event — which the callback waits for — never fires and the
    // run hangs forever. Observed live: a csharp run sat for 4 hours under a
    // 40-minute cap, with `claude` long dead and an orphaned cmd.exe holding
    // the pipe. So: kill the whole tree, then resolve regardless.
    // Grace period beyond execFile's own timeout so the normal path wins when
    // it works; the watchdog is the backstop, not the primary mechanism.
    watchdog = setTimeout(() => {
      killTree(child.pid);
      finish({
        stdout: '',
        stderr: `watchdog: no completion within ${Math.round((timeoutMs + 30000) / 1000)}s; process tree killed`,
        timedOut: true,
      });
    }, timeoutMs + 30000);

    child.on('error', () => finish({ stdout: '', stderr: 'failed to spawn `claude`', timedOut: false }));
    child.stdin?.on('error', () => {});
    child.stdin?.end(prompt);
  });

  let turns = null;
  let resultText = '';
  let costUsd = null;
  try {
    const parsed = JSON.parse(stdout);
    turns = typeof parsed.num_turns === 'number' ? parsed.num_turns : null;
    resultText = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed);
    costUsd = parsed.total_cost_usd ?? null;
  } catch {
    // Non-JSON stdout means the CLI failed before producing a result envelope;
    // keep the raw text so the classifier can still see the error.
    resultText = stdout;
  }

  const artifacts = readArtifacts(workspace.dir);

  // The prompt necessarily hands the agent a private key; the archived
  // transcript must not. Redact before anything reaches disk. These are
  // throwaway testnet keys, but a key in a committed file is a key in a
  // committed file.
  const redact = (s) =>
    String(s ?? '')
      .split(env.privateKeyHex)
      .join('<REDACTED_PRIVATE_KEY>');

  return {
    turns,
    // Default policy is pure first-try: the harness injects no corrections.
    interventions: 0,
    transcript: redact([prompt, '\n===== AGENT RESULT =====\n', resultText].join('\n')),
    stderr: redact(stderr),
    timedOut,
    artifacts,
    costUsd,
    durationMs: Date.now() - started,
  };
}

/** Also redact when dumping the prompt into the workspace for inspection. */

/**
 * Kill a process and every descendant.
 *
 * Node's child.kill() terminates only the direct child. With shell:true on
 * Windows that is cmd.exe, leaving the real agent process and anything it
 * spawned (dotnet build servers, npm, cargo) alive and holding the stdio pipes.
 * `taskkill /T /F` walks the tree; `kill -TERM -pid` does the same via the
 * process group on POSIX.
 */
function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 30000 });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    // Already dead, or we lack permission — nothing further we can do.
  }
}

/** Read the agent's reported identifiers. Missing/invalid -> {} (classified `no-artifacts`). */
function readArtifacts(dir) {
  const f = join(dir, 'harness-artifacts.json');
  if (!existsSync(f)) return {};
  try {
    const parsed = JSON.parse(readFileSync(f, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Strip any self-assessment the agent may have added anyway. The harness
    // decides pass/fail; an agent-supplied verdict must never reach scoring.
    for (const k of ['passed', 'success', 'ok', 'result', 'status']) delete parsed[k];
    return parsed;
  } catch {
    return {};
  }
}

/** Preflight so a missing CLI fails before provisioning spends faucet funds. */
export function checkAvailable() {
  const problems = [];
  try {
    execFileSync('claude', ['--version'], {
      stdio: 'ignore',
      timeout: 30000,
      shell: process.platform === 'win32',
    });
  } catch {
    problems.push('`claude` CLI not found on PATH (install Claude Code)');
  }
  return problems;
}

/** Write the prompt to the workspace for post-hoc inspection. */
export function dumpPrompt(workspaceDir, task, lang, env, inputs) {
  writeFileSync(join(workspaceDir, 'harness-prompt.txt'), buildPrompt(task, lang, env, inputs));
}

export { buildPrompt };
