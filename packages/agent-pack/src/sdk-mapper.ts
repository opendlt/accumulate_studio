/**
 * SDK Mapper - Introspects SDK source files to generate sdk.map.json
 */

import type {
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

// =============================================================================
// Configuration
// =============================================================================

export interface SDKMapperOptions {
  /** SDK name */
  sdkName: string;
  /** SDK version */
  sdkVersion: string;
  /** Git commit SHA */
  commit: string;
  /** Additional notes for agents */
  notes?: string;
}

export interface IntrospectionResult {
  entrypoints: SDKEntryPoint[];
  operations: SDKOperation[];
  errors: SDKError[];
}

// =============================================================================
// Language-specific patterns for introspection
// =============================================================================

interface LanguagePatterns {
  classPattern: RegExp;
  functionPattern: RegExp;
  methodPattern: RegExp;
  errorPattern: RegExp;
  importPattern: RegExp;
  docPattern: RegExp;
}

const LANGUAGE_PATTERNS: Record<SDKLanguage, LanguagePatterns> = {
  python: {
    classPattern: /^class\s+(\w+)(?:\([^)]*\))?:/gm,
    functionPattern: /^def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm,
    methodPattern: /^\s+def\s+(\w+)\s*\(self(?:,\s*)?([^)]*)\)(?:\s*->\s*([^:]+))?:/gm,
    errorPattern: /class\s+(\w+Error)\s*\(/g,
    importPattern: /^from\s+([\w.]+)\s+import|^import\s+([\w.]+)/gm,
    docPattern: /"""([^"]+)"""|'''([^']+)'''/g,
  },
  typescript: {
    classPattern: /^export\s+class\s+(\w+)/gm,
    functionPattern: /^export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/gm,
    methodPattern: /^\s+(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/gm,
    errorPattern: /class\s+(\w+Error)\s+extends/g,
    importPattern: /^import\s+.*\s+from\s+['"]([^'"]+)['"]/gm,
    docPattern: /\/\*\*([^*]+)\*\//g,
  },
  javascript: {
    classPattern: /^export\s+class\s+(\w+)/gm,
    functionPattern: /^export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm,
    methodPattern: /^\s+(?:async\s+)?(\w+)\s*\(([^)]*)\)/gm,
    errorPattern: /class\s+(\w+Error)\s+extends/g,
    importPattern: /^import\s+.*\s+from\s+['"]([^'"]+)['"]/gm,
    docPattern: /\/\*\*([^*]+)\*\//g,
  },
  rust: {
    classPattern: /^pub\s+struct\s+(\w+)/gm,
    functionPattern: /^pub\s+(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*->\s*([^{]+))?/gm,
    methodPattern: /^\s+pub\s+(?:async\s+)?fn\s+(\w+)\s*\(&(?:mut\s+)?self(?:,\s*)?([^)]*)\)(?:\s*->\s*([^{]+))?/gm,
    errorPattern: /enum\s+(\w+Error)\s*\{/g,
    importPattern: /^use\s+([\w:]+)/gm,
    docPattern: /\/\/\/([^\n]+)/g,
  },
  dart: {
    classPattern: /^class\s+(\w+)/gm,
    functionPattern: /^(?:Future<[^>]+>|void|\w+)\s+(\w+)\s*\(([^)]*)\)/gm,
    methodPattern: /^\s+(?:Future<[^>]+>|void|\w+)\s+(\w+)\s*\(([^)]*)\)/gm,
    errorPattern: /class\s+(\w+Exception)\s+/g,
    importPattern: /^import\s+['"]([^'"]+)['"]/gm,
    docPattern: /\/\/\/([^\n]+)/g,
  },
  csharp: {
    classPattern: /^public\s+class\s+(\w+)/gm,
    functionPattern: /^public\s+(?:static\s+)?(?:async\s+)?(?:Task<[^>]+>|void|\w+)\s+(\w+)\s*\(([^)]*)\)/gm,
    methodPattern: /^\s+public\s+(?:async\s+)?(?:Task<[^>]+>|void|\w+)\s+(\w+)\s*\(([^)]*)\)/gm,
    errorPattern: /class\s+(\w+Exception)\s*:/g,
    importPattern: /^using\s+([\w.]+)/gm,
    docPattern: /\/\/\/\s*<summary>([^<]+)<\/summary>/g,
  },
};

// =============================================================================
// Known Accumulate operations mapping
// =============================================================================

const OPERATION_MAPPINGS: Record<string, { category: OperationCategory; requires: string[] }> = {
  // Identity operations
  create_identity: { category: 'identity', requires: ['funded-lite-account', 'credits'] },
  create_adi: { category: 'identity', requires: ['funded-lite-account', 'credits'] },
  create_sub_adi: { category: 'identity', requires: ['parent-adi', 'signing-authority'] },

  // Authority operations
  create_key_book: { category: 'authority', requires: ['adi', 'signing-authority'] },
  create_key_page: { category: 'authority', requires: ['key-book', 'signing-authority'] },
  add_key: { category: 'authority', requires: ['key-page', 'signing-authority'] },
  remove_key: { category: 'authority', requires: ['key-page', 'signing-authority'] },
  update_key: { category: 'authority', requires: ['key-page', 'signing-authority'] },
  update_key_page: { category: 'authority', requires: ['key-page', 'signing-authority'] },

  // Credits operations
  add_credits: { category: 'credits', requires: ['acme-balance', 'signing-authority'] },
  burn_credits: { category: 'credits', requires: ['credit-balance', 'signing-authority'] },

  // Account operations
  create_token_account: { category: 'account', requires: ['adi', 'signing-authority'] },
  create_data_account: { category: 'account', requires: ['adi', 'signing-authority'] },
  create_lite_token_account: { category: 'account', requires: ['public-key'] },

  // Transaction operations
  send_tokens: { category: 'transaction', requires: ['token-balance', 'signing-authority'] },
  burn_tokens: { category: 'transaction', requires: ['token-balance', 'signing-authority'] },
  issue_tokens: { category: 'transaction', requires: ['token-issuer', 'signing-authority'] },
  write_data: { category: 'transaction', requires: ['data-account', 'signing-authority'] },

  // Query operations
  query_account: { category: 'query', requires: [] },
  query_transaction: { category: 'query', requires: [] },
  query_chain: { category: 'query', requires: [] },
  query_directory: { category: 'query', requires: [] },
  query_data: { category: 'query', requires: [] },

  // Proof operations
  get_proof: { category: 'proof', requires: [] },
  verify_proof: { category: 'proof', requires: [] },

  // Trace operations
  trace_txn: { category: 'trace', requires: [] },
  trace_chain: { category: 'trace', requires: [] },

  // Utility operations
  faucet: { category: 'utility', requires: [] },
  resolve: { category: 'utility', requires: [] },
  wait_for_txn: { category: 'utility', requires: [] },
};

// =============================================================================
// Known error codes
// =============================================================================

const KNOWN_ERRORS: SDKError[] = [
  { code: 'InsufficientBalance', hint: 'Account does not have enough tokens', details: 'Check balance before transfer' },
  { code: 'InsufficientCredits', hint: 'Account does not have enough credits', details: 'Add credits using AddCredits transaction' },
  { code: 'Unauthorized', hint: 'Signer does not have authority', details: 'Verify the signing key is on an authorized key page' },
  { code: 'AccountNotFound', hint: 'The specified account does not exist', details: 'Check the URL and create the account if needed' },
  { code: 'IdentityAlreadyExists', hint: 'An ADI with this name already exists', details: 'Choose a different ADI name' },
  { code: 'InvalidSignature', hint: 'Transaction signature is invalid', details: 'Verify the private key matches the public key' },
  { code: 'InvalidUrl', hint: 'The URL format is invalid', details: 'URLs must follow acc:// format' },
  { code: 'TransactionFailed', hint: 'Transaction execution failed', details: 'Check transaction details and network status' },
  { code: 'NetworkError', hint: 'Network communication failed', details: 'Check network connectivity and endpoint' },
  { code: 'Timeout', hint: 'Operation timed out', details: 'Retry with increased timeout or check network' },
];

// =============================================================================
// Main SDK Mapper Function
// =============================================================================

/**
 * Generate an SDK map from SDK source files
 * In a real implementation, this would parse actual SDK source files
 * For now, we generate a representative map based on the language
 */
export function generateSDKMap(
  sdkPath: string,
  language: SDKLanguage,
  options?: Partial<SDKMapperOptions>
): SDKMap {
  const sdkName = options?.sdkName || `accumulate-${language}-sdk`;
  const sdkVersion = options?.sdkVersion || '1.0.0';
  const commit = options?.commit || 'unknown';

  // Get language-specific entry points
  const entrypoints = generateLanguageEntryPoints(language);

  // Get operations based on language
  const operations = generateLanguageOperations(language);

  // Get known errors
  const errors = KNOWN_ERRORS;

  return {
    sdk_name: sdkName,
    sdk_version: sdkVersion,
    commit,
    generated_at: new Date().toISOString(),
    entrypoints,
    operations,
    errors,
    notes: options?.notes || `SDK map for ${language}. Use AGENTS.md for detailed guidance.`,
  };
}

/**
 * Generate entry points for a specific language
 */
function generateLanguageEntryPoints(language: SDKLanguage): SDKEntryPoint[] {
  switch (language) {
    case 'python':
      return [
        { symbol: 'Accumulate', path: 'accumulate_client', kind: 'class', doc: 'Main facade for Accumulate SDK' },
        { symbol: 'TxBody', path: 'accumulate_client.convenience', kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: 'accumulate_client.convenience', kind: 'class', doc: 'Automatic key resolution signer' },
      ];

    case 'rust':
      return [
        { symbol: 'AccumulateClient', path: 'accumulate_client', kind: 'class', doc: 'Main client for Accumulate SDK' },
        { symbol: 'TxBody', path: 'accumulate_client::helpers', kind: 'module', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: 'accumulate_client::helpers', kind: 'class', doc: 'Automatic key resolution signer' },
      ];

    case 'dart':
      return [
        { symbol: 'Accumulate', path: 'package:accumulate_client/accumulate_client.dart', kind: 'class', doc: 'Main facade for Accumulate SDK' },
        { symbol: 'TxBody', path: 'package:accumulate_client/accumulate_client.dart', kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'TxSigner', path: 'package:accumulate_client/accumulate_client.dart', kind: 'class', doc: 'Transaction signer' },
        { symbol: 'AccumulateHelper', path: 'package:accumulate_client/accumulate_client.dart', kind: 'class', doc: 'Helper utilities' },
      ];

    case 'javascript':
    case 'typescript':
      return [
        { symbol: 'Accumulate', path: 'accumulate-js', kind: 'class', doc: 'Main facade for Accumulate SDK' },
        { symbol: 'TxBody', path: 'accumulate-js', kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: 'accumulate-js', kind: 'class', doc: 'Automatic key resolution signer' },
      ];

    case 'csharp':
      return [
        { symbol: 'AccumulateClient', path: 'Accumulate.Client', kind: 'class', doc: 'Main client for Accumulate SDK' },
        { symbol: 'TxBody', path: 'Accumulate.Client.Helpers', kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: 'Accumulate.Client.Helpers', kind: 'class', doc: 'Automatic key resolution signer' },
      ];

    default:
      return [];
  }
}

/**
 * Generate operations for a specific language
 */
function generateLanguageOperations(language: SDKLanguage): SDKOperation[] {
  const operations: SDKOperation[] = [];

  for (const [opName, opConfig] of Object.entries(OPERATION_MAPPINGS)) {
    const symbolRef = getSymbolRefForOperation(opName, language);
    const inputs = getInputsForOperation(opName, language);
    const outputs = getOutputsForOperation(opName);

    operations.push({
      op: opName,
      category: opConfig.category,
      symbols: [symbolRef],
      inputs,
      outputs,
      requires: opConfig.requires,
      examples: [`examples/${opName}.${getFileExtension(language)}`],
      errors: getErrorsForOperation(opName),
    });
  }

  return operations;
}

/**
 * Get symbol reference for an operation in a specific language
 */
function getSymbolRefForOperation(opName: string, language: SDKLanguage): SymbolRef {
  const methodName = toCamelCase(opName, language);

  switch (language) {
    case 'python':
      return {
        symbol: methodName,
        path: 'accumulate_client.convenience',
        signature: `TxBody.${methodName}(...)`,
      };

    case 'rust':
      return {
        symbol: methodName,
        path: 'accumulate_client::helpers',
        signature: `TxBody::${methodName}(...)`,
      };

    case 'dart':
      return {
        symbol: methodName,
        path: 'package:accumulate_client/accumulate_client.dart',
        signature: `TxBody.${methodName}(...)`,
      };

    case 'javascript':
    case 'typescript':
      return {
        symbol: methodName,
        path: 'accumulate-js',
        signature: `TxBody.${methodName}(...)`,
      };

    case 'csharp':
      return {
        symbol: toPascalCase(opName),
        path: 'Accumulate.Client.Helpers',
        signature: `TxBody.${toPascalCase(opName)}(...)`,
      };

    default:
      return { symbol: methodName, path: 'unknown' };
  }
}

/**
 * Get input parameters for an operation
 */
function getInputsForOperation(opName: string, language: SDKLanguage): InputParam[] {
  // Define common inputs for operations
  const commonInputs: Record<string, InputParam[]> = {
    send_tokens: [
      { name: 'source', type: 'string', required: true, description: 'Source token account URL' },
      { name: 'destination', type: 'string', required: true, description: 'Destination token account URL' },
      { name: 'amount', type: 'integer', required: true, description: 'Amount in smallest units' },
    ],
    create_identity: [
      { name: 'url', type: 'string', required: true, description: 'ADI URL to create' },
      { name: 'public_key', type: 'bytes', required: true, description: 'Initial authority public key' },
      { name: 'key_book_url', type: 'string', required: false, description: 'Custom key book URL' },
    ],
    create_adi: [
      { name: 'url', type: 'string', required: true, description: 'ADI URL to create' },
      { name: 'public_key', type: 'bytes', required: true, description: 'Initial authority public key' },
    ],
    add_credits: [
      { name: 'recipient', type: 'string', required: true, description: 'Credit recipient URL' },
      { name: 'amount', type: 'integer', required: true, description: 'ACME amount to convert' },
      { name: 'oracle', type: 'integer', required: false, description: 'Oracle price (optional)' },
    ],
    write_data: [
      { name: 'account', type: 'string', required: true, description: 'Data account URL' },
      { name: 'data', type: 'bytes', required: true, description: 'Data to write' },
      { name: 'scratch', type: 'boolean', required: false, description: 'Write to scratch chain' },
    ],
    create_token_account: [
      { name: 'url', type: 'string', required: true, description: 'Token account URL' },
      { name: 'token_url', type: 'string', required: true, description: 'Token type URL' },
    ],
    create_data_account: [
      { name: 'url', type: 'string', required: true, description: 'Data account URL' },
    ],
    query_account: [
      { name: 'url', type: 'string', required: true, description: 'Account URL to query' },
    ],
    query_transaction: [
      { name: 'txid', type: 'string', required: true, description: 'Transaction ID' },
    ],
  };

  return commonInputs[opName] || [
    { name: 'params', type: 'object', required: true, description: 'Operation parameters' },
  ];
}

/**
 * Get output parameters for an operation
 */
function getOutputsForOperation(opName: string): OutputParam[] {
  // Define common outputs for operations
  const commonOutputs: Record<string, OutputParam[]> = {
    send_tokens: [
      { name: 'txid', type: 'string', description: 'Transaction ID' },
      { name: 'hash', type: 'bytes', description: 'Transaction hash' },
    ],
    create_identity: [
      { name: 'txid', type: 'string', description: 'Transaction ID' },
      { name: 'url', type: 'string', description: 'Created ADI URL' },
    ],
    query_account: [
      { name: 'account', type: 'object', description: 'Account data' },
    ],
    query_transaction: [
      { name: 'transaction', type: 'object', description: 'Transaction data' },
      { name: 'status', type: 'string', description: 'Transaction status' },
    ],
  };

  return commonOutputs[opName] || [
    { name: 'result', type: 'object', description: 'Operation result' },
  ];
}

/**
 * Get likely errors for an operation
 */
function getErrorsForOperation(opName: string): string[] {
  const errorMappings: Record<string, string[]> = {
    send_tokens: ['InsufficientBalance', 'Unauthorized', 'AccountNotFound'],
    create_identity: ['InsufficientCredits', 'IdentityAlreadyExists', 'InvalidUrl'],
    create_adi: ['InsufficientCredits', 'IdentityAlreadyExists', 'InvalidUrl'],
    add_credits: ['InsufficientBalance', 'Unauthorized'],
    write_data: ['AccountNotFound', 'Unauthorized'],
    create_token_account: ['AccountNotFound', 'Unauthorized'],
    create_data_account: ['AccountNotFound', 'Unauthorized'],
  };

  return errorMappings[opName] || ['TransactionFailed'];
}

/**
 * Convert operation name to camelCase
 */
function toCamelCase(name: string, language: SDKLanguage): string {
  // Python uses snake_case
  if (language === 'python') {
    return name;
  }

  // Others use camelCase
  return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert operation name to PascalCase (for C#)
 */
function toPascalCase(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Get file extension for a language
 */
function getFileExtension(language: SDKLanguage): string {
  const extensions: Record<SDKLanguage, string> = {
    python: 'py',
    rust: 'rs',
    dart: 'dart',
    javascript: 'js',
    typescript: 'ts',
    csharp: 'cs',
  };
  return extensions[language] || 'txt';
}

/**
 * Introspect actual source files (stub implementation)
 * In a real implementation, this would parse the source files
 */
export async function introspectSDKSource(
  sdkPath: string,
  language: SDKLanguage
): Promise<IntrospectionResult> {
  // This is a stub - in a real implementation, we would:
  // 1. Read source files from sdkPath
  // 2. Parse them using the language patterns
  // 3. Extract classes, functions, methods, and errors

  console.log(`Introspecting ${language} SDK at ${sdkPath}`);

  return {
    entrypoints: generateLanguageEntryPoints(language),
    operations: generateLanguageOperations(language),
    errors: KNOWN_ERRORS,
  };
}

export default {
  generateSDKMap,
  introspectSDKSource,
  KNOWN_ERRORS,
  OPERATION_MAPPINGS,
};
