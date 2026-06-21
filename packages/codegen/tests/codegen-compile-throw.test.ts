/**
 * P2-1 Bug 2 — generateCodeFromManifest must throw (not silently fall back) when a
 * template REQUIRED by a node in the flow fails to compile. Isolated in its own file
 * because it mocks the template loader to inject a deliberately-broken `send_tokens`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Flow, SDKLanguage } from '@accumulate-studio/types';

vi.mock('../src/template-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/template-loader')>();
  return {
    ...actual,
    loadBundledTemplates: (lang: SDKLanguage) => ({
      ...actual.loadBundledTemplates(lang),
      send_tokens: '{{#if', // deliberately broken
    }),
  };
});

import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';

function sendTokensFlow(): Flow {
  return {
    version: '1.0', name: 'broken', description: '', network: 'devnet', variables: [],
    nodes: [
      { id: 'gen', type: 'GenerateKeys', label: 'gen', config: {}, position: { x: 0, y: 0 } },
      { id: 'faucet', type: 'Faucet', label: 'faucet', config: { account: '{{gen.liteTokenAccount}}' }, position: { x: 0, y: 100 } },
      { id: 'send', type: 'SendTokens', label: 'send', config: { to: 'acc://x.acme/ACME', amount: '1' }, position: { x: 0, y: 200 } },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'gen', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
      { id: 'c2', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'send', targetPortId: 'input' },
    ],
  };
}

describe('Bug 2 — generateCodeFromManifest throws on a needed broken template', () => {
  it('throws a Template compile failure for SendTokens', () => {
    expect(() => generateCodeFromManifest(sendTokensFlow(), 'python', 'sdk', loadManifest('python')))
      .toThrow(/Template compile failure/);
  });
});
