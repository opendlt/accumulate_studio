/**
 * LSP client framing and normalisation.
 *
 * These cover the parts that fail silently: a mis-parsed frame loses a response
 * (the client hangs), and a mis-normalised location sends an agent to the wrong
 * line. Both are worse than an error, because they look like an answer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLspPosition, normaliseLocations } from '../lsp-client.mjs';

test('positions convert from 1-based to LSP 0-based', () => {
  assert.deepEqual(toLspPosition(1, 1), { line: 0, character: 0 });
  assert.deepEqual(toLspPosition(12, 13), { line: 11, character: 12 });
});

test('a single Location normalises to one result', () => {
  const out = normaliseLocations({
    uri: 'file:///c:/p/main.rs',
    range: { start: { line: 0, character: 7 }, end: { line: 0, character: 13 } },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].line, 1);
  assert.equal(out[0].column, 8);
});

test('an array of Locations normalises to many', () => {
  const out = normaliseLocations([
    { uri: 'file:///c:/p/a.rs', range: { start: { line: 4, character: 5 }, end: { line: 4, character: 9 } } },
    { uri: 'file:///c:/p/b.rs', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } } },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[1].line, 2);
});

test('LocationLink (targetUri/targetSelectionRange) is supported', () => {
  // rust-analyzer and tsserver return links rather than plain locations;
  // ignoring that shape reported "no definition" for a symbol that had one.
  const out = normaliseLocations([{
    targetUri: 'file:///c:/p/main.rs',
    targetSelectionRange: { start: { line: 0, character: 7 }, end: { line: 0, character: 13 } },
  }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].line, 1);
  assert.equal(out[0].column, 8);
});

test('null and malformed results yield no locations, never a crash', () => {
  assert.deepEqual(normaliseLocations(null), []);
  assert.deepEqual(normaliseLocations([]), []);
  assert.deepEqual(normaliseLocations([{ nonsense: true }]), []);
  assert.deepEqual(normaliseLocations(['not an object']), []);
});
