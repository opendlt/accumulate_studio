/**
 * Codegen Snapshot Tests
 *
 * Captures and validates the output of the manifest-driven code generator
 * against golden snapshots. Each YAML template × language × SDK mode = one snapshot.
 *
 * To update snapshots: vitest run --update
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import yaml from 'js-yaml';
import type { Flow } from '@accumulate-studio/types';
import { deserializeYamlToFlow } from '../src/flow-serializer';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';

const TEMPLATES_DIR = join(__dirname, '../../../templates');
const LANGUAGES = ['python', 'rust', 'dart', 'javascript', 'csharp'] as const;

/**
 * Load all YAML templates from the templates directory
 */
function loadTemplates(): Array<{ name: string; flow: Flow }> {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.yaml'));
  return files.map((file) => {
    const content = readFileSync(join(TEMPLATES_DIR, file), 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    // Convert structured YAML variables ({ NAME: { type, description, ... } })
    // to simple format expected by deserializeYamlToFlow ({ NAME: "type" })
    const rawVars = (parsed.variables as Record<string, unknown>) || {};
    const simpleVars: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawVars)) {
      if (typeof val === 'string') {
        simpleVars[key] = val;
      } else if (val && typeof val === 'object' && 'type' in val) {
        simpleVars[key] = (val as { type: string }).type;
      }
    }

    // Convert YAML blocks to Flow format
    const flow = deserializeYamlToFlow({
      version: (parsed.version as string) || '1.0',
      name: (parsed.name as string) || basename(file, '.yaml'),
      description: parsed.description as string | undefined,
      blocks: (parsed.blocks as Array<Record<string, unknown>>) || [],
      variables: simpleVars,
      assertions: parsed.assertions as Array<Record<string, unknown>> | undefined,
    });

    // Set network from template or default
    flow.network = 'devnet';

    return { name: basename(file, '.yaml'), flow };
  });
}

const templates = loadTemplates();

describe('Codegen Snapshots', () => {
  for (const lang of LANGUAGES) {
    describe(`${lang} SDK`, () => {
      const manifest = loadManifest(lang);

      for (const { name, flow } of templates) {
        it(`${name} generates expected ${lang} code`, () => {
          const output = generateCodeFromManifest(flow, lang, 'sdk', manifest);
          expect(output).toMatchSnapshot();
        });
      }
    });
  }
});
