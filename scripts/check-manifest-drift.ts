#!/usr/bin/env npx tsx
/**
 * check-manifest-drift.ts
 *
 * CI script that validates all bundled SDK manifests against the block catalog.
 * Exits non-zero if any errors are found.
 *
 * Usage: npx tsx scripts/check-manifest-drift.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { SDKMap, SDKLanguage, BlockType } from '../packages/types/src/index';
import { BLOCK_CATALOG, blockTypeToOp, opToBlockType } from '../packages/types/src/index';

const MANIFESTS_DIR = join(__dirname, '../packages/codegen/src/manifests');
const LANGUAGES: SDKLanguage[] = ['python', 'rust', 'dart'];

interface DriftError {
  code: string;
  message: string;
}

interface DriftWarning {
  code: string;
  message: string;
}

function loadManifestFile(language: SDKLanguage): SDKMap | null {
  try {
    const content = readFileSync(join(MANIFESTS_DIR, `${language}.sdk-manifest.json`), 'utf-8');
    return JSON.parse(content) as SDKMap;
  } catch {
    return null;
  }
}

function validateManifestDrift(manifest: SDKMap, language: SDKLanguage): {
  errors: DriftError[];
  warnings: DriftWarning[];
  coveredOps: number;
  totalBlocks: number;
} {
  const errors: DriftError[] = [];
  const warnings: DriftWarning[] = [];

  const allBlockTypes = Object.keys(BLOCK_CATALOG) as BlockType[];
  const manifestOpIds = new Set(manifest.operations.map((op) => op.op));

  let coveredOps = 0;

  for (const blockType of allBlockTypes) {
    if (blockType === 'Comment') continue;

    const opId = blockTypeToOp(blockType);
    if (manifestOpIds.has(opId)) {
      coveredOps++;
    } else {
      errors.push({
        code: 'MISSING_OPERATION',
        message: `Block "${blockType}" (op: "${opId}") missing from ${language} manifest`,
      });
    }
  }

  // Check for orphan operations
  for (const op of manifest.operations) {
    const blockType = opToBlockType(op.op);
    if (!blockType) {
      warnings.push({
        code: 'ORPHAN_OPERATION',
        message: `Operation "${op.op}" in ${language} manifest has no BlockType`,
      });
    }
  }

  // Structural checks
  if (!manifest.sdk_name) errors.push({ code: 'MISSING_SDK_NAME', message: 'Missing sdk_name' });
  if (!manifest.sdk_version) errors.push({ code: 'MISSING_SDK_VERSION', message: 'Missing sdk_version' });
  if (!manifest.commit) errors.push({ code: 'MISSING_COMMIT', message: 'Missing commit' });
  if (!manifest.entrypoints?.length) errors.push({ code: 'NO_ENTRYPOINTS', message: 'No entrypoints' });

  // Exclude Comment from total since it's skipped
  const totalExcludingComment = allBlockTypes.filter((bt) => bt !== 'Comment').length;
  return { errors, warnings, coveredOps, totalBlocks: totalExcludingComment };
}

// =============================================================================
// Main
// =============================================================================

let hasErrors = false;

console.log('=== SDK Manifest Drift Detection ===\n');

for (const language of LANGUAGES) {
  const manifest = loadManifestFile(language);

  if (!manifest) {
    console.log(`[${language}] SKIP - No manifest found`);
    continue;
  }

  const result = validateManifestDrift(manifest, language);
  const valid = result.errors.length === 0;

  const status = valid ? 'PASS' : 'FAIL';
  console.log(`[${language}] ${status}`);
  console.log(`  SDK: ${manifest.sdk_name} v${manifest.sdk_version} (${manifest.commit})`);
  console.log(`  Coverage: ${result.coveredOps}/${result.totalBlocks} blocks covered`);

  if (result.errors.length > 0) {
    hasErrors = true;
    console.log(`  Errors (${result.errors.length}):`);
    for (const error of result.errors) {
      console.log(`    - [${error.code}] ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`  Warnings (${result.warnings.length}):`);
    for (const warning of result.warnings) {
      console.log(`    - [${warning.code}] ${warning.message}`);
    }
  }

  console.log('');
}

if (hasErrors) {
  console.log('RESULT: FAIL - Manifest drift detected. Fix the issues above.');
  process.exit(1);
} else {
  console.log('RESULT: PASS - All manifests valid.');
  process.exit(0);
}
