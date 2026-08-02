/**
 * Output parsers for agent-lsp diagnostics, split out so they can be tested
 * without invoking a toolchain.
 */

/**
 * Split tool output on either line ending.
 *
 * A trailing CR is not cosmetic: in JavaScript regex `.` excludes line
 * terminators and CR is one, so `(.+)$` never matches a CRLF line. Every
 * diagnostic on Windows was silently dropped and the tool reported "clean" for
 * code that did not compile -- the worst possible failure for a checker.
 */
/** Normalise a toolchain's severity word. */
export const sev = (s) => (/^(error|severe)/i.test(s) ? 'error' : /^warn/i.test(s) ? 'warning' : 'info');

export function splitLines(text) {
  return String(text).split(/\r?\n/);
}

export function parseCargo(stdout) {
  const out = [];
  for (const line of splitLines(stdout)) {
    if (!line.trim().startsWith('{')) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    const d = m?.message;
    if (!d?.level || !d.spans?.length) continue;
    const span = d.spans.find((s) => s.is_primary) ?? d.spans[0];
    out.push({
      file: span.file_name, line: span.line_start, column: span.column_start,
      severity: sev(d.level), code: d.code?.code ?? null, message: d.message,
    });
  }
  return out;
}

/** `dart analyze --format=machine` is pipe-delimited and stable. */
export function parseDart(stdout) {
  const out = [];
  for (const line of splitLines(stdout)) {
    const p = line.split('|');
    if (p.length < 8) continue;
    out.push({
      file: p[3], line: Number(p[4]), column: Number(p[5]),
      severity: sev(p[0]), code: p[2] || null, message: p[7].trim(),
    });
  }
  return out;
}

/** tsc and dotnet both emit `path(line,col): severity CODE: message`. */
export function parseCompilerText(stdout, stderr) {
  const out = [];
  const re = /^(.+?)[(:](\d+)[,:](\d+)\)?:\s*(error|warning)\s+([A-Za-z0-9_]+)\s*:\s*(.+)$/;
  for (const line of splitLines(`${stdout}\n${stderr}`)) {
    const m = line.match(re);
    if (!m) continue;
    out.push({
      file: m[1].trim(), line: Number(m[2]), column: Number(m[3]),
      severity: sev(m[4]), code: m[5], message: m[6].trim(),
    });
  }
  return out;
}

/** Python has no compiler; syntax errors are what a checker can state definitively. */
export function parsePyCompile(stderr) {
  const out = [];
  const re = /File "(.+?)", line (\d+)/;
  const lines = splitLines(stderr);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const msg = lines.slice(i + 1).find((l) => /Error/.test(l)) ?? lines[i + 1] ?? '';
    out.push({
      file: m[1], line: Number(m[2]), column: 1, severity: 'error',
      code: (msg.match(/^(\w*Error)/) || [])[1] ?? null, message: msg.trim(),
    });
  }
  return out;
}

