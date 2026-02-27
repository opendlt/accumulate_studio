/**
 * Agent Pack Validator
 * Validates the structure and content of an agent pack
 */

import type { SDKMap, SDKEntryPoint, SDKOperation, SDKError } from '@accumulate-studio/types';

// =============================================================================
// Validation Result Types
// =============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  /** Severity of the issue */
  severity: ValidationSeverity;
  /** Issue code for programmatic handling */
  code: string;
  /** Human-readable message */
  message: string;
  /** Path to the problematic element */
  path?: string;
  /** Suggested fix */
  suggestion?: string;
}

export interface ValidationResult {
  /** Whether the agent pack is valid */
  valid: boolean;
  /** Total error count */
  errorCount: number;
  /** Total warning count */
  warningCount: number;
  /** List of all issues found */
  issues: ValidationIssue[];
  /** Validated files */
  validatedFiles: string[];
  /** Missing required files */
  missingFiles: string[];
}

// =============================================================================
// Agent Pack Structure Types
// =============================================================================

export interface AgentPackManifest {
  /** Agent pack version */
  version: string;
  /** SDK name */
  sdk_name: string;
  /** SDK version */
  sdk_version: string;
  /** SDK language */
  language: string;
  /** Generation timestamp */
  generated_at: string;
  /** Files in the pack */
  files: {
    agents_md: string;
    safety_md: string;
    sdk_map: string;
    prompts_index: string;
  };
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface PromptsIndex {
  /** Index version */
  version: string;
  /** List of prompts */
  prompts: Array<{
    id: string;
    title: string;
    file: string;
    tags?: string[];
    requires?: string[];
  }>;
}

// =============================================================================
// Required Files
// =============================================================================

const REQUIRED_FILES = [
  'agent-pack.json',
  'AGENTS.md',
  'SAFETY.md',
  'sdk.map.json',
  'prompts/index.json',
];

const RECOMMENDED_FILES = [
  'README.md',
  'examples/',
];

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate an entire agent pack
 */
export function validateAgentPack(packContents: {
  manifest?: AgentPackManifest;
  agentsMd?: string;
  safetyMd?: string;
  sdkMap?: SDKMap;
  promptsIndex?: PromptsIndex;
  existingFiles?: string[];
}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const validatedFiles: string[] = [];
  const missingFiles: string[] = [];

  // Check required files
  const existingFiles = packContents.existingFiles || [];
  for (const requiredFile of REQUIRED_FILES) {
    if (!existingFiles.includes(requiredFile)) {
      missingFiles.push(requiredFile);
      issues.push({
        severity: 'error',
        code: 'MISSING_REQUIRED_FILE',
        message: `Required file is missing: ${requiredFile}`,
        path: requiredFile,
        suggestion: `Create the ${requiredFile} file`,
      });
    } else {
      validatedFiles.push(requiredFile);
    }
  }

  // Check recommended files
  for (const recommendedFile of RECOMMENDED_FILES) {
    if (!existingFiles.some(f => f.startsWith(recommendedFile))) {
      issues.push({
        severity: 'info',
        code: 'MISSING_RECOMMENDED_FILE',
        message: `Recommended file/directory is missing: ${recommendedFile}`,
        path: recommendedFile,
        suggestion: `Consider adding ${recommendedFile}`,
      });
    }
  }

  // Validate manifest (agent-pack.json)
  if (packContents.manifest) {
    issues.push(...validateManifest(packContents.manifest));
  }

  // Validate SDK map
  if (packContents.sdkMap) {
    issues.push(...validateSDKMap(packContents.sdkMap));
  }

  // Validate prompts index
  if (packContents.promptsIndex) {
    issues.push(...validatePromptsIndex(packContents.promptsIndex, existingFiles));
  }

  // Validate AGENTS.md content
  if (packContents.agentsMd) {
    issues.push(...validateAgentsMd(packContents.agentsMd));
  }

  // Validate SAFETY.md content
  if (packContents.safetyMd) {
    issues.push(...validateSafetyMd(packContents.safetyMd));
  }

  // Calculate error/warning counts
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    issues,
    validatedFiles,
    missingFiles,
  };
}

/**
 * Validate the agent-pack.json manifest
 */
export function validateManifest(manifest: AgentPackManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check required fields
  if (!manifest.version) {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_MISSING_VERSION',
      message: 'Manifest is missing version field',
      path: 'agent-pack.json',
      suggestion: 'Add a version field (e.g., "1.0.0")',
    });
  }

  if (!manifest.sdk_name) {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_MISSING_SDK_NAME',
      message: 'Manifest is missing sdk_name field',
      path: 'agent-pack.json',
      suggestion: 'Add the SDK name',
    });
  }

  if (!manifest.language) {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_MISSING_LANGUAGE',
      message: 'Manifest is missing language field',
      path: 'agent-pack.json',
      suggestion: 'Add the SDK language (python, rust, dart, etc.)',
    });
  }

  // Validate language value
  const validLanguages = ['python', 'rust', 'dart', 'javascript', 'typescript', 'csharp'];
  if (manifest.language && !validLanguages.includes(manifest.language)) {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_INVALID_LANGUAGE',
      message: `Invalid language: ${manifest.language}`,
      path: 'agent-pack.json',
      suggestion: `Use one of: ${validLanguages.join(', ')}`,
    });
  }

  // Check files references
  if (manifest.files) {
    const expectedFiles = ['agents_md', 'safety_md', 'sdk_map', 'prompts_index'];
    for (const file of expectedFiles) {
      if (!(file in manifest.files)) {
        issues.push({
          severity: 'warning',
          code: 'MANIFEST_MISSING_FILE_REF',
          message: `Manifest is missing file reference: ${file}`,
          path: 'agent-pack.json',
          suggestion: `Add ${file} to the files object`,
        });
      }
    }
  } else {
    issues.push({
      severity: 'error',
      code: 'MANIFEST_MISSING_FILES',
      message: 'Manifest is missing files object',
      path: 'agent-pack.json',
      suggestion: 'Add a files object with paths to pack files',
    });
  }

  // Check timestamp format
  if (manifest.generated_at) {
    const timestamp = Date.parse(manifest.generated_at);
    if (isNaN(timestamp)) {
      issues.push({
        severity: 'warning',
        code: 'MANIFEST_INVALID_TIMESTAMP',
        message: 'Invalid timestamp format',
        path: 'agent-pack.json',
        suggestion: 'Use ISO 8601 format (e.g., 2024-01-15T12:00:00Z)',
      });
    }
  }

  return issues;
}

/**
 * Validate the sdk.map.json structure
 */
export function validateSDKMap(sdkMap: SDKMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check required fields
  if (!sdkMap.sdk_name) {
    issues.push({
      severity: 'error',
      code: 'SDK_MAP_MISSING_NAME',
      message: 'SDK map is missing sdk_name',
      path: 'sdk.map.json',
    });
  }

  if (!sdkMap.sdk_version) {
    issues.push({
      severity: 'error',
      code: 'SDK_MAP_MISSING_VERSION',
      message: 'SDK map is missing sdk_version',
      path: 'sdk.map.json',
    });
  }

  // Check entrypoints
  if (!sdkMap.entrypoints || sdkMap.entrypoints.length === 0) {
    issues.push({
      severity: 'error',
      code: 'SDK_MAP_NO_ENTRYPOINTS',
      message: 'SDK map has no entry points',
      path: 'sdk.map.json',
      suggestion: 'Add at least one entry point (main facade class/module)',
    });
  } else {
    issues.push(...validateEntryPoints(sdkMap.entrypoints));
  }

  // Check operations
  if (!sdkMap.operations || sdkMap.operations.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'SDK_MAP_NO_OPERATIONS',
      message: 'SDK map has no operations defined',
      path: 'sdk.map.json',
      suggestion: 'Add operations that the SDK supports',
    });
  } else {
    issues.push(...validateOperations(sdkMap.operations));
  }

  // Check errors
  if (!sdkMap.errors || sdkMap.errors.length === 0) {
    issues.push({
      severity: 'info',
      code: 'SDK_MAP_NO_ERRORS',
      message: 'SDK map has no error codes defined',
      path: 'sdk.map.json',
      suggestion: 'Consider adding common error codes and hints',
    });
  } else {
    issues.push(...validateErrors(sdkMap.errors));
  }

  return issues;
}

/**
 * Validate entry points
 */
function validateEntryPoints(entrypoints: SDKEntryPoint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenSymbols = new Set<string>();

  for (const ep of entrypoints) {
    // Check required fields
    if (!ep.symbol) {
      issues.push({
        severity: 'error',
        code: 'ENTRYPOINT_MISSING_SYMBOL',
        message: 'Entry point is missing symbol name',
        path: `sdk.map.json/entrypoints`,
      });
      continue;
    }

    if (!ep.path) {
      issues.push({
        severity: 'error',
        code: 'ENTRYPOINT_MISSING_PATH',
        message: `Entry point ${ep.symbol} is missing import path`,
        path: `sdk.map.json/entrypoints/${ep.symbol}`,
      });
    }

    if (!ep.kind) {
      issues.push({
        severity: 'warning',
        code: 'ENTRYPOINT_MISSING_KIND',
        message: `Entry point ${ep.symbol} is missing kind`,
        path: `sdk.map.json/entrypoints/${ep.symbol}`,
        suggestion: 'Add kind: class, function, module, or namespace',
      });
    }

    // Check for duplicates
    if (seenSymbols.has(ep.symbol)) {
      issues.push({
        severity: 'warning',
        code: 'ENTRYPOINT_DUPLICATE',
        message: `Duplicate entry point symbol: ${ep.symbol}`,
        path: `sdk.map.json/entrypoints/${ep.symbol}`,
      });
    }
    seenSymbols.add(ep.symbol);
  }

  return issues;
}

/**
 * Validate operations
 */
function validateOperations(operations: SDKOperation[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenOps = new Set<string>();

  for (const op of operations) {
    // Check required fields
    if (!op.op) {
      issues.push({
        severity: 'error',
        code: 'OPERATION_MISSING_ID',
        message: 'Operation is missing op identifier',
        path: 'sdk.map.json/operations',
      });
      continue;
    }

    // Check for duplicates
    if (seenOps.has(op.op)) {
      issues.push({
        severity: 'error',
        code: 'OPERATION_DUPLICATE',
        message: `Duplicate operation: ${op.op}`,
        path: `sdk.map.json/operations/${op.op}`,
      });
    }
    seenOps.add(op.op);

    // Check symbols
    if (!op.symbols || op.symbols.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'OPERATION_NO_SYMBOLS',
        message: `Operation ${op.op} has no SDK symbols`,
        path: `sdk.map.json/operations/${op.op}`,
        suggestion: 'Add symbol references to SDK functions/methods',
      });
    }

    // Check inputs
    if (!op.inputs) {
      issues.push({
        severity: 'warning',
        code: 'OPERATION_NO_INPUTS',
        message: `Operation ${op.op} has no inputs defined`,
        path: `sdk.map.json/operations/${op.op}`,
      });
    }

    // Check requires
    if (!op.requires) {
      issues.push({
        severity: 'info',
        code: 'OPERATION_NO_REQUIRES',
        message: `Operation ${op.op} has no prerequisites defined`,
        path: `sdk.map.json/operations/${op.op}`,
        suggestion: 'Add requires array to specify prerequisites',
      });
    }

    // Check examples
    if (!op.examples || op.examples.length === 0) {
      issues.push({
        severity: 'info',
        code: 'OPERATION_NO_EXAMPLES',
        message: `Operation ${op.op} has no example files`,
        path: `sdk.map.json/operations/${op.op}`,
        suggestion: 'Add example file paths',
      });
    }
  }

  return issues;
}

/**
 * Validate errors
 */
function validateErrors(errors: SDKError[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenCodes = new Set<string>();

  for (const error of errors) {
    if (!error.code) {
      issues.push({
        severity: 'error',
        code: 'ERROR_MISSING_CODE',
        message: 'Error definition is missing code',
        path: 'sdk.map.json/errors',
      });
      continue;
    }

    if (!error.hint) {
      issues.push({
        severity: 'warning',
        code: 'ERROR_MISSING_HINT',
        message: `Error ${error.code} is missing hint`,
        path: `sdk.map.json/errors/${error.code}`,
        suggestion: 'Add a human-readable hint for the error',
      });
    }

    if (seenCodes.has(error.code)) {
      issues.push({
        severity: 'warning',
        code: 'ERROR_DUPLICATE',
        message: `Duplicate error code: ${error.code}`,
        path: `sdk.map.json/errors/${error.code}`,
      });
    }
    seenCodes.add(error.code);
  }

  return issues;
}

/**
 * Validate prompts/index.json
 */
export function validatePromptsIndex(
  index: PromptsIndex,
  existingFiles: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!index.version) {
    issues.push({
      severity: 'warning',
      code: 'PROMPTS_MISSING_VERSION',
      message: 'Prompts index is missing version',
      path: 'prompts/index.json',
    });
  }

  if (!index.prompts || index.prompts.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'PROMPTS_EMPTY',
      message: 'Prompts index has no prompts',
      path: 'prompts/index.json',
      suggestion: 'Add prompt definitions',
    });
    return issues;
  }

  const seenIds = new Set<string>();

  for (const prompt of index.prompts) {
    if (!prompt.id) {
      issues.push({
        severity: 'error',
        code: 'PROMPT_MISSING_ID',
        message: 'Prompt is missing id',
        path: 'prompts/index.json',
      });
      continue;
    }

    if (seenIds.has(prompt.id)) {
      issues.push({
        severity: 'error',
        code: 'PROMPT_DUPLICATE_ID',
        message: `Duplicate prompt id: ${prompt.id}`,
        path: `prompts/index.json/${prompt.id}`,
      });
    }
    seenIds.add(prompt.id);

    if (!prompt.title) {
      issues.push({
        severity: 'warning',
        code: 'PROMPT_MISSING_TITLE',
        message: `Prompt ${prompt.id} is missing title`,
        path: `prompts/index.json/${prompt.id}`,
      });
    }

    // Check that referenced file exists
    if (prompt.file && !existingFiles.includes(prompt.file)) {
      issues.push({
        severity: 'error',
        code: 'PROMPT_FILE_MISSING',
        message: `Prompt file not found: ${prompt.file}`,
        path: `prompts/index.json/${prompt.id}`,
        suggestion: `Create the file ${prompt.file}`,
      });
    }
  }

  return issues;
}

/**
 * Validate AGENTS.md content
 */
export function validateAgentsMd(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for required sections
  const requiredSections = [
    { pattern: /##.*Golden Rules/i, name: 'Golden Rules' },
    { pattern: /##.*Quick Start/i, name: 'Quick Start' },
    { pattern: /##.*Operations/i, name: 'Operations Reference' },
    { pattern: /##.*Network/i, name: 'Network Configuration' },
  ];

  for (const section of requiredSections) {
    if (!section.pattern.test(content)) {
      issues.push({
        severity: 'warning',
        code: 'AGENTS_MISSING_SECTION',
        message: `AGENTS.md is missing recommended section: ${section.name}`,
        path: 'AGENTS.md',
        suggestion: `Add a section for ${section.name}`,
      });
    }
  }

  // Check for code examples
  if (!content.includes('```')) {
    issues.push({
      severity: 'warning',
      code: 'AGENTS_NO_CODE_EXAMPLES',
      message: 'AGENTS.md has no code examples',
      path: 'AGENTS.md',
      suggestion: 'Add code examples in fenced code blocks',
    });
  }

  // Check minimum length
  if (content.length < 1000) {
    issues.push({
      severity: 'warning',
      code: 'AGENTS_TOO_SHORT',
      message: 'AGENTS.md seems too short',
      path: 'AGENTS.md',
      suggestion: 'Add more comprehensive documentation',
    });
  }

  return issues;
}

/**
 * Validate SAFETY.md content
 */
export function validateSafetyMd(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for required sections
  const requiredSections = [
    { pattern: /##.*Prohibited/i, name: 'Prohibited Behaviors' },
    { pattern: /##.*Key Storage/i, name: 'Key Storage Patterns' },
    { pattern: /##.*Sign/i, name: 'Signing Defaults' },
    { pattern: /##.*Threshold/i, name: 'Value Thresholds' },
  ];

  for (const section of requiredSections) {
    if (!section.pattern.test(content)) {
      issues.push({
        severity: 'warning',
        code: 'SAFETY_MISSING_SECTION',
        message: `SAFETY.md is missing recommended section: ${section.name}`,
        path: 'SAFETY.md',
        suggestion: `Add a section for ${section.name}`,
      });
    }
  }

  // Check for NEVER patterns (security emphasis)
  if (!content.toLowerCase().includes('never')) {
    issues.push({
      severity: 'warning',
      code: 'SAFETY_NO_PROHIBITIONS',
      message: 'SAFETY.md does not clearly state prohibited behaviors',
      path: 'SAFETY.md',
      suggestion: 'Add clear NEVER statements for dangerous operations',
    });
  }

  // Check minimum length
  if (content.length < 500) {
    issues.push({
      severity: 'warning',
      code: 'SAFETY_TOO_SHORT',
      message: 'SAFETY.md seems too short',
      path: 'SAFETY.md',
      suggestion: 'Add more comprehensive safety guidelines',
    });
  }

  return issues;
}

export default {
  validateAgentPack,
  validateManifest,
  validateSDKMap,
  validatePromptsIndex,
  validateAgentsMd,
  validateSafetyMd,
};
