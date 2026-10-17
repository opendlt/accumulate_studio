import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import type { Flow } from '@accumulate-studio/types';
import {
  generateCSharpProject,
  generateDartProject,
  generateJavaScriptProject,
  generatePythonProject,
  generateRustProject,
} from '../src/project-scaffolds';
import { generateBundle } from '../src/bundle-generator';

// Flow descriptions are free text. A plain YAML scalar containing ": " (as in the
// Token Transfer description: "Complete token transfer flow: sets up keys, ...")
// makes `dart pub get` fail with "Mapping values are not allowed here".
const AWKWARD_DESCRIPTIONS = [
  'Complete token transfer flow: sets up keys, funds via faucet, then transfers ACME.',
  'Uses a #hash and a "quoted" word, plus a trailing colon:',
  "It's a [list] {of} things & more",
];

function flowWith(description: string): Flow {
  return {
    version: '1.0',
    name: 'Scaffold Metadata',
    description,
    network: 'devnet',
    nodes: [],
    connections: [],
    variables: [],
    assertions: [],
  };
}

describe('project scaffold metadata survives free-text descriptions', () => {
  for (const description of AWKWARD_DESCRIPTIONS) {
    it(`dart pubspec.yaml parses and keeps the description: ${description}`, () => {
      const pubspec = generateDartProject(flowWith(description)).find((f) => f.path === 'pubspec.yaml');
      expect(pubspec).toBeDefined();
      const parsed = yaml.load(pubspec!.content) as Record<string, unknown>;
      expect(parsed.description).toBe(description);
      expect(parsed.name).toBe('scaffold_metadata');
    });

    it(`javascript package.json parses and keeps the description: ${description}`, () => {
      const pkg = generateJavaScriptProject(flowWith(description)).find((f) => f.path === 'package.json');
      expect(pkg).toBeDefined();
      expect(JSON.parse(pkg!.content).description).toBe(description);
    });
  }
});

// toSnakeCase / toKebabCase exist in three copies (template-engine, project-scaffolds, bundle-generator);
// each is observable through what it names, so each is pinned here.
describe('an acronym in a flow name stays one word in every project slug', () => {
  const flow: Flow = { ...flowWith('HTLC payment'), name: 'Hash Lock (HTLC) Payment' };

  it('python names the project and the package directory', () => {
    const files = generatePythonProject(flow);
    expect(files.find((f) => f.path === 'pyproject.toml')!.content).toContain('name = "hash_lock_htlc_payment"');
    expect(files.some((f) => f.path === 'hash_lock_htlc_payment/main.py')).toBe(true);
  });

  it('rust names the crate', () => {
    const cargo = generateRustProject(flow).find((f) => f.path === 'Cargo.toml')!;
    expect(cargo.content).toContain('name = "hash_lock_htlc_payment"');
  });

  it('dart names the package', () => {
    const pubspec = generateDartProject(flow).find((f) => f.path === 'pubspec.yaml')!;
    expect((yaml.load(pubspec.content) as Record<string, unknown>).name).toBe('hash_lock_htlc_payment');
  });

  it('javascript names the package in kebab-case', () => {
    const pkg = generateJavaScriptProject(flow).find((f) => f.path === 'package.json')!;
    expect(JSON.parse(pkg.content).name).toBe('hash-lock-htlc-payment');
  });

  it('csharp names the project in PascalCase', () => {
    expect(generateCSharpProject(flow).some((f) => f.path === 'HashLockHtlcPayment.csproj')).toBe(true);
  });

  it('the export bundle names itself and its Python quick start the same way', async () => {
    const bundle = await generateBundle(flow, { languages: ['python'], includeAgentFiles: false });
    expect(bundle.manifest.name).toBe('hash-lock-htlc-payment');
    const readme = bundle.files.find((f) => f.path === 'README.md')!;
    expect(readme.content).toContain('python -m hash_lock_htlc_payment.main');
  });
});
