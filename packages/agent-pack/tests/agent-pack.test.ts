/**
 * Agent Pack Test Suite
 *
 * Tests the generator, validator, SDK mapper, and prompts modules.
 */

import { describe, it, expect } from 'vitest';
import {
  generateAgentPack,
  validateAgentPack,
  validateManifest,
  validateSDKMap,
  validatePromptsIndex,
  validateAgentsMd,
  validateSafetyMd,
  generateSDKMap,
  getDefaultPrompts,
  generatePromptsIndex,
  generatePromptWithLanguage,
  type AgentPackManifest,
  type PromptsIndex,
} from '../src';
import type { SDKLanguage, SDKMap } from '@accumulate-studio/types';

// =============================================================================
// Generator Tests
// =============================================================================

describe('generateAgentPack', () => {
  const languages: SDKLanguage[] = ['python', 'rust', 'dart', 'javascript', 'csharp'];

  for (const language of languages) {
    describe(`for ${language}`, () => {
      it('generates all required files', () => {
        const result = generateAgentPack('/fake/sdk/path', language);

        expect(result.files.length).toBeGreaterThan(0);
        expect(result.sdkMap).toBeTruthy();

        const paths = result.files.map((f) => f.path);
        expect(paths).toContain('agent-pack.json');
        expect(paths).toContain('AGENTS.md');
        expect(paths).toContain('SAFETY.md');
        expect(paths).toContain('sdk.map.json');
        expect(paths).toContain('prompts/index.json');
        expect(paths).toContain('README.md');
      });

      it('generates valid JSON for manifest and SDK map', () => {
        const result = generateAgentPack('/fake/sdk/path', language);

        const manifestFile = result.files.find((f) => f.path === 'agent-pack.json');
        expect(manifestFile).toBeTruthy();
        const manifest = JSON.parse(manifestFile!.content);
        expect(manifest.version).toBe('1.0.0');
        expect(manifest.language).toBe(language);
        expect(manifest.sdk_name).toBeTruthy();

        const sdkMapFile = result.files.find((f) => f.path === 'sdk.map.json');
        expect(sdkMapFile).toBeTruthy();
        const sdkMap = JSON.parse(sdkMapFile!.content);
        expect(sdkMap.sdk_name).toBeTruthy();
        expect(sdkMap.operations.length).toBeGreaterThan(0);
      });

      it('generates prompt files', () => {
        const result = generateAgentPack('/fake/sdk/path', language);

        const promptFiles = result.files.filter((f) => f.path.endsWith('.prompt.md'));
        expect(promptFiles.length).toBeGreaterThan(0);

        for (const pf of promptFiles) {
          expect(pf.content).toContain(`language: ${language}`);
        }
      });

      it('generates example files', () => {
        const result = generateAgentPack('/fake/sdk/path', language);

        const exampleFiles = result.files.filter((f) => f.path.startsWith('examples/'));
        expect(exampleFiles.length).toBeGreaterThan(0);
      });

      it('can skip examples', () => {
        const result = generateAgentPack('/fake/sdk/path', language, {
          includeExamples: false,
        });

        const exampleFiles = result.files.filter(
          (f) => f.path.startsWith('examples/') && !f.path.endsWith('.gitkeep')
        );
        expect(exampleFiles.length).toBe(0);
      });
    });
  }

  it('accepts custom options', () => {
    const result = generateAgentPack('/fake/sdk/path', 'python', {
      sdkName: 'custom-sdk',
      sdkVersion: '3.0.0',
      customRules: ['Always use async/await'],
      customProhibitions: ['Never use eval()'],
      valueThresholdAcme: 500,
      valueThresholdCredits: 5000,
    });

    expect(result.sdkMap.sdk_name).toBe('custom-sdk');
    expect(result.sdkMap.sdk_version).toBe('3.0.0');

    const agentsMd = result.files.find((f) => f.path === 'AGENTS.md');
    expect(agentsMd).toBeTruthy();
    expect(agentsMd!.content).toContain('Always use async/await');
  });
});

// =============================================================================
// Validator Tests
// =============================================================================

describe('validateAgentPack', () => {
  it('reports all missing required files', () => {
    const result = validateAgentPack({
      existingFiles: [],
    });

    expect(result.valid).toBe(false);
    expect(result.missingFiles.length).toBe(5);
    expect(result.missingFiles).toContain('agent-pack.json');
    expect(result.missingFiles).toContain('AGENTS.md');
    expect(result.missingFiles).toContain('SAFETY.md');
    expect(result.missingFiles).toContain('sdk.map.json');
    expect(result.missingFiles).toContain('prompts/index.json');
  });

  it('validates a complete agent pack', () => {
    const pack = generateAgentPack('/fake/sdk/path', 'python');
    const existingFiles = pack.files.map((f) => f.path);

    const manifest = JSON.parse(
      pack.files.find((f) => f.path === 'agent-pack.json')!.content
    ) as AgentPackManifest;
    const sdkMap = JSON.parse(
      pack.files.find((f) => f.path === 'sdk.map.json')!.content
    ) as SDKMap;
    const promptsIndex = JSON.parse(
      pack.files.find((f) => f.path === 'prompts/index.json')!.content
    ) as PromptsIndex;
    const agentsMd = pack.files.find((f) => f.path === 'AGENTS.md')!.content;
    const safetyMd = pack.files.find((f) => f.path === 'SAFETY.md')!.content;

    const result = validateAgentPack({
      manifest,
      sdkMap,
      promptsIndex,
      agentsMd,
      safetyMd,
      existingFiles,
    });

    // Should have no errors (may have warnings/info)
    expect(result.errorCount).toBe(0);
    expect(result.valid).toBe(true);
    expect(result.validatedFiles.length).toBe(5);
  });
});

describe('validateManifest', () => {
  it('reports missing version', () => {
    const issues = validateManifest({
      version: '',
      sdk_name: 'test',
      sdk_version: '1.0',
      language: 'python',
      generated_at: new Date().toISOString(),
      files: { agents_md: 'AGENTS.md', safety_md: 'SAFETY.md', sdk_map: 'sdk.map.json', prompts_index: 'prompts/index.json' },
    });
    expect(issues.some((i) => i.code === 'MANIFEST_MISSING_VERSION')).toBe(true);
  });

  it('reports missing sdk_name', () => {
    const issues = validateManifest({
      version: '1.0.0',
      sdk_name: '',
      sdk_version: '1.0',
      language: 'python',
      generated_at: new Date().toISOString(),
      files: { agents_md: 'AGENTS.md', safety_md: 'SAFETY.md', sdk_map: 'sdk.map.json', prompts_index: 'prompts/index.json' },
    });
    expect(issues.some((i) => i.code === 'MANIFEST_MISSING_SDK_NAME')).toBe(true);
  });

  it('reports invalid language', () => {
    const issues = validateManifest({
      version: '1.0.0',
      sdk_name: 'test',
      sdk_version: '1.0',
      language: 'fortran',
      generated_at: new Date().toISOString(),
      files: { agents_md: 'AGENTS.md', safety_md: 'SAFETY.md', sdk_map: 'sdk.map.json', prompts_index: 'prompts/index.json' },
    });
    expect(issues.some((i) => i.code === 'MANIFEST_INVALID_LANGUAGE')).toBe(true);
  });

  it('accepts valid manifest with no issues', () => {
    const issues = validateManifest({
      version: '1.0.0',
      sdk_name: 'test-sdk',
      sdk_version: '1.0.0',
      language: 'python',
      generated_at: new Date().toISOString(),
      files: { agents_md: 'AGENTS.md', safety_md: 'SAFETY.md', sdk_map: 'sdk.map.json', prompts_index: 'prompts/index.json' },
    });
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBe(0);
  });
});

describe('validateSDKMap', () => {
  it('reports missing name and version', () => {
    const issues = validateSDKMap({
      sdk_name: '',
      sdk_version: '',
      commit: '',
      entrypoints: [],
      operations: [],
    });
    expect(issues.some((i) => i.code === 'SDK_MAP_MISSING_NAME')).toBe(true);
    expect(issues.some((i) => i.code === 'SDK_MAP_MISSING_VERSION')).toBe(true);
    expect(issues.some((i) => i.code === 'SDK_MAP_NO_ENTRYPOINTS')).toBe(true);
  });

  it('validates a generated SDK map without errors', () => {
    const sdkMap = generateSDKMap('/fake/path', 'python');
    const issues = validateSDKMap(sdkMap);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBe(0);
  });
});

describe('validatePromptsIndex', () => {
  it('reports empty prompts', () => {
    const issues = validatePromptsIndex({ version: '1.0', prompts: [] }, []);
    expect(issues.some((i) => i.code === 'PROMPTS_EMPTY')).toBe(true);
  });

  it('reports missing prompt file', () => {
    const issues = validatePromptsIndex(
      {
        version: '1.0',
        prompts: [
          { id: 'test', title: 'Test', file: 'prompts/test.md' },
        ],
      },
      [] // no files exist
    );
    expect(issues.some((i) => i.code === 'PROMPT_FILE_MISSING')).toBe(true);
  });

  it('reports duplicate prompt ids', () => {
    const issues = validatePromptsIndex(
      {
        version: '1.0',
        prompts: [
          { id: 'dup', title: 'First', file: 'prompts/dup1.md' },
          { id: 'dup', title: 'Second', file: 'prompts/dup2.md' },
        ],
      },
      ['prompts/dup1.md', 'prompts/dup2.md']
    );
    expect(issues.some((i) => i.code === 'PROMPT_DUPLICATE_ID')).toBe(true);
  });
});

describe('validateAgentsMd', () => {
  it('warns about missing sections', () => {
    const issues = validateAgentsMd('Short content');
    expect(issues.some((i) => i.code === 'AGENTS_MISSING_SECTION')).toBe(true);
    expect(issues.some((i) => i.code === 'AGENTS_TOO_SHORT')).toBe(true);
  });

  it('warns about missing code examples', () => {
    const issues = validateAgentsMd('Content without code blocks but long enough to pass the length check'.repeat(20));
    expect(issues.some((i) => i.code === 'AGENTS_NO_CODE_EXAMPLES')).toBe(true);
  });
});

describe('validateSafetyMd', () => {
  it('warns about missing sections', () => {
    const issues = validateSafetyMd('Short content');
    expect(issues.some((i) => i.code === 'SAFETY_MISSING_SECTION')).toBe(true);
    expect(issues.some((i) => i.code === 'SAFETY_TOO_SHORT')).toBe(true);
  });
});

// =============================================================================
// SDK Mapper Tests
// =============================================================================

describe('generateSDKMap', () => {
  const languages: SDKLanguage[] = ['python', 'rust', 'dart', 'javascript', 'csharp'];

  for (const language of languages) {
    it(`generates a valid SDK map for ${language}`, () => {
      const sdkMap = generateSDKMap('/fake/path', language);

      expect(sdkMap.sdk_name).toBeTruthy();
      expect(sdkMap.sdk_version).toBeTruthy();
      expect(sdkMap.entrypoints.length).toBeGreaterThan(0);
      expect(sdkMap.operations.length).toBeGreaterThan(0);
      expect(sdkMap.errors).toBeDefined();
      expect(sdkMap.errors!.length).toBeGreaterThan(0);

      // Every entrypoint should have symbol and path
      for (const ep of sdkMap.entrypoints) {
        expect(ep.symbol).toBeTruthy();
        expect(ep.path).toBeTruthy();
      }

      // Every operation should have op and symbols
      for (const op of sdkMap.operations) {
        expect(op.op).toBeTruthy();
        expect(op.symbols.length).toBeGreaterThan(0);
      }
    });
  }

  it('respects custom options', () => {
    const sdkMap = generateSDKMap('/fake/path', 'python', {
      sdkName: 'my-custom-sdk',
      sdkVersion: '9.9.9',
      commit: 'abc1234',
    });

    expect(sdkMap.sdk_name).toBe('my-custom-sdk');
    expect(sdkMap.sdk_version).toBe('9.9.9');
    expect(sdkMap.commit).toBe('abc1234');
  });
});

// =============================================================================
// Prompts Tests
// =============================================================================

describe('Prompts', () => {
  it('getDefaultPrompts returns 4 prompts', () => {
    const prompts = getDefaultPrompts();
    expect(prompts.length).toBe(4);

    const ids = prompts.map((p) => p.id);
    expect(ids).toContain('create-adi');
    expect(ids).toContain('send-tokens');
    expect(ids).toContain('write-data');
    expect(ids).toContain('zero-to-hero');
  });

  it('each prompt has required fields', () => {
    const prompts = getDefaultPrompts();
    for (const prompt of prompts) {
      expect(prompt.id).toBeTruthy();
      expect(prompt.title).toBeTruthy();
      expect(prompt.description).toBeTruthy();
      expect(prompt.content.length).toBeGreaterThan(100);
      expect(prompt.tags.length).toBeGreaterThan(0);
    }
  });

  it('generatePromptsIndex returns valid index', () => {
    const index = generatePromptsIndex();
    expect(index.version).toBe('1.0.0');
    expect(index.prompts.length).toBe(4);
  });

  it('generatePromptWithLanguage adds language header', () => {
    const prompts = getDefaultPrompts();
    for (const language of ['python', 'rust', 'dart', 'javascript', 'csharp'] as SDKLanguage[]) {
      const content = generatePromptWithLanguage(prompts[0], language);
      expect(content).toContain(`language: ${language}`);
      expect(content).toContain(`id: ${prompts[0].id}`);
    }
  });
});
