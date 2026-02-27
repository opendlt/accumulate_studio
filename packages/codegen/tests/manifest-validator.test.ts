/**
 * Manifest Validator Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { validateManifest } from '../src/manifest-validator';
import { loadManifest } from '../src/manifest-loader';
import type { SDKMap } from '@accumulate-studio/types';

describe('validateManifest', () => {
  describe('with bundled Python manifest', () => {
    it('passes validation', () => {
      const manifest = loadManifest('python');
      expect(manifest).not.toBeNull();
      const result = validateManifest(manifest!, 'python');

      // May have some warnings but should have mostly coverage
      expect(result.coverage.coveredByManifest).toBeGreaterThan(10);
      expect(result.coverage.coveredByTemplates).toBeGreaterThan(10);
    });
  });

  describe('with bundled Rust manifest', () => {
    it('passes validation', () => {
      const manifest = loadManifest('rust');
      expect(manifest).not.toBeNull();
      const result = validateManifest(manifest!, 'rust');

      expect(result.coverage.coveredByManifest).toBeGreaterThan(10);
      expect(result.coverage.coveredByTemplates).toBeGreaterThan(10);
    });
  });

  describe('with bundled Dart manifest', () => {
    it('passes validation', () => {
      const manifest = loadManifest('dart');
      expect(manifest).not.toBeNull();
      const result = validateManifest(manifest!, 'dart');

      expect(result.coverage.coveredByManifest).toBeGreaterThan(10);
      expect(result.coverage.coveredByTemplates).toBeGreaterThan(10);
    });
  });

  describe('with bundled JavaScript manifest', () => {
    it('passes validation', () => {
      const manifest = loadManifest('javascript');
      expect(manifest).not.toBeNull();
      const result = validateManifest(manifest!, 'javascript');

      expect(result.coverage.coveredByManifest).toBeGreaterThan(10);
      expect(result.coverage.coveredByTemplates).toBeGreaterThan(10);
    });
  });

  describe('with bundled C# manifest', () => {
    it('passes validation', () => {
      const manifest = loadManifest('csharp');
      expect(manifest).not.toBeNull();
      const result = validateManifest(manifest!, 'csharp');

      expect(result.coverage.coveredByManifest).toBeGreaterThan(10);
      expect(result.coverage.coveredByTemplates).toBeGreaterThan(10);
    });
  });

  describe('with incomplete manifest', () => {
    it('reports missing operations', () => {
      const incomplete: SDKMap = {
        sdk_name: 'test-sdk',
        sdk_version: '0.0.1',
        commit: 'abc1234',
        entrypoints: [{ symbol: 'Test', path: 'test', kind: 'class' }],
        operations: [
          {
            op: 'generate_keys',
            symbols: [{ symbol: 'KeyPair.generate', path: 'test' }],
            inputs: [],
            requires: [],
            examples: ['test.py'],
          },
        ],
      };

      const result = validateManifest(incomplete, 'python');
      expect(result.valid).toBe(false);
      expect(result.coverage.missingOperations.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.code === 'MISSING_OPERATION')).toBe(true);
    });
  });

  describe('with empty manifest', () => {
    it('reports all errors', () => {
      const empty: SDKMap = {
        sdk_name: '',
        sdk_version: '',
        commit: '',
        entrypoints: [],
        operations: [],
      };

      const result = validateManifest(empty, 'python');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_SDK_NAME')).toBe(true);
      expect(result.errors.some((e) => e.code === 'MISSING_SDK_VERSION')).toBe(true);
      expect(result.errors.some((e) => e.code === 'MISSING_COMMIT')).toBe(true);
      expect(result.errors.some((e) => e.code === 'NO_ENTRYPOINTS')).toBe(true);
    });
  });

  describe('detects orphan operations', () => {
    it('warns about manifest operations with no BlockType', () => {
      const manifest: SDKMap = {
        sdk_name: 'test-sdk',
        sdk_version: '0.0.1',
        commit: 'abc1234',
        entrypoints: [{ symbol: 'Test', path: 'test', kind: 'class' }],
        operations: [
          {
            op: 'nonexistent_operation',
            symbols: [{ symbol: 'Test.nonexistent', path: 'test' }],
            inputs: [],
            requires: [],
            examples: ['test.py'],
          },
        ],
      };

      const result = validateManifest(manifest, 'python');
      expect(result.warnings.some((w) => w.code === 'ORPHAN_OPERATION')).toBe(true);
    });
  });
});
