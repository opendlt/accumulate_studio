/**
 * @accumulate-studio/codegen
 *
 * Code generation and export bundle functionality for Accumulate Studio
 */

// =============================================================================
// Bundle Generator
// =============================================================================

export {
  generateBundle,
  generateBundleZip,
  generateBundleAsZip,
  type Bundle,
  type BundleOptions,
  type BundleManifest,
  type BundleFile,
  type FileManifestEntry,
} from './bundle-generator';

// =============================================================================
// Flow Serializer
// =============================================================================

export {
  serializeFlowToYaml,
  parseFlowYaml,
  deserializeYamlToFlow,
  type FlowYaml,
  type FlowYamlBlock,
} from './flow-serializer';

// =============================================================================
// Project Scaffolds
// =============================================================================

export {
  generatePythonProject,
  generateRustProject,
  generateDartProject,
  generateJavaScriptProject,
  generateCSharpProject,
  generateProject,
  PROJECT_GENERATORS,
  type ProjectGenerator,
} from './project-scaffolds';

// =============================================================================
// Assertions Generator
// =============================================================================

export {
  generateAssertions,
  validateAssertions,
  assertAccountExists,
  assertBalanceDelta,
  assertReceiptVerified,
  assertTxStatus,
  type GeneratedAssertions,
  type ExpectedState,
  type AssertionResult,
} from './assertions-generator';

// =============================================================================
// Agent Files
// =============================================================================

export {
  generateAgentTask,
  generateAgentAcceptance,
  generateAgentPackRef,
  generateMCPConfig,
  generateMCPConfigJson,
  generateAllAgentFiles,
  type AgentPackRef,
  type MCPConfig,
  type MCPServerConfig,
  type AgentFiles,
} from './agent-files';

// =============================================================================
// Manifest-Driven Code Generation
// =============================================================================

export {
  generateCodeFromManifest,
  type TemplateContext,
  type CodeMode as ManifestCodeMode,
} from './manifest-generator';

export {
  loadManifest,
  loadAllManifests,
} from './manifest-loader';

export {
  createTemplateEngine,
  toSnakeCase,
  toKebabCase,
  toCamelCase,
  toPascalCase,
  nodeToVarName,
  lookupOperation,
  type TemplateEngine,
} from './template-engine';

export {
  loadBundledTemplates,
} from './template-loader';

export {
  validateManifest,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type CoverageReport,
} from './manifest-validator';
