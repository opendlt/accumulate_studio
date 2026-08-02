/**
 * Parser tests for agent-lsp diagnostics.
 *
 * These pin the CRLF behaviour above all else. In JavaScript regex `.` excludes
 * line terminators and CR is one, so a `(.+)$` pattern silently matches nothing
 * on Windows output — the tool reported "clean" for code that did not compile.
 * A checker that cannot fail is worse than no checker.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCompilerText, parseCargo, parseDart, splitLines } from '../parsers.mjs';

test('splitLines handles LF and CRLF alike', () => {
  assert.deepEqual(splitLines('a\r\nb\nc'), ['a', 'b', 'c']);
});

test('tsc diagnostics parse with CRLF endings', () => {
  const out = "b.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.\r\n";
  const d = parseCompilerText(out, '');
  assert.equal(d.length, 1);
  assert.equal(d[0].severity, 'error');
  assert.equal(d[0].code, 'TS2322');
  assert.equal(d[0].line, 1);
  assert.equal(d[0].column, 7);
});

test('dotnet diagnostics parse', () => {
  const out = "Program.cs(1,40): error CS0029: Cannot implicitly convert type 'string' to 'int'\r\n";
  const d = parseCompilerText(out, '');
  assert.equal(d.length, 1);
  assert.equal(d[0].code, 'CS0029');
});

test('cargo json diagnostics parse and ignore non-json lines', () => {
  const msg = JSON.stringify({
    message: {
      level: 'error', message: 'mismatched types', code: { code: 'E0308' },
      spans: [{ is_primary: true, file_name: 'src/x.rs', line_start: 4, column_start: 9 }],
    },
  });
  const d = parseCargo(`   Compiling foo\r\n${msg}\r\n`);
  assert.equal(d.length, 1);
  assert.equal(d[0].code, 'E0308');
  assert.equal(d[0].file, 'src/x.rs');
  assert.equal(d[0].line, 4);
});

test('dart machine format parses', () => {
  const out = 'ERROR|COMPILE_TIME_ERROR|INVALID_ASSIGNMENT|/p/b.dart|2|11|10|msg here\r\n';
  const d = parseDart(out);
  assert.equal(d.length, 1);
  assert.equal(d[0].severity, 'error');
  assert.equal(d[0].code, 'INVALID_ASSIGNMENT');
  assert.equal(d[0].line, 2);
});

test('warnings are not counted as errors', () => {
  const out = "a.ts(3,1): warning TS6133: 'x' is declared but never used.\r\n";
  const d = parseCompilerText(out, '');
  assert.equal(d[0].severity, 'warning');
});
