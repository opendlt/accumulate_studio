/**
 * SDK Map Types - Machine-readable SDK surface for code generation and agents
 * Based on sdk-map.schema.json
 */

// =============================================================================
// SDK Languages
// =============================================================================

export type SDKLanguage = 'python' | 'javascript' | 'typescript' | 'rust' | 'dart' | 'csharp';

// =============================================================================
// Entry Points
// =============================================================================

export type EntryPointKind = 'class' | 'function' | 'module' | 'namespace';

export interface SDKEntryPoint {
  /** Symbol name (e.g., "Accumulate", "AccumulateClient") */
  symbol: string;
  /** Import path (e.g., "accumulate_client.facade") */
  path: string;
  /** Kind of entry point */
  kind: EntryPointKind;
  /** Documentation string */
  doc?: string;
}

// =============================================================================
// Operations
// =============================================================================

export type OperationCategory =
  | 'identity'
  | 'authority'
  | 'credits'
  | 'account'
  | 'transaction'
  | 'query'
  | 'proof'
  | 'trace'
  | 'utility';

export interface SymbolRef {
  /** Symbol name */
  symbol: string;
  /** File path */
  path: string;
  /** Function/method signature */
  signature?: string;
}

export interface InputParam {
  /** Parameter name */
  name: string;
  /** Type (language-specific) */
  type: string;
  /** Is required */
  required?: boolean;
  /** Description */
  description?: string;
  /** Example value */
  example?: unknown;
}

export interface OutputParam {
  /** Output name */
  name: string;
  /** Type (language-specific) */
  type: string;
  /** Description */
  description?: string;
}

export interface SDKOperation {
  /** Stable operation ID (e.g., "send_tokens", "create_adi") */
  op: string;
  /** Operation category */
  category?: OperationCategory;
  /** SDK symbols implementing this operation */
  symbols: SymbolRef[];
  /** Input parameters */
  inputs: InputParam[];
  /** Output values */
  outputs?: OutputParam[];
  /** Prerequisites (tags that must be satisfied) */
  requires: string[];
  /** Paths to example files */
  examples: string[];
  /** Possible error codes */
  errors?: string[];
}

// =============================================================================
// SDK Errors
// =============================================================================

export interface SDKError {
  /** Error code */
  code: string;
  /** Human-readable hint */
  hint: string;
  /** Additional details */
  details?: string;
}

// =============================================================================
// SDK Map
// =============================================================================

export interface SDKMap {
  /** SDK name (e.g., "opendlt-python-v2v3-sdk") */
  sdk_name: string;
  /** SDK version */
  sdk_version: string;
  /** Commit SHA */
  commit: string;
  /** Generation timestamp */
  generated_at?: string;
  /** SDK entry points */
  entrypoints: SDKEntryPoint[];
  /** Available operations */
  operations: SDKOperation[];
  /** Known error codes */
  errors?: SDKError[];
  /** Additional notes for agents */
  notes?: string;
  /** Code generation templates (optional, for SDK-shipped overrides) */
  code_templates?: CodeTemplate[];
}

// =============================================================================
// Code Generation Templates
// =============================================================================

export interface CodeTemplate {
  /** Template ID */
  id: string;
  /** Target language */
  language: SDKLanguage;
  /** Operation this template generates */
  operation: string;
  /** Template content with placeholders */
  template: string;
  /** Required imports */
  imports: string[];
  /** Dependencies (package names) */
  dependencies?: string[];
}

// =============================================================================
// Generated Code Result
// =============================================================================

export interface GeneratedFile {
  /** File path within the output bundle */
  path: string;
  /** File content */
  content: string;
  /** Is this an entry point file */
  isEntryPoint?: boolean;
}

export interface GeneratedProject {
  /** Target language */
  language: SDKLanguage;
  /** Project files */
  files: GeneratedFile[];
  /** Build/run instructions */
  instructions: {
    install?: string;
    build?: string;
    run: string;
  };
}

// =============================================================================
// SDK Method Signatures (for each language)
// =============================================================================

export interface PythonSDKMethods {
  facade: {
    className: 'Accumulate';
    importPath: 'accumulate_client';
    factoryMethods: ['mainnet', 'testnet', 'devnet', 'local'];
  };
  txBody: {
    className: 'TxBody';
    importPath: 'accumulate_client.convenience';
    methods: Record<string, { signature: string; description: string }>;
  };
  smartSigner: {
    className: 'SmartSigner';
    importPath: 'accumulate_client.convenience';
  };
}

export interface RustSDKMethods {
  facade: {
    typeName: 'AccumulateClient';
    importPath: 'accumulate_client';
    factoryMethods: ['devnet', 'testnet', 'mainnet', 'custom', 'from_env'];
  };
  txBody: {
    moduleName: 'TxBody';
    importPath: 'accumulate_client::helpers';
    methods: Record<string, { signature: string; description: string }>;
  };
  smartSigner: {
    structName: 'SmartSigner';
    importPath: 'accumulate_client::helpers';
  };
}

export interface DartSDKMethods {
  facade: {
    className: 'Accumulate';
    importPath: 'package:accumulate_client/accumulate_client.dart';
    factoryMethods: ['network', 'custom'];
  };
  txBody: {
    className: 'TxBody';
    importPath: 'package:accumulate_client/accumulate_client.dart';
    methods: Record<string, { signature: string; description: string }>;
  };
  txSigner: {
    className: 'TxSigner';
    importPath: 'package:accumulate_client/accumulate_client.dart';
  };
  helper: {
    className: 'AccumulateHelper';
    importPath: 'package:accumulate_client/accumulate_client.dart';
  };
}

// =============================================================================
// Pre-defined SDK Maps (will be populated by codegen package)
// =============================================================================

export const SDK_LANGUAGES: SDKLanguage[] = ['python', 'rust', 'dart', 'javascript', 'csharp'];

export const SDK_DISPLAY_NAMES: Record<SDKLanguage, string> = {
  python: 'Python',
  rust: 'Rust',
  dart: 'Dart',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  csharp: 'C#',
};

export const SDK_FILE_EXTENSIONS: Record<SDKLanguage, string> = {
  python: '.py',
  rust: '.rs',
  dart: '.dart',
  javascript: '.js',
  typescript: '.ts',
  csharp: '.cs',
};

export const SDK_PROJECT_FILES: Record<SDKLanguage, string> = {
  python: 'pyproject.toml',
  rust: 'Cargo.toml',
  dart: 'pubspec.yaml',
  javascript: 'package.json',
  typescript: 'package.json',
  csharp: 'Program.csproj',
};
