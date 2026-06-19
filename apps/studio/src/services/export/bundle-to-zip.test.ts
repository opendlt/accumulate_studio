import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { Flow } from '@accumulate-studio/types';
import { generateBundle, type Bundle } from '@accumulate-studio/codegen';
import { bundleToZipBytes } from './bundle-to-zip';

const fakeBundle: Bundle = {
  // manifest shape is irrelevant to zipping; only `files` is used.
  manifest: {} as unknown as Bundle['manifest'],
  files: [
    { path: 'README.md', content: '# hi', type: 'readme' },
    { path: 'generated/python/main.py', content: 'print(1)', type: 'code', language: 'python' },
  ],
};

const sampleFlow: Flow = {
  version: '1.0',
  name: 'Zip Sample',
  description: 'sample flow for zip tests',
  network: 'testnet',
  variables: [],
  nodes: [
    { id: 'gen_0', type: 'GenerateKeys', label: 'Generate Keys', config: {}, position: { x: 0, y: 0 } },
    { id: 'faucet_1', type: 'Faucet', label: 'Faucet', config: {}, position: { x: 0, y: 100 } },
  ],
  connections: [
    { id: 'c0', sourceNodeId: 'gen_0', sourcePortId: 'output', targetNodeId: 'faucet_1', targetPortId: 'input' },
  ],
  assertions: [],
};

describe('bundleToZipBytes', () => {
  it('round-trips every file path and content', () => {
    const zip = bundleToZipBytes(fakeBundle);
    const out = unzipSync(zip);
    expect(Object.keys(out).sort()).toEqual(['README.md', 'generated/python/main.py']);
    expect(strFromU8(out['generated/python/main.py'])).toBe('print(1)');
    expect(strFromU8(out['README.md'])).toBe('# hi');
  });

  it('produces non-trivial bytes', () => {
    expect(bundleToZipBytes(fakeBundle).byteLength).toBeGreaterThan(0);
  });
});

describe('preview parity', () => {
  it('zip entries equal the bundle file list', async () => {
    const bundle = await generateBundle(sampleFlow, {
      languages: ['python'],
      includeAssertions: true,
      includeAgentFiles: true,
      network: 'testnet',
    });
    const entries = Object.keys(unzipSync(bundleToZipBytes(bundle))).sort();
    expect(entries).toEqual(bundle.files.map((f) => f.path).sort());
  });

  it('generated python main is real engine-A output (no stub markers)', async () => {
    const bundle = await generateBundle(sampleFlow, { languages: ['python'], network: 'testnet' });
    const main = bundle.files.find((f) => f.path.endsWith('/main.py'));
    expect(main).toBeDefined();
    expect(/TODO: Implement|not_implemented/.test(main!.content)).toBe(false);
    expect(main!.content).toContain('def main');
  });
});
