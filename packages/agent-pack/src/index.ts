/**
 * @accumulate-studio/agent-pack
 *
 * Agent Pack utilities for Accumulate Studio
 *
 * This package provides tools for generating, validating, and working with
 * agent packs - bundles of documentation and metadata that enable AI coding
 * agents to work effectively with Accumulate SDKs.
 */

// =============================================================================
// Generator - Creates complete agent pack folder structures
// =============================================================================

export {
  generateAgentPack,
  type AgentPackFile,
  type AgentPackFiles,
  type GeneratorOptions,
} from './generator';

// =============================================================================
// Validator - Validates agent pack structure and content
// =============================================================================

export {
  validateAgentPack,
  validateManifest,
  validateSDKMap,
  validatePromptsIndex,
  validateAgentsMd,
  validateSafetyMd,
  type ValidationResult,
  type ValidationIssue,
  type ValidationSeverity,
  type AgentPackManifest,
  type PromptsIndex,
} from './validator';

// =============================================================================
// SDK Mapper - Introspects SDKs to generate sdk.map.json
// =============================================================================

export {
  generateSDKMap,
  introspectSDKSource,
  KNOWN_ERRORS,
  OPERATION_MAPPINGS,
  type SDKMapperOptions,
  type IntrospectionResult,
} from './sdk-mapper';

// =============================================================================
// Templates - AGENTS.md and SAFETY.md generators
// =============================================================================

export {
  generateAgentsMd,
  type AgentsTemplateOptions,
} from './templates/AGENTS.md';

export {
  generateSafetyMd,
  type SafetyTemplateOptions,
} from './templates/SAFETY.md';

// =============================================================================
// Prompts - Default prompt templates
// =============================================================================

export {
  createAdiPrompt,
  sendTokensPrompt,
  writeDataPrompt,
  zeroToHeroPrompt,
  getDefaultPrompts,
  generatePromptsIndex,
  generatePromptWithLanguage,
  type PromptTemplate,
  type PromptIndex,
} from './prompts';

// =============================================================================
// Re-export types from @accumulate-studio/types for convenience
// =============================================================================

export type {
  SDKLanguage,
  SDKMap,
  SDKEntryPoint,
  SDKOperation,
  SDKError,
  EntryPointKind,
  OperationCategory,
  SymbolRef,
  InputParam,
  OutputParam,
} from '@accumulate-studio/types';
