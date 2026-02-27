/**
 * Code Generator Service Tests
 */

import { describe, it, expect, vi } from 'vitest';
import type { Flow, SDKLanguage } from '@accumulate-studio/types';

// Mock the codegen package before importing the service
vi.mock('@accumulate-studio/codegen', () => ({
  loadAllManifests: vi.fn(() => ({
    python: { language: 'python', blocks: [] },
    rust: { language: 'rust', blocks: [] },
    dart: { language: 'dart', blocks: [] },
    javascript: { language: 'javascript', blocks: [] },
    csharp: { language: 'csharp', blocks: [] },
  })),
  generateCodeFromManifest: vi.fn(
    (_flow: Flow, language: string, mode: string, _manifest: unknown) => {
      return `// Generated ${language} code (mode=${mode})`;
    }
  ),
}));

import { generateCode } from '../code-generator';
import { generateCodeFromManifest } from '@accumulate-studio/codegen';

// =============================================================================
// Helpers
// =============================================================================

const emptyFlow: Flow = {
  version: '1.0',
  name: 'Empty',
  variables: [],
  nodes: [],
  connections: [],
};

const simpleFlow: Flow = {
  version: '1.0',
  name: 'Simple',
  variables: [],
  nodes: [
    { id: 'n1', type: 'GenerateKeys', config: {}, position: { x: 0, y: 0 } },
  ],
  connections: [],
};

// =============================================================================
// Empty Flow Messages
// =============================================================================

describe('empty flow messages', () => {
  it('returns Python comment style for empty flow', () => {
    const code = generateCode(emptyFlow, 'python', 'sdk');
    expect(code).toMatch(/^# /);
    expect(code).toContain('Your flow is empty!');
  });

  it('returns Rust comment style for empty flow', () => {
    const code = generateCode(emptyFlow, 'rust', 'sdk');
    expect(code).toMatch(/^\/\/ /);
    expect(code).toContain('Your flow is empty!');
  });

  it('returns Dart comment style for empty flow', () => {
    const code = generateCode(emptyFlow, 'dart', 'sdk');
    expect(code).toMatch(/^\/\/ /);
    expect(code).toContain('Your flow is empty!');
  });

  it('returns JavaScript comment style for empty flow', () => {
    const code = generateCode(emptyFlow, 'javascript', 'sdk');
    expect(code).toMatch(/^\/\/ /);
    expect(code).toContain('Your flow is empty!');
  });

  it('returns TypeScript comment style for empty flow', () => {
    const code = generateCode(emptyFlow, 'typescript', 'sdk');
    expect(code).toMatch(/^\/\/ /);
    expect(code).toContain('Your flow is empty!');
  });

  it('returns C# comment style for empty flow', () => {
    const code = generateCode(emptyFlow, 'csharp', 'sdk');
    expect(code).toMatch(/^\/\/ /);
    expect(code).toContain('Your flow is empty!');
  });

  it('includes suggested starting points', () => {
    const code = generateCode(emptyFlow, 'python', 'sdk');
    expect(code).toContain('Generate Keys');
    expect(code).toContain('Faucet');
    expect(code).toContain('Add Credits');
    expect(code).toContain('Create ADI');
  });

  it('includes Accumulate Studio header', () => {
    const code = generateCode(emptyFlow, 'python', 'sdk');
    expect(code).toContain('Accumulate Studio');
  });
});

// =============================================================================
// Code Generation (non-empty flow)
// =============================================================================

describe('code generation for non-empty flow', () => {
  it('generates Python code', () => {
    const code = generateCode(simpleFlow, 'python', 'sdk');
    expect(code).toContain('Generated python code');
  });

  it('generates Rust code', () => {
    const code = generateCode(simpleFlow, 'rust', 'sdk');
    expect(code).toContain('Generated rust code');
  });

  it('generates Dart code', () => {
    const code = generateCode(simpleFlow, 'dart', 'sdk');
    expect(code).toContain('Generated dart code');
  });

  it('generates JavaScript code', () => {
    const code = generateCode(simpleFlow, 'javascript', 'sdk');
    expect(code).toContain('Generated javascript code');
  });

  it('generates C# code', () => {
    const code = generateCode(simpleFlow, 'csharp', 'sdk');
    expect(code).toContain('Generated csharp code');
  });

  it('TypeScript falls through to JavaScript manifest', () => {
    const code = generateCode(simpleFlow, 'typescript', 'sdk');
    expect(code).toContain('Generated javascript code');
  });

  it('calls generateCodeFromManifest with correct arguments', () => {
    vi.mocked(generateCodeFromManifest).mockClear();
    generateCode(simpleFlow, 'python', 'sdk');
    expect(generateCodeFromManifest).toHaveBeenCalledWith(
      simpleFlow,
      'python',
      'sdk',
      expect.objectContaining({ language: 'python' })
    );
  });
});

// =============================================================================
// Code Mode
// =============================================================================

describe('code mode', () => {
  it('passes sdk mode through', () => {
    vi.mocked(generateCodeFromManifest).mockClear();
    generateCode(simpleFlow, 'rust', 'sdk');
    expect(generateCodeFromManifest).toHaveBeenCalledWith(
      expect.anything(),
      'rust',
      'sdk',
      expect.anything()
    );
  });

  it('passes cli mode through', () => {
    vi.mocked(generateCodeFromManifest).mockClear();
    generateCode(simpleFlow, 'rust', 'cli');
    expect(generateCodeFromManifest).toHaveBeenCalledWith(
      expect.anything(),
      'rust',
      'cli',
      expect.anything()
    );
  });
});
