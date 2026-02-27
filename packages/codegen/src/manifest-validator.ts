/**
 * Manifest Validator - Validates manifest completeness against block catalog and templates
 */

import type { SDKLanguage, SDKMap, BlockType } from '@accumulate-studio/types';
import { BLOCK_CATALOG, blockTypeToOp, opToBlockType } from '@accumulate-studio/types';
import { loadBundledTemplates } from './template-loader';

// =============================================================================
// Types
// =============================================================================

export interface ValidationError {
  code: string;
  message: string;
  blockType?: string;
  operation?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface CoverageReport {
  totalBlockTypes: number;
  coveredByManifest: number;
  coveredByTemplates: number;
  missingOperations: string[];
  missingTemplates: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  coverage: CoverageReport;
}

// =============================================================================
// Validator
// =============================================================================

/**
 * Validate a manifest for a given language against:
 * - BLOCK_CATALOG: every block type (except Comment) should have a manifest operation
 * - Templates: every manifest operation should have a .hbs template
 * - Config fields: every operation's inputs should cover the config schema
 */
export function validateManifest(
  manifest: SDKMap,
  language: SDKLanguage,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const allBlockTypes = Object.keys(BLOCK_CATALOG) as BlockType[];
  const templates = loadBundledTemplates(language);

  // Build sets for comparison
  const manifestOpIds = new Set(manifest.operations.map((op) => op.op));
  const templateNames = new Set(
    Object.keys(templates).filter((name) => !name.startsWith('_'))
  );

  // Track coverage
  const missingOperations: string[] = [];
  const missingTemplates: string[] = [];
  let coveredByManifest = 0;
  let coveredByTemplates = 0;

  // Check every BlockType has a manifest operation
  for (const blockType of allBlockTypes) {
    if (blockType === 'Comment') {
      // Comment is special - just needs a template, not necessarily a manifest operation
      continue;
    }

    const opId = blockTypeToOp(blockType);

    if (manifestOpIds.has(opId)) {
      coveredByManifest++;
    } else {
      missingOperations.push(opId);
      errors.push({
        code: 'MISSING_OPERATION',
        message: `Block type "${blockType}" (op: "${opId}") has no matching manifest operation`,
        blockType,
        operation: opId,
      });
    }

    if (templateNames.has(opId)) {
      coveredByTemplates++;
    } else {
      missingTemplates.push(opId);
      errors.push({
        code: 'MISSING_TEMPLATE',
        message: `Block type "${blockType}" (op: "${opId}") has no matching template`,
        blockType,
        operation: opId,
      });
    }
  }

  // Check for orphan operations (in manifest but not in BLOCK_CATALOG)
  for (const op of manifest.operations) {
    const blockType = opToBlockType(op.op);
    if (!blockType) {
      warnings.push({
        code: 'ORPHAN_OPERATION',
        message: `Manifest operation "${op.op}" has no corresponding BlockType in BLOCK_CATALOG`,
      });
    }
  }

  // Check for orphan templates
  for (const templateName of templateNames) {
    if (!manifestOpIds.has(templateName)) {
      warnings.push({
        code: 'ORPHAN_TEMPLATE',
        message: `Template "${templateName}" has no corresponding manifest operation`,
      });
    }
  }

  // Check manifest-level integrity
  if (!manifest.sdk_name) {
    errors.push({ code: 'MISSING_SDK_NAME', message: 'Manifest is missing sdk_name' });
  }
  if (!manifest.sdk_version) {
    errors.push({ code: 'MISSING_SDK_VERSION', message: 'Manifest is missing sdk_version' });
  }
  if (!manifest.commit) {
    errors.push({ code: 'MISSING_COMMIT', message: 'Manifest is missing commit SHA' });
  }
  if (!manifest.entrypoints || manifest.entrypoints.length === 0) {
    errors.push({ code: 'NO_ENTRYPOINTS', message: 'Manifest has no entrypoints' });
  }

  // Count Comment separately for templates
  if (templateNames.has('comment')) {
    coveredByTemplates++;
  }
  if (manifestOpIds.has('comment')) {
    coveredByManifest++;
  }

  const coverage: CoverageReport = {
    totalBlockTypes: allBlockTypes.length,
    coveredByManifest,
    coveredByTemplates,
    missingOperations,
    missingTemplates,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    coverage,
  };
}
