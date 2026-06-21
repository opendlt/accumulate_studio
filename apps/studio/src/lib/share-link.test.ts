/**
 * Share-link round-trip + safety tests (P3-3).
 */
import { describe, it, expect } from 'vitest';
import {
  encodeFlowToPayload,
  decodeFlowFromPayload,
  buildShareUrl,
  readPayloadFromLocation,
  MAX_ENCODED_LENGTH,
} from './share-link';
import { createEmptyFlow } from '@accumulate-studio/types';
import type { Flow } from '@accumulate-studio/types';

function flowWithNodes(): Flow {
  const flow = createEmptyFlow('Round Trip');
  flow.nodes = [
    { id: 'a', type: 'GenerateKeys', config: {}, position: { x: 0, y: 0 } },
    { id: 'b', type: 'Faucet', config: { account: 'acc://adi-1.acme' }, position: { x: 200, y: 0 } },
  ];
  flow.connections = [
    { id: 'e1', sourceNodeId: 'a', sourcePortId: 'output', targetNodeId: 'b', targetPortId: 'input' },
  ];
  return flow;
}

describe('share-link round trip', () => {
  it('encodes and decodes an empty flow', () => {
    const flow = createEmptyFlow('My Flow');
    const enc = encodeFlowToPayload(flow);
    expect(enc.ok).toBe(true);
    const dec = decodeFlowFromPayload(enc.payload!);
    expect(dec).not.toBeNull();
    expect(dec!.name).toBe('My Flow');
  });

  it('preserves nodes and connections through a round trip', () => {
    const flow = flowWithNodes();
    const enc = encodeFlowToPayload(flow);
    expect(enc.ok).toBe(true);
    const dec = decodeFlowFromPayload(enc.payload!);
    expect(dec).not.toBeNull();
    expect(dec!.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(dec!.connections).toHaveLength(1);
    expect(dec!.nodes[1].config).toEqual({ account: 'acc://adi-1.acme' });
  });

  it('rejects garbage payloads safely (no throw, null or empty flow)', () => {
    const dec = decodeFlowFromPayload('!!!not-valid-lz!!!');
    expect(dec === null || dec!.nodes.length === 0).toBe(true);
  });

  it('returns null for an empty/missing payload', () => {
    expect(decodeFlowFromPayload('')).toBeNull();
    expect(decodeFlowFromPayload(null)).toBeNull();
    expect(decodeFlowFromPayload(undefined)).toBeNull();
  });

  it('returns null for an over-limit payload', () => {
    const huge = 'a'.repeat(MAX_ENCODED_LENGTH + 1);
    expect(decodeFlowFromPayload(huge)).toBeNull();
  });

  it('refuses oversized encodes', () => {
    const flow = createEmptyFlow('Big');
    // High-entropy description lz-string cannot compress below the cap.
    let seed = 123456789;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let blob = '';
    for (let i = 0; i < 20000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      blob += chars[seed % chars.length];
    }
    flow.description = blob;
    const enc = encodeFlowToPayload(flow);
    expect(enc.ok).toBe(false);
    expect(enc.error).toBe('too-large');
  });
});

describe('buildShareUrl', () => {
  it('builds a hash-based URL from explicit origin/pathname', () => {
    const flow = createEmptyFlow('Link');
    const res = buildShareUrl(flow, 'https://studio.example', '/app');
    expect(res.ok).toBe(true);
    expect(res.url).toBe(`https://studio.example/app#flow=${res.payload}`);
  });

  it('surfaces too-large without a url', () => {
    const flow = createEmptyFlow('Big');
    let seed = 42;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let blob = '';
    for (let i = 0; i < 20000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      blob += chars[seed % chars.length];
    }
    flow.description = blob;
    const res = buildShareUrl(flow, 'https://x', '/');
    expect(res.ok).toBe(false);
    expect(res.url).toBeUndefined();
    expect(res.error).toBe('too-large');
  });
});

describe('readPayloadFromLocation', () => {
  it('reads the payload from the hash', () => {
    const loc = { hash: '#flow=ABC123', search: '' };
    expect(readPayloadFromLocation(loc)).toBe('ABC123');
  });

  it('falls back to the query string', () => {
    const loc = { hash: '', search: '?flow=XYZ789' };
    expect(readPayloadFromLocation(loc)).toBe('XYZ789');
  });

  it("preserves '+' in payloads (not decoded as a space)", () => {
    // lz-string's URL-safe alphabet includes '+'; URLSearchParams would corrupt it.
    const loc = { hash: '#flow=HYewJgpgtAD+ABC', search: '' };
    expect(readPayloadFromLocation(loc)).toBe('HYewJgpgtAD+ABC');
  });

  it('returns null when no payload is present', () => {
    expect(readPayloadFromLocation({ hash: '#other=1', search: '?q=2' })).toBeNull();
  });

  it('round-trips a real payload through the URL hash without corruption', () => {
    const flow = flowWithNodes();
    const enc = encodeFlowToPayload(flow);
    const loc = { hash: `#flow=${enc.payload}`, search: '' };
    expect(readPayloadFromLocation(loc)).toBe(enc.payload);
    const dec = decodeFlowFromPayload(readPayloadFromLocation(loc)!);
    expect(dec!.name).toBe('Round Trip');
    expect(dec!.nodes).toHaveLength(2);
  });
});
