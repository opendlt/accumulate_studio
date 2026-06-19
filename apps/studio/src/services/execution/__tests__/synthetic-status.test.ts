import { describe, it, expect } from 'vitest';
import { parseSyntheticStatus } from '../index';

describe('parseSyntheticStatus', () => {
  it('parses V3 string statuses', () => {
    expect(parseSyntheticStatus('delivered')).toBe('delivered');
    expect(parseSyntheticStatus('confirmed')).toBe('delivered');
    expect(parseSyntheticStatus('pending')).toBe('pending');
    expect(parseSyntheticStatus('failed')).toBe('failed');
    expect(parseSyntheticStatus('error')).toBe('failed');
  });

  it('parses V2 object statuses', () => {
    expect(parseSyntheticStatus({ delivered: true })).toBe('delivered');
    expect(parseSyntheticStatus({ code: 'delivered' })).toBe('delivered');
    expect(parseSyntheticStatus({ code: 'ok' })).toBe('delivered');
    expect(parseSyntheticStatus({ failed: true })).toBe('failed');
    expect(parseSyntheticStatus({ pending: true })).toBe('pending');
  });

  it('degrades unknown/garbage to "unknown" (never fabricates delivered)', () => {
    expect(parseSyntheticStatus('')).toBe('unknown');
    expect(parseSyntheticStatus('whatever')).toBe('unknown');
    expect(parseSyntheticStatus({})).toBe('unknown');
    expect(parseSyntheticStatus(null)).toBe('unknown');
    expect(parseSyntheticStatus(undefined)).toBe('unknown');
    expect(parseSyntheticStatus(42)).toBe('unknown');
  });
});
