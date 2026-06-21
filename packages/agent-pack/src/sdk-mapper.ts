/**
 * SDK Mapper - Builds a representative sdk.map.json from curated, per-language
 * templates. This is NOT introspected from SDK source; the authoritative
 * capability data lives in packages/codegen/src/manifests/*.sdk-manifest.json.
 */

import type {
  SDKLanguage,
  SDKMap,
  SDKEntryPoint,
  SDKOperation,
  SDKError,
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

/**
 * Real published SDK package / import identifiers — the single source of truth
 * for every name agent-pack emits. Verified against the live SDK repos:
 *  - opendlt-javascript-v2v3-sdk/javascript/package.json  → "accumulate.js"
 *  - opendlt-python-v2v3-sdk/unified/pyproject.toml        → pip "accumulate-sdk-opendlt", import "accumulate_client"
 *  - opendlt-rust-v2v3-sdk/unified/Cargo.toml              → crate "accumulate-sdk", lib "accumulate_client"
 *  - opendlt-dart-v2v3-sdk/unified/pubspec.yaml            → "opendlt_accumulate"
 *  - opendlt-c-sharp-v2v3-sdk/src/Acme.Net.Sdk            → PackageId/namespace "Acme.Net.Sdk"
 * (cross-checked against the working import lines in packages/codegen's per-language _preamble.hbs)
 */
export const SDK_PACKAGE_NAMES: Record<SDKLanguage, {
  /** how you install it (pip/npm/cargo/pub/nuget) */
  install: string;
  /** how you import/use it in code */
  importName: string;
}> = {
  python: { install: 'accumulate-sdk-opendlt', importName: 'accumulate_client' },
  rust: { install: 'accumulate-sdk', importName: 'accumulate_client' },
  dart: { install: 'opendlt_accumulate', importName: 'opendlt_accumulate' },
  javascript: { install: 'accumulate.js', importName: 'accumulate.js' },
  typescript: { install: 'accumulate.js', importName: 'accumulate.js' },
  csharp: { install: 'Acme.Net.Sdk', importName: 'Acme.Net.Sdk' },
};

// =============================================================================
// Known Accumulate operations mapping
// =============================================================================

export const OPERATION_MAPPINGS: Record<string, { category: OperationCategory; requires: string[] }> = {
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

export const KNOWN_ERRORS: SDKError[] = [
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
 * Build a representative SDK map from curated, per-language templates.
 * NOT introspected from source — see the module header.
 */
export function generateSDKMap(
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
  const pkg = SDK_PACKAGE_NAMES[language].importName;

  switch (language) {
    case 'python':
      return [
        { symbol: 'Accumulate', path: pkg, kind: 'class', doc: 'Main facade for Accumulate SDK' },
        { symbol: 'TxBody', path: `${pkg}.convenience`, kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: `${pkg}.convenience`, kind: 'class', doc: 'Automatic key resolution signer' },
      ];

    case 'rust':
      return [
        { symbol: 'AccumulateClient', path: pkg, kind: 'class', doc: 'Main client for Accumulate SDK' },
        { symbol: 'TxBody', path: `${pkg}::helpers`, kind: 'module', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: `${pkg}::helpers`, kind: 'class', doc: 'Automatic key resolution signer' },
      ];

    case 'dart':
      return [
        { symbol: 'Accumulate', path: `package:${pkg}/${pkg}.dart`, kind: 'class', doc: 'Main facade for Accumulate SDK' },
        { symbol: 'TxBody', path: `package:${pkg}/${pkg}.dart`, kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'TxSigner', path: `package:${pkg}/${pkg}.dart`, kind: 'class', doc: 'Transaction signer' },
        { symbol: 'AccumulateHelper', path: `package:${pkg}/${pkg}.dart`, kind: 'class', doc: 'Helper utilities' },
      ];

    case 'javascript':
    case 'typescript':
      return [
        { symbol: 'Accumulate', path: pkg, kind: 'class', doc: 'Main facade for Accumulate SDK' },
        { symbol: 'TxBody', path: pkg, kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: pkg, kind: 'class', doc: 'Automatic key resolution signer' },
      ];

    case 'csharp':
      return [
        { symbol: 'AccumulateClient', path: pkg, kind: 'class', doc: 'Main client for Accumulate SDK' },
        { symbol: 'TxBody', path: `${pkg}.Helpers`, kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: `${pkg}.Helpers`, kind: 'class', doc: 'Automatic key resolution signer' },
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
  const pkg = SDK_PACKAGE_NAMES[language].importName;

  switch (language) {
    case 'python':
      return {
        symbol: methodName,
        path: `${pkg}.convenience`,
        signature: `TxBody.${methodName}(...)`,
      };

    case 'rust':
      return {
        symbol: methodName,
        path: `${pkg}::helpers`,
        signature: `TxBody::${methodName}(...)`,
      };

    case 'dart':
      return {
        symbol: methodName,
        path: `package:${pkg}/${pkg}.dart`,
        signature: `TxBody.${methodName}(...)`,
      };

    case 'javascript':
    case 'typescript':
      return {
        symbol: methodName,
        path: pkg,
        signature: `TxBody.${methodName}(...)`,
      };

    case 'csharp':
      return {
        symbol: toPascalCase(opName),
        path: `${pkg}.Helpers`,
        signature: `TxBody.${toPascalCase(opName)}(...)`,
      };

    default:
      return { symbol: methodName, path: 'unknown' };
  }
}

/**
 * Get input parameters for an operation
 */
function getInputsForOperation(opName: string, _language: SDKLanguage): InputParam[] {
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

export default {
  generateSDKMap,
  KNOWN_ERRORS,
  OPERATION_MAPPINGS,
  SDK_PACKAGE_NAMES,
};
