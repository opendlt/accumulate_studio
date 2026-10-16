import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import type { Flow } from '@accumulate-studio/types';
import { generateDartProject, generateJavaScriptProject } from '../src/project-scaffolds';

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
