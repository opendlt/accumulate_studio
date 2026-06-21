/**
 * P2-2 — amount/precision unit tests. Pins the numbers at the engine boundary so a
 * 1e8× or ×100 regression is caught immediately.
 */
import { describe, it, expect } from 'vitest';
import { parseAcmeAmount, parseCreditAmount, ACME_PRECISION } from './node-executor';

describe('parseAcmeAmount (ACME, ×1e8)', () => {
  it('5 → 500000000', () => expect(parseAcmeAmount('5')).toBe(500_000_000));
  it('1.5 → 150000000', () => expect(parseAcmeAmount('1.5')).toBe(150_000_000));
  it('strips commas: "1,000" → 100000000000', () => expect(parseAcmeAmount('1,000')).toBe(100_000_000_000));
  it('number passthrough: 42 → 42 (already base units)', () => expect(parseAcmeAmount(42)).toBe(42));
  it('throws on garbage', () => expect(() => parseAcmeAmount('abc')).toThrow());
  it('uses ACME_PRECISION = 1e8', () => expect(ACME_PRECISION).toBe(100_000_000));
});

describe('parseCreditAmount (whole credits, NO ×1e8)', () => {
  it('300 → 300', () => expect(parseCreditAmount('300')).toBe(300));
  it('truncates decimals: 3.9 → 3', () => expect(parseCreditAmount('3.9')).toBe(3));
  it('strips commas: "1,000" → 1000', () => expect(parseCreditAmount('1,000')).toBe(1000));
  it('number truncates: 7.8 → 7', () => expect(parseCreditAmount(7.8)).toBe(7));
  it('throws on garbage', () => expect(() => parseCreditAmount('xyz')).toThrow());
  // Critically: a credit amount must never be ×1e8.
  it('300 credits is NOT 3e10', () => expect(parseCreditAmount('300')).not.toBe(30_000_000_000));
});
