/**
 * The default ADI name carries a random suffix (D-31).
 *
 * Every program names its ADI `adi-<unix seconds>` by default, so two programs started in the same
 * second chose the same name: the loser's CreateIdentity failed, and its funding send credited the
 * winner's account (D-26). The suffix must be there for both defaults (the ADI_NAME flow variable and
 * a CreateIdentity with no url), evaluated once per program, and drawn from a source the program
 * already has or imports.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import type { Flow, FlowNode, SDKLanguage } from '@accumulate-studio/types';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';

const LANGUAGES: SDKLanguage[] = ['python', 'javascript', 'rust', 'dart', 'csharp'];

/** The call that draws the randomness, per language. */
const RANDOM_SOURCE: Record<string, string> = {
  python: 'os.urandom(3).hex()',
  javascript: 'Math.random()',
  rust: 'RandomState::new()',
  dart: 'Random().nextInt(0x1000000)',
  csharp: 'Random.Shared.Next(0x1000000)',
};

function node(id: string, type: string, label: string, config: Record<string, unknown>, i: number): FlowNode {
  return { id, type, label, config, position: { x: 100, y: 100 + i * 160 } } as FlowNode;
}

function flowOf(nodes: FlowNode[], variables: Flow['variables'] = []): Flow {
  return {
    version: '1.0',
    name: 'Name Default Test',
    description: 'ADI name default',
    network: 'kermit',
    variables,
    nodes,
    connections: nodes.slice(1).map((n, i) => ({
      id: `c${i}`, sourceNodeId: nodes[i].id, sourcePortId: 'output', targetNodeId: n.id, targetPortId: 'input',
    })),
    assertions: [],
  } as Flow;
}

const keys = node('generate_keys', 'GenerateKeys', 'Generate Keys', { algorithm: 'Ed25519' }, 0);
/** A flow with the ADI_NAME variable and a CreateIdentity that uses it. */
const withVariable = flowOf(
  [keys, node('create_identity', 'CreateIdentity', 'Create ADI', { url: 'acc://{{ADI_NAME}}.acme' }, 1)],
  [{ name: 'ADI_NAME', type: 'string', description: 'ADI name', required: true }],
);
/** A flow whose CreateIdentity has no url: the generator picks the name itself. */
const bareCreateIdentity = flowOf([keys, node('create_identity', 'CreateIdentity', 'Create ADI', {}, 1)]);
/** No ADI anywhere: nothing here should draw randomness. */
const noAdi = flowOf([keys, node('faucet', 'Faucet', 'Request Tokens', { times: 1 }, 1)]);

function generate(flow: Flow, lang: SDKLanguage): string {
  return generateCodeFromManifest(flow, lang, 'sdk', loadManifest(lang));
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('default ADI name: random suffix, every language', () => {
  for (const lang of LANGUAGES) {
    describe(lang, () => {
      it('the ADI_NAME default draws a random suffix', () => {
        const code = generate(withVariable, lang);
        expect(code).toContain(RANDOM_SOURCE[lang]);
        expect(code).toContain('adi-');
      });

      it('a CreateIdentity with no url draws a random suffix, once (the url variable is reused for the key book)', () => {
        const code = generate(bareCreateIdentity, lang);
        expect(count(code, RANDOM_SOURCE[lang]), `${lang}: the name must be evaluated once`).toBe(1);
        expect(code).toContain('acc://adi-');
      });

      it('a flow with no ADI draws no randomness and imports nothing extra', () => {
        const code = generate(noAdi, lang);
        expect(code).not.toContain(RANDOM_SOURCE[lang]);
        if (lang === 'python') expect(code).not.toMatch(/^import os$/m);
        if (lang === 'dart') expect(code).not.toContain("import 'dart:math';");
      });
    });
  }

  it('python imports os for the suffix, once', () => {
    for (const flow of [withVariable, bareCreateIdentity]) {
      expect(count(generate(flow, 'python'), '\nimport os\n')).toBe(1);
    }
  });

  it('dart imports dart:math for the suffix, once', () => {
    for (const flow of [withVariable, bareCreateIdentity]) {
      expect(count(generate(flow, 'dart'), "import 'dart:math';")).toBe(1);
    }
  });

  it('a hash-lock flow still imports os / dart:math exactly once (it needs them already)', () => {
    const hashLock = flowOf(
      [
        keys,
        node('create_identity', 'CreateIdentity', 'Create ADI', {}, 1),
        node('create_hash_lock', 'GenerateHashLock', 'Create Hash Lock', { hashAlgorithm: 'sha256', expirationMinutes: 30 }, 2),
      ],
    );
    expect(count(generate(hashLock, 'python'), '\nimport os\n')).toBe(1);
    expect(count(generate(hashLock, 'dart'), "import 'dart:math';")).toBe(1);
  });
});

/** Pull the right-hand side of the generated `adi_name` / url assignment. */
function rightHandSide(code: string, marker: string, endMarker: string): string {
  const line = code.split('\n').find((l) => l.includes(marker));
  expect(line, `no line with ${marker}`).toBeDefined();
  const start = line!.indexOf('= ') + 2;
  return line!.slice(start, line!.indexOf(endMarker, start)).trim();
}

describe('the generated default evaluates to a valid, distinct name each time', () => {
  const VALID = /^adi-[0-9]+-[0-9a-f]{6}$/;

  it('javascript', () => {
    const expr = rightHandSide(generate(withVariable, 'javascript'), 'const adi_name', ';  //');
    const names = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const name = new Function(`return ${expr}`)() as string;
      expect(name).toMatch(VALID);
      names.add(name);
    }
    expect(names.size).toBeGreaterThan(1);
  });

  const python = spawnSync('python', ['--version']);
  const HAS_PYTHON = python.status === 0;
  const REQUIRE_TOOLCHAINS = process.env.REQUIRE_TOOLCHAINS === '1';

  it('python', () => {
    if (!HAS_PYTHON) {
      expect(REQUIRE_TOOLCHAINS, 'REQUIRE_TOOLCHAINS=1 but python is not on PATH').toBe(false);
      return;
    }
    const expr = rightHandSide(generate(withVariable, 'python'), 'adi_name = ', '  #');
    const run = spawnSync('python', [
      '-c',
      `import os, time\nfor _ in range(20): print(${expr})`,
    ]);
    expect(run.status, String(run.stderr)).toBe(0);
    const names = String(run.stdout).trim().split(/\r?\n/);
    expect(names).toHaveLength(20);
    for (const name of names) expect(name).toMatch(VALID);
    expect(new Set(names).size).toBeGreaterThan(1);
  });
});
