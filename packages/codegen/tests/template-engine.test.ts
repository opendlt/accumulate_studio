/**
 * Template Engine Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  toSnakeCase,
  toKebabCase,
  toCamelCase,
  toPascalCase,
  createTemplateEngine,
  nodeToVarName,
} from '../src/template-engine';
import type { FlowNode } from '@accumulate-studio/types';

describe('Case conversion utilities', () => {
  describe('toSnakeCase', () => {
    it('converts PascalCase', () => {
      expect(toSnakeCase('CreateIdentity')).toBe('create_identity');
    });

    it('converts camelCase', () => {
      expect(toSnakeCase('createIdentity')).toBe('create_identity');
    });

    it('handles spaces', () => {
      expect(toSnakeCase('Hello World')).toBe('hello_world');
    });
  });

  describe('toKebabCase', () => {
    it('converts PascalCase', () => {
      expect(toKebabCase('CreateIdentity')).toBe('create-identity');
    });
  });

  describe('toCamelCase', () => {
    it('converts snake_case', () => {
      expect(toCamelCase('create_identity')).toBe('createIdentity');
    });
  });

  describe('toPascalCase', () => {
    it('converts snake_case', () => {
      expect(toPascalCase('create_identity')).toBe('CreateIdentity');
    });
  });
});

describe('nodeToVarName', () => {
  const makeNode = (type: string, label?: string): FlowNode => ({
    id: 'test',
    type: type as FlowNode['type'],
    config: {},
    position: { x: 0, y: 0 },
    label,
  });

  it('produces snake_case for Python', () => {
    expect(nodeToVarName(makeNode('GenerateKeys'), 'python')).toBe('generatekeys');
  });

  it('produces snake_case for Rust', () => {
    expect(nodeToVarName(makeNode('GenerateKeys'), 'rust')).toBe('generatekeys');
  });

  it('produces camelCase for Dart', () => {
    expect(nodeToVarName(makeNode('GenerateKeys'), 'dart')).toBe('generatekeys');
  });

  it('uses label when available', () => {
    expect(nodeToVarName(makeNode('GenerateKeys', 'My Keys'), 'python')).toBe('my_keys');
  });
});

describe('createTemplateEngine', () => {
  it('renders a simple template', () => {
    const engine = createTemplateEngine('python', {
      _preamble: '# {{flow.name}}',
      _epilogue: '# done',
      test_op: '# {{label}} - {{varName}}',
    });

    const ctx = {
      flow: { name: 'Test Flow', network: 'devnet', variables: [] },
      network: 'devnet',
      allNodes: [],
      hasKeyGen: false,
      hasFaucet: false,
      hasTransactions: false,
      hasWait: false,
      hasQuery: false,
      hasData: false,
      manifest: null,
      varName: 'test_var',
      node: { id: '1', type: 'GenerateKeys', config: {}, position: { x: 0, y: 0 } },
      config: {},
      label: 'Generate Keys',
      blockType: 'GenerateKeys',
      operation: undefined,
    } as Parameters<typeof engine.renderPreamble>[0];

    expect(engine.renderPreamble(ctx)).toBe('# Test Flow');
    expect(engine.renderNode('test_op', ctx)).toBe('# Generate Keys - test_var');
  });

  it('falls back for unknown operations', () => {
    const engine = createTemplateEngine('python', {
      _fallback: '    # TODO: Implement {{blockType}}',
    });

    expect(engine.renderFallback('UnknownBlock')).toBe('    # TODO: Implement UnknownBlock');
  });
});
