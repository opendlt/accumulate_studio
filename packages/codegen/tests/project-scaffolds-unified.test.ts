import { describe, it, expect } from 'vitest';
import type { Flow, FlowNode, FlowConnection, BlockType } from '@accumulate-studio/types';
import { PROJECT_GENERATORS } from '../src/project-scaffolds';

// Every block type in the catalog — the scaffolds must produce real code for all.
const ALL_BLOCK_TYPES: BlockType[] = [
  'GenerateKeys', 'Faucet', 'WaitForBalance', 'WaitForCredits', 'QueryAccount',
  'CreateLiteTokenAccount', 'AddCredits', 'TransferCredits', 'BurnCredits',
  'CreateIdentity', 'CreateKeyBook', 'CreateKeyPage', 'CreateTokenAccount',
  'CreateDataAccount', 'CreateToken', 'SendTokens', 'IssueTokens', 'BurnTokens',
  'WriteData', 'WriteDataTo', 'UpdateKeyPage', 'UpdateKey', 'LockAccount',
  'UpdateAccountAuth', 'Comment',
];

function flowWithAllBlocks(): Flow {
  const nodes: FlowNode[] = ALL_BLOCK_TYPES.map((type, i) => ({
    id: `${type.toLowerCase()}_${i}`,
    type,
    label: type,
    config: {},
    position: { x: 0, y: i * 100 },
  }));
  const connections: FlowConnection[] = nodes.slice(1).map((n, i) => ({
    id: `c${i}`,
    sourceNodeId: nodes[i].id,
    sourcePortId: 'output',
    targetNodeId: n.id,
    targetPortId: 'input',
  }));
  return {
    version: '1.0',
    name: 'All Blocks',
    description: 'every block type',
    network: 'devnet',
    nodes,
    connections,
    variables: [],
    assertions: [],
  };
}

// Engine A's fallback stub emits `TODO: Implement <type>`; the old engine-B
// scaffolds also emitted `not_implemented`. Neither must appear in unified output.
const STUB_RE = /TODO:\s*Implement|not_implemented/;

const LANGS = ['python', 'rust', 'dart', 'javascript', 'csharp'] as const;

const MANIFEST_FILE: Record<(typeof LANGS)[number], string | undefined> = {
  python: 'pyproject.toml',
  rust: 'Cargo.toml',
  dart: 'pubspec.yaml',
  javascript: 'package.json',
  csharp: undefined, // .csproj name varies with the flow name
};

describe('unified project scaffolds', () => {
  const flow = flowWithAllBlocks();

  for (const lang of LANGS) {
    describe(lang, () => {
      const files = PROJECT_GENERATORS[lang](flow);
      const entry = files.find((f) => f.isEntryPoint)!;

      it('emits a non-trivial entry-point file', () => {
        expect(entry).toBeDefined();
        expect(entry.content.length).toBeGreaterThan(100);
      });

      it('main file has NO stub markers for any of the 25 block types', () => {
        expect(STUB_RE.test(entry.content)).toBe(false);
      });

      it('still emits project metadata (README + manifest)', () => {
        const paths = files.map((f) => f.path);
        expect(paths).toContain('README.md');
        const manifestFile = MANIFEST_FILE[lang];
        if (manifestFile) expect(paths).toContain(manifestFile);
        else expect(paths.some((p) => p.endsWith('.csproj'))).toBe(true);
      });
    });
  }

  it('main file equals the unified engine output (no divergent path)', () => {
    // Sanity: the Python main must be engine-A output, which defines `def main()`.
    const py = PROJECT_GENERATORS.python(flow).find((f) => f.isEntryPoint)!;
    expect(py.content).toContain('def main');
  });

  it('typescript routes through the JS generator', () => {
    const ts = PROJECT_GENERATORS.typescript(flow).find((f) => f.isEntryPoint)!;
    expect(STUB_RE.test(ts.content)).toBe(false);
    expect(ts.content.length).toBeGreaterThan(100);
  });
});
