/**
 * Manifest-Driven Code Generator
 *
 * Unified generator that uses Handlebars templates + manifest data
 * to generate code for Python, Rust, and Dart.
 */

import type {
  Flow,
  FlowNode,
  SDKLanguage,
  SDKMap,
  SDKOperation,
  BlockType,
  FlowVariable,
} from '@accumulate-studio/types';
import { topologicalSort, blockTypeToOp } from '@accumulate-studio/types';
import { createTemplateEngine, nodeToVarName, lookupOperation } from './template-engine';
import { loadBundledTemplates } from './template-loader';

// =============================================================================
// Types
// =============================================================================

export type CodeMode = 'sdk' | 'cli';

export interface TemplateContext {
  // Per-node
  varName: string;
  node: FlowNode;
  config: Record<string, unknown>;
  label: string;
  blockType: string;

  // Per-flow
  flow: { name: string; description?: string; network: string; variables: FlowVariable[] };
  network: string;
  allNodes: FlowNode[];

  // Feature flags
  hasKeyGen: boolean;
  hasFaucet: boolean;
  hasTransactions: boolean;
  hasWait: boolean;
  hasQuery: boolean;
  hasData: boolean;

  // Manifest data
  manifest: SDKMap | null;
  operation: SDKOperation | undefined;

  // Pre-computed template variables for specific block types
  [key: string]: unknown;
}

// =============================================================================
// Transaction type check
// =============================================================================

const TX_TYPES = new Set<string>([
  'CreateIdentity', 'CreateKeyBook', 'CreateKeyPage', 'CreateTokenAccount',
  'CreateDataAccount', 'CreateToken', 'SendTokens', 'IssueTokens', 'BurnTokens',
  'AddCredits', 'TransferCredits', 'BurnCredits', 'WriteData', 'WriteDataTo',
  'UpdateKeyPage', 'UpdateKey', 'LockAccount', 'UpdateAccountAuth',
]);

function isTransactionType(type: string): boolean {
  return TX_TYPES.has(type);
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Generate code from a flow using manifest-driven templates.
 *
 * For 'cli' mode, this delegates to a simple bash generator.
 * For 'sdk' mode, it uses Handlebars templates + manifest data.
 */
export function generateCodeFromManifest(
  flow: Flow,
  language: SDKLanguage,
  mode: CodeMode,
  manifest: SDKMap | null,
): string {
  if (mode === 'cli') {
    return generateCLI(flow, language);
  }

  const sortedNodes = topologicalSort(flow);
  const templates = loadBundledTemplates(language);
  const engine = createTemplateEngine(language, templates);
  const network = flow.network ?? 'kermit';

  // Analyze node types to set feature flags
  let hasKeyGen = false;
  let hasFaucet = false;
  let hasTransactions = false;
  let hasWait = false;
  let hasQuery = false;
  let hasData = false;

  for (const node of sortedNodes) {
    if (node.type === 'GenerateKeys') hasKeyGen = true;
    if (node.type === 'Faucet') hasFaucet = true;
    if (node.type === 'WaitForBalance' || node.type === 'WaitForCredits') hasWait = true;
    if (node.type === 'QueryAccount') hasQuery = true;
    if (node.type === 'WriteData' || node.type === 'WriteDataTo') hasData = true;
    if (isTransactionType(node.type)) hasTransactions = true;
  }

  // Build the base context (shared across all templates)
  const baseContext: Omit<TemplateContext, 'varName' | 'node' | 'config' | 'label' | 'blockType' | 'operation'> = {
    flow: {
      name: flow.name,
      description: flow.description,
      network,
      variables: flow.variables,
    },
    network,
    allNodes: sortedNodes,
    hasKeyGen,
    hasFaucet,
    hasTransactions,
    hasWait,
    hasQuery,
    hasData,
    manifest,
  };

  // Build flow variable definitions with sensible defaults
  const FLOW_VAR_DEFAULTS_PYTHON: Record<string, string> = {
    ADI_NAME: 'f"adi-{int(time.time())}"',
    TOKEN_SYMBOL: '"TKN"',
    DATA_CONTENT: '"48656c6c6f20576f726c64"',  // hex("Hello World")
    TRANSFER_AMOUNT: '"100000000"',
    INITIAL_ISSUE_AMOUNT: '"100000000000"',
  };
  const FLOW_VAR_DEFAULTS_DART: Record<string, string> = {
    ADI_NAME: "'adi-${DateTime.now().millisecondsSinceEpoch ~/ 1000}'",
    TOKEN_SYMBOL: "'TKN'",
    DATA_CONTENT: "'48656c6c6f20576f726c64'",  // hex("Hello World")
    TRANSFER_AMOUNT: "'100000000'",
    INITIAL_ISSUE_AMOUNT: "'100000000000'",
  };
  const FLOW_VAR_DEFAULTS_RUST: Record<string, string> = {
    ADI_NAME: 'format!("adi-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs())',
    TOKEN_SYMBOL: '"TKN".to_string()',
    DATA_CONTENT: '"48656c6c6f20576f726c64".to_string()',  // hex("Hello World")
    TRANSFER_AMOUNT: '"100000000".to_string()',
    INITIAL_ISSUE_AMOUNT: '"100000000000".to_string()',
  };
  const FLOW_VAR_DEFAULTS_JAVASCRIPT: Record<string, string> = {
    ADI_NAME: '`adi-${Math.floor(Date.now() / 1000)}`',
    TOKEN_SYMBOL: '"TKN"',
    DATA_CONTENT: '"48656c6c6f20576f726c64"',  // hex("Hello World")
    TRANSFER_AMOUNT: '"100000000"',
    INITIAL_ISSUE_AMOUNT: '"100000000000"',
  };
  const FLOW_VAR_DEFAULTS_CSHARP: Record<string, string> = {
    ADI_NAME: '$"adi-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}"',
    TOKEN_SYMBOL: '"TKN"',
    DATA_CONTENT: '"48656c6c6f20576f726c64"',  // hex("Hello World")
    TRANSFER_AMOUNT: '"100000000"',
    INITIAL_ISSUE_AMOUNT: '"100000000000"',
  };
  const flowVarDefs = (flow.variables || []).map((v) => ({
    name: v.name,
    pythonName: v.name.toLowerCase(),
    defaultValue: FLOW_VAR_DEFAULTS_PYTHON[v.name] || `"${v.default || ''}"`,
    dartDefaultValue: FLOW_VAR_DEFAULTS_DART[v.name] || `'${v.default || ''}'`,
    rustDefaultValue: FLOW_VAR_DEFAULTS_RUST[v.name] || `"${v.default || ''}".to_string()`,
    jsDefaultValue: FLOW_VAR_DEFAULTS_JAVASCRIPT[v.name] || `"${v.default || ''}"`,
    csharpDefaultValue: FLOW_VAR_DEFAULTS_CSHARP[v.name] || `"${v.default || ''}"`,
    description: v.description || '',
  }));
  const hasFlowVars = flowVarDefs.length > 0;

  // Render preamble
  const preambleContext = {
    ...baseContext,
    varName: '',
    node: sortedNodes[0] ?? ({} as FlowNode),
    config: {},
    label: '',
    blockType: '',
    operation: undefined,
    flowVarDefs,
    hasFlowVars,
  } as unknown as TemplateContext;

  const preamble = engine.renderPreamble(preambleContext);

  // Build a map from block IDs to their computed variable names
  // This is used by resolveConfigRefs to resolve {{blockId.outputName}} references
  const varNameMap = new Map<string, string>();
  for (const node of sortedNodes) {
    varNameMap.set(node.id, nodeToVarName(node, language));
  }

  // Track the most recent GenerateKeys node's varName for transaction templates
  let lastKeyGenVarName = '';
  // Track the FIRST GenerateKeys node (for SendTokens: first=funded sender, last=recipient)
  let firstKeyGenVarName = '';
  // Track the most recent CreateIdentity node's varName for sub-ADI operations
  let lastCreateIdentityVarName = '';
  // Track the most recent CreateIdentity node ID for cross-node config injection
  // After CreateIdentity, subsequent AddCredits/WaitForCredits/transactions
  // should target the ADI key page, not the lite identity
  let lastCreateIdentityNodeId = '';
  // Track preceding node varNames for smart defaults in action palette flows
  let lastCreateTokenVarName = '';
  let lastCreateTokenAccountVarName = '';
  let lastCreateDataAccountVarName = '';

  // Render each node
  const nodeOutputs: string[] = [];

  for (const node of sortedNodes) {
    const varName = nodeToVarName(node, language);
    const opId = blockTypeToOp(node.type as BlockType);
    const rawConfig = { ...((node.config as Record<string, unknown>) || {}) };

    // Auto-inject ADI key page references for blocks after CreateIdentity
    // Action palette flows insert prerequisite blocks with empty configs;
    // without this, defaults fall back to the lite identity instead of ADI key page
    if (lastCreateIdentityNodeId) {
      const keyPageRef = `{{${lastCreateIdentityNodeId}.adiUrl}}/book/1`;
      if (node.type === 'AddCredits' && !rawConfig.recipient) {
        rawConfig.recipient = keyPageRef;
      }
      if (node.type === 'WaitForCredits' && !rawConfig.account) {
        rawConfig.account = keyPageRef;
      }
      if (isTransactionType(node.type) && node.type !== 'CreateIdentity' && node.type !== 'AddCredits' && !rawConfig.signerUrl) {
        rawConfig.signerUrl = keyPageRef;
      }
    }

    const config = resolveConfigRefs(rawConfig, language, varNameMap);
    const operation = lookupOperation(manifest, opId);

    // Track GenerateKeys nodes for keypair references
    if (node.type === 'GenerateKeys') {
      if (!firstKeyGenVarName) firstKeyGenVarName = varName;
      lastKeyGenVarName = varName;
    }

    // keyVarName: the variable prefix for the keypair/signer to use
    // If the node config specifies an explicit keyVarName reference (e.g., '{{generate_keys}}'),
    // use that. Otherwise, default to the most recent GenerateKeys node.
    let keyVarName: string;
    if (node.type === 'GenerateKeys') {
      keyVarName = varName;
    } else if (config.keyVarName && typeof config.keyVarName === 'string') {
      // Explicit override: resolved reference to a specific GenerateKeys node
      keyVarName = String(config.keyVarName);
    } else if ((node.type === 'SendTokens' || node.type === 'WriteDataTo' || node.type === 'UpdateKeyPage' || node.type === 'UpdateKey' || node.type === 'CreateKeyPage') && firstKeyGenVarName && firstKeyGenVarName !== lastKeyGenVarName) {
      // These actions with multiple GenerateKeys: use first keypair (the funded/authorized one)
      keyVarName = firstKeyGenVarName;
    } else {
      keyVarName = lastKeyGenVarName || varName;
    }

    // Build per-node context with pre-computed template variables
    const nodeContext = {
      ...baseContext,
      varName,
      keyVarName,
      node,
      config,
      label: node.label || node.type,
      blockType: node.type,
      operation,
      // Pre-compute common template variables based on block type
      ...computeNodeVars(node, config, varName, language, keyVarName, lastCreateIdentityVarName, {
        firstKeyGenVarName, lastKeyGenVarName,
        lastCreateTokenVarName, lastCreateTokenAccountVarName, lastCreateDataAccountVarName,
      }),
    } as unknown as TemplateContext;

    const rendered = engine.renderNode(opId, nodeContext);
    nodeOutputs.push(rendered);

    // Track CreateIdentity for subsequent sub-ADI operations
    if (node.type === 'CreateIdentity') {
      lastCreateIdentityVarName = varName;
      lastCreateIdentityNodeId = node.id;
    }
    // Track CreateToken/CreateTokenAccount/CreateDataAccount for smart defaults
    if (node.type === 'CreateToken') lastCreateTokenVarName = varName;
    if (node.type === 'CreateTokenAccount') lastCreateTokenAccountVarName = varName;
    if (node.type === 'CreateDataAccount') lastCreateDataAccountVarName = varName;
  }

  // Render epilogue
  const epilogue = engine.renderEpilogue(preambleContext);

  // Combine
  const sections = [preamble];
  for (const output of nodeOutputs) {
    sections.push('');
    sections.push(output);
  }
  sections.push(epilogue);

  return sections.join('\n');
}

// =============================================================================
// Cross-block reference resolution
// =============================================================================

/**
 * Output name → variable suffix mapping (Python).
 * YAML templates reference outputs as {{blockId.outputName}}.
 * These get resolved to the language-specific variable generated by that block.
 */
const OUTPUT_VAR_SUFFIXES_PYTHON: Record<string, string> = {
  liteTokenAccount: '_lta',
  liteIdentity: '_lid',
  publicKeyHash: '_pub_hash',
  publicKey: '_kp.public_key_bytes().hex()',
  keypair: '_kp',
  varName: '',  // Resolves to just the block's varName prefix (used for keyVarName references)
  adiUrl: '_url',
  keyBookUrl: '_url',
  keyPageUrl: '_url',
  tokenAccountUrl: '_url',
  dataAccountUrl: '_url',
  tokenUrl: '_url',
  txHash: '_result.txid',
  url: '_url',
};

/** Output name → variable suffix mapping (Rust). */
const OUTPUT_VAR_SUFFIXES_RUST: Record<string, string> = {
  liteTokenAccount: '_lta',
  liteIdentity: '_lid',
  publicKeyHash: '_pub_hash',
  publicKey: '_pub_key',
  keypair: '_signer',
  adiUrl: '_url',               // URL string variable (not TxResult)
  keyBookUrl: '_url',
  keyPageUrl: '_url',
  tokenAccountUrl: '_url',
  dataAccountUrl: '_url',
  tokenUrl: '_url',
  txHash: '_result.txid',
  varName: '',
  url: '_url',
};

/** Output name → variable suffix mapping (Dart). */
const OUTPUT_VAR_SUFFIXES_DART: Record<string, string> = {
  liteTokenAccount: 'Lta',        // camelCase: generateKeysLta
  liteIdentity: 'Lid',            // camelCase: generateKeysLid
  publicKeyHash: 'PubHash',       // camelCase: generateKeysPubHash
  publicKey: 'PubKey',            // camelCase: generateKeysPubKey
  keypair: 'Kp',                  // camelCase: generateKeysKp
  adiUrl: 'Url',                  // URL string variable (not TxResult)
  keyBookUrl: 'Url',
  keyPageUrl: 'Url',
  tokenAccountUrl: 'Url',
  dataAccountUrl: 'Url',
  tokenUrl: 'Url',
  txHash: 'Result.txid',
  varName: '',
  url: 'Url',
};

/** Output name → variable suffix mapping (JavaScript). */
const OUTPUT_VAR_SUFFIXES_JAVASCRIPT: Record<string, string> = {
  liteTokenAccount: 'Lta',        // camelCase: generateKeysLta
  liteIdentity: 'Lid',            // camelCase: generateKeysLid
  publicKeyHash: 'PubHash',       // camelCase: generateKeysPubHash
  publicKey: 'PubKey',            // camelCase: generateKeysPubKey
  keypair: 'Kp',                  // camelCase: generateKeysKp
  adiUrl: 'Url',                  // URL string variable: createAdiUrl
  keyBookUrl: 'Url',
  keyPageUrl: 'Url',
  tokenAccountUrl: 'Url',
  dataAccountUrl: 'Url',
  tokenUrl: 'Url',
  txHash: 'Result.txid',
  varName: '',
  url: 'Url',
};

/** Output name → variable suffix mapping (C#). */
const OUTPUT_VAR_SUFFIXES_CSHARP: Record<string, string> = {
  liteTokenAccount: 'Lta',        // camelCase: generateKeysLta
  liteIdentity: 'Lid',            // camelCase: generateKeysLid
  publicKeyHash: 'PubHash',       // camelCase: generateKeysPubHash
  publicKey: 'PubKey',            // camelCase: generateKeysPubKey
  keypair: 'Kp',                  // camelCase: generateKeysKp
  adiUrl: 'Url',                  // URL string variable (not TxResult)
  keyBookUrl: 'Url',
  keyPageUrl: 'Url',
  tokenAccountUrl: 'Url',
  dataAccountUrl: 'Url',
  tokenUrl: 'Url',
  txHash: 'Result.TxId',          // C# uses PascalCase .TxId
  varName: '',
  url: 'Url',
};

/** Outputs that produce URL strings and should be wrapped with str() in Python */
const URL_OUTPUTS = new Set([
  'liteTokenAccount', 'liteIdentity', 'adiUrl', 'keyBookUrl',
  'keyPageUrl', 'tokenAccountUrl', 'dataAccountUrl', 'tokenUrl', 'url',
]);

/** Select the correct suffix map for a language */
function getSuffixMap(language: SDKLanguage): Record<string, string> {
  if (language === 'rust') return OUTPUT_VAR_SUFFIXES_RUST;
  if (language === 'dart') return OUTPUT_VAR_SUFFIXES_DART;
  if (language === 'javascript') return OUTPUT_VAR_SUFFIXES_JAVASCRIPT;
  if (language === 'csharp') return OUTPUT_VAR_SUFFIXES_CSHARP;
  return OUTPUT_VAR_SUFFIXES_PYTHON;
}

/**
 * Resolve {{blockId.outputName}} references in a config value string
 * to Python variable expressions.
 *
 * If the entire value is a single reference like "{{generate_keys.liteTokenAccount}}",
 * it resolves to a Python expression (e.g., str(generate_keys_lta)).
 *
 * If the value contains references mixed with literal text (e.g., "acc://{{ADI_NAME}}.acme"),
 * the {{VAR}} parts are resolved as f-string expressions.
 */
function resolveRef(value: string, language: SDKLanguage, varNameMap: Map<string, string>): string {
  /**
   * Resolve a block ID to its Python variable name prefix.
   * Uses the varNameMap (built from nodeToVarName) for correct naming.
   */
  function blockIdToVarName(blockId: string): string {
    return varNameMap.get(blockId) ?? blockId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  const suffixMap = getSuffixMap(language);

  // Check if the entire string is exactly one dotted reference (no surrounding text)
  const fullRefMatch = value.match(/^\{\{(\w+)\.(\w+)\}\}$/);
  if (fullRefMatch) {
    const [, blockId, outputName] = fullRefMatch;
    const blockVarName = blockIdToVarName(blockId);

    const suffix = suffixMap[outputName];
    const varExpr = suffix !== undefined ? `${blockVarName}${suffix}` : `${blockVarName}_${outputName}`;

    // URL outputs should be wrapped for Python (str()), C# (.String()), Dart (.toString())
    if (URL_OUTPUTS.has(outputName)) {
      if (language === 'python') return `str(${varExpr})`;
      if (language === 'csharp') {
        // Only Url objects (liteIdentity, liteTokenAccount) need .String()
        // Other URL outputs are stored as string variables and don't need wrapping
        if (outputName === 'liteIdentity' || outputName === 'liteTokenAccount') {
          return `${varExpr}.String()`;
        }
        return varExpr;
      }
      if (language === 'dart') return `${varExpr}.toString()`;
    }
    return varExpr;
  }

  // Check if the entire string is exactly one flow variable {{VAR}} (no dot)
  const fullFlowVarMatch = value.match(/^\{\{([A-Z][A-Z0-9_]*)\}\}$/);
  if (fullFlowVarMatch) {
    return fullFlowVarMatch[1].toLowerCase();
  }

  // Check if string contains any resolvable references
  const hasDottedRefs = /\{\{\w+\.\w+\}\}/.test(value);
  const hasFlowVars = /\{\{[A-Z][A-Z0-9_]*\}\}/.test(value);
  if (!hasDottedRefs && !hasFlowVars) return value;

  // Partial references within a larger string: resolve inline and produce f-string for Python
  let resolved = value;

  // Resolve dotted references {{blockId.outputName}}
  resolved = resolved.replace(
    /\{\{(\w+)\.(\w+)\}\}/g,
    (_match, blockId: string, outputName: string) => {
      const blockVarName = blockIdToVarName(blockId);
      const suffix = suffixMap[outputName];
      const varExpr = suffix !== undefined ? `${blockVarName}${suffix}` : `${blockVarName}_${outputName}`;
      if (language === 'python' && URL_OUTPUTS.has(outputName)) {
        return `{str(${varExpr})}`;
      }
      if (language === 'csharp') {
        // Url objects (liteIdentity, liteTokenAccount) need .String() inside interpolation
        if (outputName === 'liteIdentity' || outputName === 'liteTokenAccount') {
          return `{${varExpr}.String()}`;
        }
        return `{${varExpr}}`;
      }
      if (language === 'dart') return `\${${varExpr}}`;
      if (language === 'javascript') return `\${${varExpr}}`;
      return `{${varExpr}}`;
    },
  );

  // Resolve flow variables {{FLOW_VAR}}
  resolved = resolved.replace(
    /\{\{([A-Z][A-Z0-9_]*)\}\}/g,
    (_match, flowVarName: string) => {
      if (language === 'dart') return `\${${flowVarName.toLowerCase()}}`;
      if (language === 'javascript') return `\${${flowVarName.toLowerCase()}}`;
      return `{${flowVarName.toLowerCase()}}`;
    },
  );

  if (language === 'python') {
    return `f"${resolved}"`;
  }

  // For JavaScript: wrap in backtick template literal
  if (language === 'javascript') {
    return `\`${resolved}\``;
  }

  // For Dart: wrap in single-quoted string literal (supports ${...} interpolation)
  if (language === 'dart') {
    return `'${resolved}'`;
  }

  // For Rust: convert {var} patterns to format!("...", var1, var2)
  if (language === 'rust') {
    const rustVarPattern = /\{([a-z_]\w*)\}/gi;
    const rustVars: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = rustVarPattern.exec(resolved)) !== null) {
      rustVars.push(m[1]);
    }
    if (rustVars.length > 0) {
      const fmtStr = resolved.replace(/\{[a-z_]\w*\}/gi, '{}');
      return `format!("${fmtStr}", ${rustVars.join(', ')})`;
    }
  }

  // For C#: wrap in $"..." interpolated string
  if (language === 'csharp') {
    return `$"${resolved}"`;
  }

  return resolved;
}

/**
 * Deep-resolve all {{blockId.outputName}} references in config values.
 * Uses varNameMap to resolve block IDs to their computed variable names.
 */
function resolveConfigRefs(
  config: Record<string, unknown>,
  language: SDKLanguage,
  varNameMap: Map<string, string>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(config)) {
    if (typeof val === 'string') {
      resolved[key] = resolveRef(val, language, varNameMap);
    } else if (Array.isArray(val)) {
      resolved[key] = val.map((item) => {
        if (typeof item === 'string') return resolveRef(item, language, varNameMap);
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return resolveConfigRefs(item as Record<string, unknown>, language, varNameMap);
        }
        return item;
      });
    } else if (val && typeof val === 'object') {
      resolved[key] = resolveConfigRefs(val as Record<string, unknown>, language, varNameMap);
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

// =============================================================================
// Pre-computed template variables for each block type
// =============================================================================

function computeNodeVars(
  node: FlowNode,
  config: Record<string, unknown>,
  varName: string,
  language: SDKLanguage,
  keyVarName?: string,
  createIdentityVarName?: string,
  tracker?: {
    firstKeyGenVarName: string;
    lastKeyGenVarName: string;
    lastCreateTokenVarName: string;
    lastCreateTokenAccountVarName: string;
    lastCreateDataAccountVarName: string;
  },
): Record<string, unknown> {
  // keyVarName defaults to varName if not provided
  const kv = keyVarName || varName;
  const vars: Record<string, unknown> = {};
  const isRust = language === 'rust';
  const isDart = language === 'dart';
  const isJs = language === 'javascript';
  const isRawLang = language !== 'python'; // Only Python uses str() wrapping; all others use raw variable references

  // Language-aware variable suffixes
  const sfx = getSuffixMap(language);
  const ltaSuffix = sfx.liteTokenAccount || '_lta';   // Dart/JS: 'Lta', Python: '_lta', Rust: '_lta'
  const lidSuffix = sfx.liteIdentity || '_lid';        // Dart/JS: 'Lid', Python: '_lid', Rust: '_lid'
  const pubHashSuffix = sfx.publicKeyHash || '_pub_hash'; // Dart/JS: 'PubHash', Python: '_pub_hash'

  // Helper: for Python, wrap variable references with str(); for C#, append .String(); for Dart, .toString(); for Rust/JS, return raw
  const isCSharp = language === 'csharp';
  const varRef = (expr: string) => {
    if (language === 'python') return `str(${expr})`;
    if (isCSharp) return `${expr}.String()`;
    if (isDart) return `${expr}.toString()`;
    return expr;
  };
  // Helper: check if a value is a resolved variable reference (or f-string expression)
  const isVarRef = (val: string) => {
    // All-uppercase strings are never variable references — they're literal constants/symbols (e.g., MYT, ACME)
    if (/^[A-Z][A-Z0-9]*$/.test(val)) return false;
    if (language === 'python') return val.startsWith('str(') || val.startsWith('f"') || val.startsWith("f'") || /^[a-z_][a-z0-9_]*$/.test(val);
    if (isCSharp) return val.startsWith('$"') || val.endsWith('.String()') || /^[a-z_]\w*$/i.test(val);
    if (isDart) return val.endsWith('.toString()') || val.includes('${') || /^[a-z_]\w*$/i.test(val);
    if (isRust) return val.startsWith('format!(') || /^[a-z_]\w*$/i.test(val);
    if (isJs) return val.startsWith('`') || /^[a-z_]\w*$/i.test(val);
    return /^[a-z_]\w*$/i.test(val);
  };
  // Helper: quote a string literal in the target language
  const quoteLiteral = (s: string) => isDart ? `'${s}'` : `"${s}"`;

  // Helper: build a sub-path URL expression referencing a CreateIdentity node's Url variable
  const ciUrlSuffix = isRust ? '_url' : (language === 'python' ? '_url' : 'Url');
  const subPathUrlExpr = (ciVarName: string, subPath: string): string => {
    const urlVar = `${ciVarName}${ciUrlSuffix}`;
    if (isRust) return `format!("{}/${subPath}", ${urlVar})`;
    if (isJs) return `\`\${${urlVar}}/${subPath}\``;
    if (isDart) return `'\${${urlVar}}/${subPath}'`;
    if (isCSharp) return `$"{${urlVar}}/${subPath}"`;
    return `f"{${urlVar}}/${subPath}"`;  // Python
  };

  /**
   * Produce a principal/URL parameter expression.
   * For C#: always returns a valid string expression (quoted literal or var.String()).
   * For Dart: always returns a valid string expression (single-quoted literal or var.toString()).
   * For other languages: returns raw value (template adds quotes).
   */
  const principalExpr = (val: unknown, defaultLiteral: string, defaultVarExpr?: string): string => {
    if (!val) {
      if (defaultVarExpr) return varRef(defaultVarExpr);
      if (isCSharp) return `"${defaultLiteral}"`;
      if (isDart) return `'${defaultLiteral}'`;
      return defaultLiteral;
    }
    const s = String(val);
    if (isVarRef(s)) return s;
    if (isCSharp) return `"${s}"`;
    if (isDart) return `'${s}'`;
    return s;
  };

  switch (node.type) {
    case 'Faucet': {
      const acct = config.account;
      if (!acct) {
        vars.faucetAccount = varRef(`${kv}${ltaSuffix}`);
      } else if (typeof acct === 'string' && (isVarRef(acct) || /^[a-z_]\w*$/i.test(acct))) {
        vars.faucetAccount = acct;
      } else {
        vars.faucetAccount = quoteLiteral(String(acct));
      }
      vars.faucetTimes = config.times || 1;
      break;
    }

    case 'WaitForBalance': {
      const waitAccount = config.account || varRef(`${kv}${ltaSuffix}`);
      vars.waitAccount = typeof waitAccount === 'string' && isVarRef(waitAccount)
        ? waitAccount
        : quoteLiteral(String(waitAccount));
      vars.minBalance = config.minBalance || '10000000';
      break;
    }

    case 'WaitForCredits': {
      let waitCreditAccount: string | unknown;
      if (config.account) {
        waitCreditAccount = config.account;
      } else if (createIdentityVarName) {
        // After CreateIdentity: wait for credits on the key page, not lite identity
        waitCreditAccount = subPathUrlExpr(createIdentityVarName, 'book/1');
      } else {
        waitCreditAccount = varRef(`${kv}${lidSuffix}`);
      }
      vars.waitCreditAccount = typeof waitCreditAccount === 'string' && isVarRef(waitCreditAccount)
        ? waitCreditAccount
        : quoteLiteral(String(waitCreditAccount));
      vars.minCredits = config.minCredits || 1000;
      break;
    }

    case 'AddCredits': {
      let creditRecipient: string | unknown;
      if (config.recipient) {
        creditRecipient = config.recipient;
      } else if (createIdentityVarName) {
        // After CreateIdentity: add credits to the key page, not lite identity
        creditRecipient = subPathUrlExpr(createIdentityVarName, 'book/1');
      } else {
        creditRecipient = varRef(`${kv}${lidSuffix}`);
      }
      vars.creditRecipient = typeof creditRecipient === 'string' && !isVarRef(String(creditRecipient))
        ? quoteLiteral(String(creditRecipient))
        : creditRecipient;
      // Convert decimal ACME amounts (e.g., '5.00000000') to integer sub-units
      // The SDK's TxBody.add_credits() calls int(amount) internally,
      // which fails on decimal strings like '5.00000000'.
      const rawAmount = String(config.amount || '100000000');
      if (rawAmount.includes('.')) {
        vars.creditAmount = String(Math.round(parseFloat(rawAmount) * 1e8));
      } else {
        vars.creditAmount = rawAmount;
      }
      const principal = config.principal;
      if (!principal) {
        vars.addCreditsPrincipal = varRef(`${kv}${ltaSuffix}`);
      } else if (typeof principal === 'string' && isVarRef(principal)) {
        vars.addCreditsPrincipal = principal;
      } else {
        vars.addCreditsPrincipal = quoteLiteral(String(principal));
      }
      vars.addCreditsRecipient = vars.creditRecipient;
      break;
    }

    case 'CreateIdentity': {
      let rawAdiUrl: string;
      let adiUrlRef: boolean;
      if (config.url) {
        rawAdiUrl = String(config.url);
        adiUrlRef = isVarRef(rawAdiUrl);
      } else {
        // Generate dynamic timestamp-based ADI URL to avoid name collisions
        if (isJs) rawAdiUrl = '`acc://adi-${Math.floor(Date.now() / 1000)}.acme`';
        else if (isRust) rawAdiUrl = 'format!("acc://adi-{}.acme", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs())';
        else if (isDart) rawAdiUrl = "'acc://adi-${DateTime.now().millisecondsSinceEpoch ~/ 1000}.acme'";
        else if (isCSharp) rawAdiUrl = '$"acc://adi-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}.acme"';
        else rawAdiUrl = 'f"acc://adi-{int(time.time())}.acme"'; // Python
        adiUrlRef = true;
      }
      vars.adiUrl = rawAdiUrl;
      vars.adiUrlIsRef = adiUrlRef;
      // Compute key_book_url: append /book to the URL expression
      if (isRust && adiUrlRef && rawAdiUrl.startsWith('format!("')) {
        // Insert /book before the closing quote of the Rust format string
        // format!(" starts at index 8, so search for closing " from index 9
        const fmtCloseQuote = rawAdiUrl.indexOf('"', 9);
        if (fmtCloseQuote !== -1) {
          vars.keyBookUrl = rawAdiUrl.slice(0, fmtCloseQuote) + '/book' + rawAdiUrl.slice(fmtCloseQuote);
        } else {
          vars.keyBookUrl = `format!("{}/book", ${rawAdiUrl})`;
        }
      } else if (isRust && adiUrlRef) {
        vars.keyBookUrl = `format!("{}/book", ${rawAdiUrl})`;
      } else if (isJs && adiUrlRef && rawAdiUrl.startsWith('`') && rawAdiUrl.endsWith('`')) {
        // JS template literal: insert /book before closing backtick
        vars.keyBookUrl = rawAdiUrl.slice(0, -1) + '/book`';
      } else if (isJs && adiUrlRef) {
        // JS variable: wrap in template literal
        vars.keyBookUrl = `\`\${${rawAdiUrl}}/book\``;
      } else if (isCSharp && adiUrlRef && rawAdiUrl.startsWith('$"') && rawAdiUrl.endsWith('"')) {
        // C# interpolated string: insert /book before closing quote
        vars.keyBookUrl = rawAdiUrl.slice(0, -1) + '/book"';
      } else if (isCSharp && adiUrlRef) {
        // C# variable: wrap in interpolated string
        vars.keyBookUrl = `$"{${rawAdiUrl}}/book"`;
      } else if (adiUrlRef && rawAdiUrl.startsWith('f"') && rawAdiUrl.endsWith('"')) {
        // Insert /book before closing quote of f-string
        vars.keyBookUrl = rawAdiUrl.slice(0, -1) + '/book"';
      } else if (adiUrlRef) {
        vars.keyBookUrl = `f"{${rawAdiUrl}}/book"`;
      } else {
        vars.keyBookUrl = `${rawAdiUrl}/book`;
      }
      vars.keyBookUrlIsRef = adiUrlRef;
      const ciPrincipal = config.principal;
      if (!ciPrincipal) {
        vars.createIdentityPrincipal = varRef(`${kv}${ltaSuffix}`);
      } else if (typeof ciPrincipal === 'string' && isVarRef(ciPrincipal)) {
        vars.createIdentityPrincipal = ciPrincipal;
      } else {
        vars.createIdentityPrincipal = quoteLiteral(String(ciPrincipal));
      }
      break;
    }

    case 'CreateTokenAccount': {
      let rawTokenAccUrl: string;
      if (config.url) {
        rawTokenAccUrl = String(config.url);
      } else if (createIdentityVarName) {
        rawTokenAccUrl = subPathUrlExpr(createIdentityVarName, 'tokens');
      } else {
        rawTokenAccUrl = 'acc://my-identity.acme/tokens';
      }
      vars.tokenAccUrl = rawTokenAccUrl;
      vars.tokenAccUrlIsRef = createIdentityVarName ? true : isVarRef(rawTokenAccUrl);
      // tokenUrl defaults to CreateToken URL if available (custom token), otherwise ACME
      const ctVarForTa = tracker?.lastCreateTokenVarName;
      let rawTokenUrl: string;
      if (config.tokenUrl) {
        rawTokenUrl = String(config.tokenUrl);
      } else if (ctVarForTa) {
        const ctUrlVar = `${ctVarForTa}${ciUrlSuffix}`;
        rawTokenUrl = isJs ? ctUrlVar
          : isRust ? ctUrlVar
          : isDart ? `${ctUrlVar}.toString()`
          : isCSharp ? ctUrlVar  // ctUrlVar is already a string (from $"..." interpolation), not a Url object
          : `str(${ctUrlVar})`;
      } else {
        rawTokenUrl = 'acc://ACME';
      }
      vars.tokenUrl = rawTokenUrl;
      vars.tokenUrlIsRef = ctVarForTa ? true : isVarRef(rawTokenUrl);
      if (!config.principal && createIdentityVarName) {
        const ciUrlVar = `${createIdentityVarName}${ciUrlSuffix}`;
        vars.tokenAccPrincipal = isJs ? ciUrlVar
          : isRust ? ciUrlVar
          : isDart ? `${ciUrlVar}.toString()`
          : isCSharp ? ciUrlVar  // adiUrl is already a string, not a Url object
          : `str(${ciUrlVar})`;
        vars.tokenAccPrincipalIsRef = true;
      } else {
        vars.tokenAccPrincipal = principalExpr(config.principal, 'acc://my-identity.acme');
      }
      break;
    }

    case 'SendTokens': {
      // Support single-recipient shorthand (to/amount) in addition to recipients array
      let recipients = (config.recipients as Array<{ url: string; amount: string }>) || [];
      if (recipients.length === 0 && config.to) {
        recipients = [{ url: String(config.to), amount: String(config.amount || '1000000') }];
      }
      vars.recipients = recipients;
      vars.singleRecipient = recipients.length <= 1;

      // Check for multiple GenerateKeys pattern (first=funded sender, last=recipient)
      const lastKvForRecipient = tracker?.lastKeyGenVarName;
      const hasMultipleKeyGens = tracker?.firstKeyGenVarName && lastKvForRecipient &&
        tracker.firstKeyGenVarName !== lastKvForRecipient;

      if (hasMultipleKeyGens && !config.to && recipients.length === 0) {
        // Two GenerateKeys: use last keypair's LTA as recipient
        vars.firstRecipientUrl = isRust ? `${lastKvForRecipient}${ltaSuffix}`
          : isDart ? `${lastKvForRecipient}${ltaSuffix}.toString()`
          : isCSharp ? `${lastKvForRecipient}${ltaSuffix}.String()`
          : `${lastKvForRecipient}${ltaSuffix}`;
        vars.firstRecipientUrlIsRef = true;
      } else {
        const rawFirstUrl = String(recipients[0]?.url || 'acc://recipient/ACME');
        vars.firstRecipientUrl = rawFirstUrl;
        vars.firstRecipientUrlIsRef = isVarRef(rawFirstUrl);
      }

      const rawFirstAmt = String(recipients[0]?.amount || '1000000');
      vars.firstRecipientAmount = rawFirstAmt;
      vars.firstRecipientAmountIsRef = isVarRef(rawFirstAmt);
      // Support 'from' as alias for 'principal'
      vars.sendTokensPrincipal = principalExpr(config.principal || config.from, 'acc://my-identity.acme/ACME', `${kv}${ltaSuffix}`);
      break;
    }

    case 'CreateDataAccount': {
      let rawDataAccUrl: string;
      if (config.url) {
        rawDataAccUrl = String(config.url);
      } else if (createIdentityVarName) {
        rawDataAccUrl = subPathUrlExpr(createIdentityVarName, 'data');
      } else {
        rawDataAccUrl = 'acc://my-identity.acme/data';
      }
      vars.dataAccUrl = rawDataAccUrl;
      vars.dataAccUrlIsRef = createIdentityVarName ? true : isVarRef(rawDataAccUrl);
      if (!config.principal && createIdentityVarName) {
        const ciUrlVar = `${createIdentityVarName}${ciUrlSuffix}`;
        vars.dataAccPrincipal = isJs ? ciUrlVar
          : isRust ? ciUrlVar
          : isDart ? `${ciUrlVar}.toString()`
          : isCSharp ? ciUrlVar  // adiUrl is already a string, not a Url object
          : `str(${ciUrlVar})`;
        vars.dataAccPrincipalIsRef = true;
      } else {
        vars.dataAccPrincipal = principalExpr(config.principal, 'acc://my-identity.acme');
      }
      break;
    }

    case 'WriteData': {
      const rawEntries = (config.entries as string[]) || ['48656c6c6f20576f726c64'];
      // Dart SDK's writeData expects hex-encoded entries; other SDKs accept plain text
      vars.entries = isDart
        ? rawEntries.map(e => {
            if (isVarRef(e)) return e;
            return Array.from(new TextEncoder().encode(e))
              .map(b => b.toString(16).padStart(2, '0')).join('');
          })
        : rawEntries;
      // Build a list expression with proper quoting (refs unquoted, literals quoted)
      const quoteChar = isDart ? "'" : '"';
      const processedEntries = (isDart
        ? (vars.entries as string[])
        : rawEntries
      ).map(e => isVarRef(e) ? (isRust ? `&${e}` : e) : `${quoteChar}${e}${quoteChar}`);
      vars.entriesExpr = processedEntries.join(', ');
      // Principal defaults to CreateDataAccount URL if available
      const wdCdaVarName = tracker?.lastCreateDataAccountVarName;
      if (!config.principal && wdCdaVarName) {
        const cdaUrlVar = `${wdCdaVarName}${ciUrlSuffix}`;
        vars.writeDataPrincipal = isJs ? cdaUrlVar
          : isRust ? cdaUrlVar
          : isDart ? `${cdaUrlVar}.toString()`
          : isCSharp ? cdaUrlVar  // cdaUrlVar is already a string (from $"..." interpolation), not a Url object
          : `str(${cdaUrlVar})`;
        vars.writeDataPrincipalIsRef = true;
      } else {
        vars.writeDataPrincipal = principalExpr(config.principal, 'acc://my-identity.acme/data');
      }
      break;
    }

    case 'QueryAccount': {
      // Smart default: query the lite token account from the most recent GenerateKeys
      if (!config.url && kv) {
        vars.queryUrl = varRef(`${kv}${ltaSuffix}`);
        vars.queryUrlIsRef = true;
      } else {
        const qUrl = String(config.url || 'acc://my-identity.acme');
        vars.queryUrl = qUrl;
        vars.queryUrlIsRef = isVarRef(qUrl) || qUrl.startsWith('f"') || qUrl.startsWith("f'");
      }
      break;
    }

    case 'Comment': {
      vars.commentText = (config.text as string) || 'Comment';
      break;
    }

    case 'CreateToken': {
      let rawIssuerUrl: string;
      if (config.url) {
        rawIssuerUrl = String(config.url);
      } else if (createIdentityVarName) {
        rawIssuerUrl = subPathUrlExpr(createIdentityVarName, 'token');
      } else {
        rawIssuerUrl = 'acc://my-identity.acme/token';
      }
      vars.tokenIssuerUrl = rawIssuerUrl;
      vars.tokenIssuerUrlIsRef = createIdentityVarName ? true : isVarRef(rawIssuerUrl);
      const rawSymbol = String(config.symbol || 'MYT');
      // Only treat symbol as var ref if it's a RESOLVED reference (contains known suffix),
      // not a bare identifier like 'MYT' which should be a literal string
      const sfxValues = Object.values(getSuffixMap(language)).filter(s => s !== '');
      const symbolIsResolvedRef = isVarRef(rawSymbol) &&
        (rawSymbol.startsWith('`') || rawSymbol.startsWith('f"') || rawSymbol.startsWith("f'") ||
         rawSymbol.startsWith('format!(') || rawSymbol.startsWith('$"') || rawSymbol.startsWith('str(') ||
         rawSymbol.includes('.') || rawSymbol.includes('_') ||
         sfxValues.some(sfx => rawSymbol.endsWith(sfx)));
      vars.tokenSymbol = rawSymbol;
      vars.tokenSymbolIsRef = symbolIsResolvedRef;
      vars.tokenPrecision = config.precision || 8;
      if (!config.principal && createIdentityVarName) {
        const ciUrlVar = `${createIdentityVarName}${ciUrlSuffix}`;
        vars.createTokenPrincipal = isJs ? ciUrlVar
          : isRust ? ciUrlVar
          : isDart ? `${ciUrlVar}.toString()`
          : isCSharp ? ciUrlVar  // adiUrl is already a string, not a Url object
          : `str(${ciUrlVar})`;
        vars.createTokenPrincipalIsRef = true;
      } else {
        vars.createTokenPrincipal = principalExpr(config.principal, 'acc://my-identity.acme');
      }
      break;
    }

    case 'IssueTokens': {
      // Recipient defaults to CreateTokenAccount URL if available
      const ctaVarName = tracker?.lastCreateTokenAccountVarName;
      if (!config.recipient && ctaVarName) {
        const ctaUrlVar = `${ctaVarName}${ciUrlSuffix}`;
        vars.issueRecipient = isJs ? ctaUrlVar
          : isRust ? ctaUrlVar
          : isDart ? `${ctaUrlVar}.toString()`
          : isCSharp ? ctaUrlVar  // ctaUrlVar is already a string (from $"..." interpolation), not a Url object
          : `str(${ctaUrlVar})`;
        vars.issueRecipientIsRef = true;
      } else {
        const issueRecip = config.recipient || 'acc://recipient/tokens';
        const issueRecipStr = String(issueRecip);
        vars.issueRecipientIsRef = isVarRef(issueRecipStr);
        if (typeof issueRecip === 'string' && isVarRef(issueRecip)) {
          vars.issueRecipient = issueRecip;
        } else if (isDart) {
          vars.issueRecipient = quoteLiteral(issueRecipStr);
        } else {
          vars.issueRecipient = issueRecipStr;
        }
      }
      const rawIssueAmt = String(config.amount || '1000000');
      vars.issueAmount = rawIssueAmt;
      vars.issueAmountIsRef = isVarRef(rawIssueAmt);
      // Principal defaults to CreateToken URL if available
      const ctVarName = tracker?.lastCreateTokenVarName;
      if (!config.principal && !config.url && ctVarName) {
        const ctUrlVar = `${ctVarName}${ciUrlSuffix}`;
        vars.issueTokensPrincipal = isJs ? ctUrlVar
          : isRust ? ctUrlVar
          : isDart ? `${ctUrlVar}.toString()`
          : isCSharp ? ctUrlVar  // ctUrlVar is already a string (from $"..." interpolation), not a Url object
          : `str(${ctUrlVar})`;
        vars.issueTokensPrincipalIsRef = true;
      } else {
        vars.issueTokensPrincipal = principalExpr(config.principal || config.url, 'acc://my-identity.acme/token');
      }
      break;
    }

    case 'BurnTokens': {
      vars.burnAmount = config.amount || '1000000';
      // Principal defaults to CreateTokenAccount URL if available
      const btCtaVarName = tracker?.lastCreateTokenAccountVarName;
      if (!config.principal && btCtaVarName) {
        const ctaUrlVar = `${btCtaVarName}${ciUrlSuffix}`;
        vars.burnTokensPrincipal = isJs ? ctaUrlVar
          : isRust ? ctaUrlVar
          : isDart ? `${ctaUrlVar}.toString()`
          : isCSharp ? ctaUrlVar  // ctaUrlVar is already a string (from $"..." interpolation), not a Url object
          : `str(${ctaUrlVar})`;
        vars.burnTokensPrincipalIsRef = true;
      } else {
        vars.burnTokensPrincipal = principalExpr(config.principal, 'acc://my-identity.acme/tokens');
      }
      break;
    }

    case 'CreateKeyBook': {
      let rawKbUrl: string;
      if (config.url) {
        rawKbUrl = String(config.url);
      } else if (createIdentityVarName) {
        // Use 'book2' to avoid collision with the default 'book' created by CreateIdentity
        rawKbUrl = subPathUrlExpr(createIdentityVarName, 'book2');
      } else {
        rawKbUrl = 'acc://my-identity.acme/book';
      }
      vars.keyBookUrl = rawKbUrl;
      vars.keyBookUrlIsRef = createIdentityVarName ? true : isVarRef(rawKbUrl);
      vars.keyBookKeyHash = config.publicKeyHash || `${kv}${pubHashSuffix}`;
      if (!config.principal && createIdentityVarName) {
        const ciUrlVar = `${createIdentityVarName}${ciUrlSuffix}`;
        vars.keyBookPrincipal = isJs ? ciUrlVar
          : isRust ? ciUrlVar
          : isDart ? `${ciUrlVar}.toString()`
          : isCSharp ? ciUrlVar  // adiUrl is already a string, not a Url object
          : `str(${ciUrlVar})`;
        vars.keyBookPrincipalIsRef = true;
      } else {
        vars.keyBookPrincipal = principalExpr(config.principal, 'acc://my-identity.acme');
      }
      break;
    }

    case 'CreateKeyPage': {
      vars.keyPageUrl = config.url || 'acc://my-identity.acme/book/1';
      vars.keyPageKeys = (config.keys as string[]) || [];
      // When keys array is empty, default to including a public key hash.
      // With multiple GenerateKeys, use the LAST keypair's hash (the new key being added),
      // since the FIRST keypair is used as the signer (authorized on the book).
      const ckpLastKv = tracker?.lastKeyGenVarName;
      const ckpFirstKv = tracker?.firstKeyGenVarName;
      const ckpHasMultipleKeyGens = ckpFirstKv && ckpLastKv && ckpFirstKv !== ckpLastKv;
      if ((vars.keyPageKeys as string[]).length === 0) {
        const ckpKeySource = ckpHasMultipleKeyGens ? ckpLastKv : kv;
        if (ckpKeySource) {
          vars.keyPageDefaultKey = `${ckpKeySource}${pubHashSuffix}`;
        }
      }
      if (!config.principal && createIdentityVarName) {
        vars.keyPagePrincipal = subPathUrlExpr(createIdentityVarName, 'book');
        vars.keyPagePrincipalIsRef = true;
      } else {
        vars.keyPagePrincipal = principalExpr(config.principal, 'acc://my-identity.acme/book');
      }
      break;
    }

    case 'UpdateKeyPage': {
      let opsArray = (config.operation || config.operations || []) as Array<Record<string, unknown>>;
      // Smart default: when no operations are configured and a second GenerateKeys exists,
      // default to "add key" with the second keypair's public key hash
      const ukpLastKv = tracker?.lastKeyGenVarName;
      const ukpFirstKv = tracker?.firstKeyGenVarName;
      const ukpHasMultipleKeyGens = ukpFirstKv && ukpLastKv && ukpFirstKv !== ukpLastKv;
      if (opsArray.length === 0 && ukpHasMultipleKeyGens) {
        const pubHashSuffix = isRust ? '_pub_hash' : (language === 'python' ? '_pub_hash' : 'PubHash');
        const newKeyRef = `${ukpLastKv}${pubHashSuffix}`;
        opsArray = [{ type: 'add', entry: { keyHash: newKeyRef } }];
      }
      // JSON.stringify the operations, then replace variable references with Python interpolation
      let opsJson = JSON.stringify(opsArray);
      // Find values that are resolved Python variable references and un-quote them
      // Resolved refs always contain underscores (e.g., generate_keys_signer_2_pub_hash)
      // while literal values like "add", "setThreshold" do not
      {
        // Un-quote resolved variable references in the JSON string so they become
        // actual variable references in generated code instead of string literals.
        // Python: snake_case vars contain underscores (e.g., generate_keys_signer_2_pub_hash)
        // Dart/JS/C#: camelCase vars end with known suffixes (e.g., generateKeysSigner2PubHash)
        const varRefs = new Set<string>();
        const sfxValues = Object.values(getSuffixMap(language)).filter(s => s !== '');
        const collectRefs = (obj: unknown): void => {
          if (typeof obj === 'string' && isVarRef(obj)) {
            const isResolved = language === 'python'
              ? obj.includes('_')
              : sfxValues.some(sfx => obj.endsWith(sfx));
            if (isResolved) varRefs.add(obj);
          }
          if (Array.isArray(obj)) obj.forEach(collectRefs);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            Object.values(obj as Record<string, unknown>).forEach(collectRefs);
          }
        };
        collectRefs(opsArray);
        for (const ref of varRefs) {
          opsJson = opsJson.replace(`"${ref}"`, ref);
        }
      }
      vars.updateKeyPageOps = opsJson;

      // JavaScript SDK requires typed factory methods instead of generic updateKeyPage()
      // because plain JSON objects don't serialize correctly (need class instances).
      if (isJs && opsArray.length === 1) {
        const op = opsArray[0];
        const opType = op.type as string;
        if (opType === 'add') {
          const entry = op.entry as Record<string, unknown> | undefined;
          const keyHash = String(entry?.keyHash || '');
          vars.jsUpdateMethod = 'updateKeyPageAddKey';
          vars.jsUpdateArg = isVarRef(keyHash) ? keyHash : `"${keyHash}"`;
        } else if (opType === 'remove') {
          const entry = op.entry as Record<string, unknown> | undefined;
          const keyHash = String(entry?.keyHash || '');
          vars.jsUpdateMethod = 'updateKeyPageRemoveKey';
          vars.jsUpdateArg = isVarRef(keyHash) ? keyHash : `"${keyHash}"`;
        } else if (opType === 'setThreshold') {
          vars.jsUpdateMethod = 'updateKeyPageSetThreshold';
          vars.jsUpdateArg = String(op.threshold || 1);
        }
      }

      // C# SDK: generate collection initializer for operations (can't use JSON with variable refs)
      if (isCSharp) {
        const sfxValues = Object.values(getSuffixMap(language)).filter(s => s !== '');
        const genOpEntry = (op: Record<string, unknown>): string => {
          const entries: string[] = [];
          for (const [k, v] of Object.entries(op)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              const innerEntries: string[] = [];
              for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
                const ivStr = String(iv);
                const isRef = isVarRef(ivStr) && sfxValues.some(sfx => ivStr.endsWith(sfx));
                innerEntries.push(`["${ik}"] = ${isRef ? `(object)${ivStr}` : `"${ivStr}"`}`);
              }
              entries.push(`["${k}"] = new Dictionary<string, object?> { ${innerEntries.join(', ')} }`);
            } else if (typeof v === 'number') {
              entries.push(`["${k}"] = ${v}`);
            } else {
              const vStr = String(v);
              entries.push(`["${k}"] = "${vStr}"`);
            }
          }
          return `new Dictionary<string, object?> { ${entries.join(', ')} }`;
        };
        const opsEntries = opsArray.map(genOpEntry);
        vars.updateKeyPageOpsCode = `new List<Dictionary<string, object?>>\n                {\n                    ${opsEntries.join(',\n                    ')}\n                }`;
      }

      // Flow templates may use 'url' instead of 'principal' for the key page URL
      // Smart default: use CreateIdentity's book/1 when available
      if (!config.principal && !config.url && createIdentityVarName) {
        const bookUrl = subPathUrlExpr(createIdentityVarName, 'book/1');
        vars.updateKeyPagePrincipal = bookUrl;
        vars.updateKeyPagePrincipalIsRef = true;
      } else {
        const ukpPrincipal = principalExpr(config.principal || config.url, 'acc://my-identity.acme/book/1');
        vars.updateKeyPagePrincipal = ukpPrincipal;
        vars.updateKeyPagePrincipalIsRef = isVarRef(String(ukpPrincipal));
      }
      break;
    }

    case 'UpdateKey': {
      const rawNewKey = String(config.newKeyHash || config.newKey || '');
      // Smart default: when no new key specified and a second GenerateKeys exists, use its pub hash
      const ukLastKv = tracker?.lastKeyGenVarName;
      const ukFirstKv = tracker?.firstKeyGenVarName;
      const ukHasMultipleKeyGens = ukFirstKv && ukLastKv && ukFirstKv !== ukLastKv;
      if (!rawNewKey && ukHasMultipleKeyGens) {
        const pubHashSuffix = isRust ? '_pub_hash' : (language === 'python' ? '_pub_hash' : 'PubHash');
        vars.updateKeyNewKey = `${ukLastKv}${pubHashSuffix}`;
        vars.updateKeyNewKeyIsRef = true;
      } else {
        vars.updateKeyNewKey = rawNewKey;
        vars.updateKeyNewKeyIsRef = isVarRef(rawNewKey) || /^[a-z_]\w*$/i.test(rawNewKey);
      }
      // Smart default: use CreateIdentity's book/1 when available
      if (!config.principal && createIdentityVarName) {
        const bookUrl = subPathUrlExpr(createIdentityVarName, 'book/1');
        vars.updateKeyPrincipal = bookUrl;
        vars.updateKeyPrincipalIsRef = true;
      } else {
        const ukPrincipal = principalExpr(config.principal, 'acc://my-identity.acme/book/1');
        vars.updateKeyPrincipal = ukPrincipal;
        vars.updateKeyPrincipalIsRef = isVarRef(String(ukPrincipal));
      }
      break;
    }

    case 'CreateLiteTokenAccount': {
      // Lite token accounts are derived from the keypair, no additional config needed
      break;
    }

    case 'TransferCredits': {
      // Recipient defaults to book/2 (the key page created by CreateKeyPage) after CreateIdentity
      if (!config.recipient && createIdentityVarName) {
        vars.transferCreditsRecipient = subPathUrlExpr(createIdentityVarName, 'book/2');
        vars.transferCreditsRecipientIsRef = true;
      } else {
        const tcRecip = config.recipient || 'acc://my-identity.acme/book/1';
        if (typeof tcRecip === 'string' && isVarRef(tcRecip)) {
          vars.transferCreditsRecipient = tcRecip;
          vars.transferCreditsRecipientIsRef = true;
        } else if (isDart) {
          vars.transferCreditsRecipient = quoteLiteral(String(tcRecip));
          vars.transferCreditsRecipientIsRef = false;
        } else {
          vars.transferCreditsRecipient = String(tcRecip);
          vars.transferCreditsRecipientIsRef = false;
        }
      }
      vars.transferCreditsAmount = config.amount || 1000;
      // Principal defaults to book/1 after CreateIdentity
      if (!config.principal && createIdentityVarName) {
        vars.transferCreditsPrincipal = subPathUrlExpr(createIdentityVarName, 'book/1');
        vars.transferCreditsPrincipalIsRef = true;
      } else {
        vars.transferCreditsPrincipal = principalExpr(config.principal, 'acc://my-identity.acme/book/1');
      }
      break;
    }

    case 'BurnCredits': {
      vars.burnCreditsAmount = config.amount || 1000;
      // Principal defaults to lite identity (which has credits) when no CreateIdentity
      if (!config.principal && !createIdentityVarName) {
        vars.burnCreditsPrincipal = varRef(`${kv}${lidSuffix}`);
      } else if (!config.principal && createIdentityVarName) {
        vars.burnCreditsPrincipal = subPathUrlExpr(createIdentityVarName, 'book/1');
      } else {
        vars.burnCreditsPrincipal = principalExpr(config.principal, 'acc://my-identity.acme/book/1');
      }
      break;
    }

    case 'WriteDataTo': {
      // Recipient defaults based on context:
      // 1. If CreateDataAccount exists, use its URL
      // 2. If multiple GenerateKeys (like SendTokens pattern), use last keypair's lite identity
      // 3. Otherwise, hardcoded default
      const wdtRecipCdaVarName = tracker?.lastCreateDataAccountVarName;
      const wdtLastKv = tracker?.lastKeyGenVarName;
      const wdtFirstKv = tracker?.firstKeyGenVarName;
      const wdtHasMultipleKeyGens = wdtFirstKv && wdtLastKv && wdtFirstKv !== wdtLastKv;
      if (!config.recipient && wdtRecipCdaVarName) {
        const cdaUrlVar = `${wdtRecipCdaVarName}${ciUrlSuffix}`;
        vars.writeDataToRecipient = isJs ? cdaUrlVar
          : isRust ? cdaUrlVar
          : isDart ? `${cdaUrlVar}.toString()`
          : isCSharp ? cdaUrlVar  // cdaUrlVar is already a string (from $"..." interpolation), not a Url object
          : `str(${cdaUrlVar})`;
        vars.writeDataToRecipientIsRef = true;
      } else if (!config.recipient && wdtHasMultipleKeyGens) {
        // Two GenerateKeys: compute a lite data account URL from second keypair's public key hash.
        // Lite data accounts require 32-byte (64 hex char) addresses, computed as
        // SHA256(SHA256(externalId)) where externalId is the second data entry (index 1+).
        // The template will generate inline code to compute this URL at runtime.
        vars.useComputedLiteDataUrl = true;
        const pubHashSuffix = isRust ? '_pub_hash' : (language === 'python' ? '_pub_hash' : 'PubHash');
        vars.liteDataChainNameExpr = `${wdtLastKv}${pubHashSuffix}`;
        vars.writeDataToRecipient = isRust ? `${varName}_lite_data_url` : `${varName}LiteDataUrl`;
        vars.writeDataToRecipientIsRef = true;
      } else {
        const wdRecip = config.recipient || 'acc://recipient/data';
        if (typeof wdRecip === 'string' && isVarRef(wdRecip)) {
          vars.writeDataToRecipient = wdRecip;
          vars.writeDataToRecipientIsRef = true;
        } else if (isDart) {
          vars.writeDataToRecipient = quoteLiteral(String(wdRecip));
          vars.writeDataToRecipientIsRef = false;
        } else {
          vars.writeDataToRecipient = String(wdRecip);
          vars.writeDataToRecipientIsRef = false;
        }
      }
      let wdToRawEntries = (config.entries as string[]) || ['48656c6c6f20576f726c64'];
      // When using computed lite data URL, add the chain name as external ID (entry[1])
      // so the chain ID matches the recipient URL
      if (vars.useComputedLiteDataUrl && wdToRawEntries.length === 1) {
        const pubHashSuffix = isRust ? '_pub_hash' : (language === 'python' ? '_pub_hash' : 'PubHash');
        wdToRawEntries = [...wdToRawEntries, `${wdtLastKv}${pubHashSuffix}`];
      }
      vars.entries = isDart
        ? wdToRawEntries.map(e => {
            if (isVarRef(e)) return e;
            return Array.from(new TextEncoder().encode(e))
              .map(b => b.toString(16).padStart(2, '0')).join('');
          })
        : wdToRawEntries;
      // Build a list expression with proper quoting (refs unquoted, literals quoted)
      const wdQuoteChar = isDart ? "'" : '"';
      const wdProcessedEntries = (isDart
        ? (vars.entries as string[])
        : wdToRawEntries
      ).map(e => isVarRef(e) ? (isRust ? `&${e}` : e) : `${wdQuoteChar}${e}${wdQuoteChar}`);
      vars.entriesExpr = wdProcessedEntries.join(', ');
      // Principal defaults based on context:
      // 1. If CreateDataAccount exists, use its URL
      // 2. If lite-only flow, use the lite identity (first keypair)
      // 3. Otherwise, hardcoded default
      const wdtCdaVarName = tracker?.lastCreateDataAccountVarName;
      if (!config.principal && wdtCdaVarName) {
        const cdaUrlVar = `${wdtCdaVarName}${ciUrlSuffix}`;
        vars.writeDataToPrincipal = isJs ? cdaUrlVar
          : isRust ? cdaUrlVar
          : isDart ? `${cdaUrlVar}.toString()`
          : isCSharp ? cdaUrlVar  // cdaUrlVar is already a string (from $"..." interpolation), not a Url object
          : `str(${cdaUrlVar})`;
        vars.writeDataToPrincipalIsRef = true;
      } else if (!config.principal && !createIdentityVarName) {
        // Lite-only flow: use the first keypair's lite identity as principal
        const principalKv = wdtHasMultipleKeyGens ? wdtFirstKv : kv;
        vars.writeDataToPrincipal = varRef(`${principalKv}${lidSuffix}`);
        vars.writeDataToPrincipalIsRef = true;
      } else {
        vars.writeDataToPrincipal = principalExpr(config.principal, 'acc://my-identity.acme/data');
      }
      break;
    }

    case 'LockAccount': {
      vars.lockHeight = config.height || 1;
      // Only LiteTokenAccounts are lockable in the Accumulate protocol.
      // Smart default: use the lite token account from the most recent GenerateKeys.
      if (!config.principal && kv) {
        vars.lockAccountPrincipal = varRef(`${kv}${ltaSuffix}`);
        vars.lockAccountPrincipalIsRef = true;
      } else {
        const laPrincipal = principalExpr(config.principal, 'acc://my-lite-token-account/ACME');
        vars.lockAccountPrincipal = laPrincipal;
        vars.lockAccountPrincipalIsRef = isVarRef(String(laPrincipal));
      }
      break;
    }

    case 'UpdateAccountAuth': {
      const uaaOps = (config.operations || []) as Array<Record<string, unknown>>;
      // Smart default: when no operations configured and a CreateIdentity exists,
      // disable the existing book authority on the token account (demonstrates the action)
      if (uaaOps.length === 0 && createIdentityVarName) {
        const bookUrlExpr = subPathUrlExpr(createIdentityVarName, 'book');
        if (isCSharp) {
          // C# needs inline construction since variable references can't go in JSON strings
          vars.updateAuthOpsInline = true;
          vars.updateAuthOpType = 'disable';
          vars.updateAuthOpAuthority = bookUrlExpr;
        } else if (isJs) {
          // JS object literals accept unquoted keys
          vars.updateAuthOps = `[{type: "disable", authority: ${bookUrlExpr}}]`;
        } else {
          // Python, Dart, and Rust need quoted dict/map keys
          // (Rust's json!() macro cannot use bare `type` since it's a reserved keyword)
          vars.updateAuthOps = `[{"type": "disable", "authority": ${bookUrlExpr}}]`;
        }
      } else {
        vars.updateAuthOps = JSON.stringify(uaaOps);
      }
      // Smart default: principal is the ADI identity when available.
      // Sub-accounts inherit authorities from the parent ADI and don't have their own
      // auth entries, so UpdateAccountAuth must target an account with explicit authorities.
      if (!config.principal && createIdentityVarName) {
        const ciUrlVar = `${createIdentityVarName}${ciUrlSuffix}`;
        vars.updateAuthPrincipal = isJs ? ciUrlVar
          : isRust ? ciUrlVar
          : isDart ? `${ciUrlVar}.toString()`
          : isCSharp ? ciUrlVar  // ciUrlVar is already a string (from $"..." interpolation), not a Url object
          : `str(${ciUrlVar})`;
        vars.updateAuthPrincipalIsRef = true;
      } else {
        const uaaPrincipal = principalExpr(config.principal, 'acc://my-identity.acme');
        vars.updateAuthPrincipal = uaaPrincipal;
        vars.updateAuthPrincipalIsRef = isVarRef(String(uaaPrincipal));
      }
      break;
    }
  }

  // Common: compute signerUrl for transaction templates
  // Sub-ADI operations need to sign with the ADI key page, not the lite identity
  if (isTransactionType(node.type)) {
    const rawSignerUrl = config.signerUrl;
    if (rawSignerUrl && typeof rawSignerUrl === 'string' && isVarRef(String(rawSignerUrl))) {
      vars.signerUrl = rawSignerUrl;
    } else if (rawSignerUrl && typeof rawSignerUrl === 'string') {
      vars.signerUrl = quoteLiteral(String(rawSignerUrl));
    } else if (createIdentityVarName && node.type !== 'CreateIdentity' && node.type !== 'AddCredits') {
      // After CreateIdentity: sign with ADI key page for sub-ADI operations
      // (but not for AddCredits, which uses lite token account as principal → needs lite identity signer)
      vars.signerUrl = subPathUrlExpr(createIdentityVarName, 'book/1');
    } else {
      vars.signerUrl = isCSharp ? `${kv}${lidSuffix}.String()`
        : isDart ? `${kv}${lidSuffix}.toString()`
        : `${kv}${lidSuffix}`;
    }
    vars.signerUrlIsRef = true;  // All signer expressions are var refs (variable or template literal)

    // Add isRef flags for principal fields that templates need for conditional quoting
    for (const key of Object.keys(vars)) {
      if (key.endsWith('Principal') && typeof vars[key] === 'string') {
        const refKey = `${key}IsRef`;
        if (!(refKey in vars)) {
          vars[refKey] = isVarRef(String(vars[key]));
        }
      }
    }
  }

  return vars;
}

// =============================================================================
// CLI Generator (passthrough - not affected by manifest migration)
// =============================================================================

function generateCLI(flow: Flow, _language: SDKLanguage): string {
  const sortedNodes = topologicalSort(flow);
  const lines: string[] = [];

  lines.push('#!/bin/bash');
  lines.push(`# ${flow.name}`);
  lines.push('# Generated by Accumulate Studio');
  lines.push('# Execute with: bash script.sh');
  lines.push('#');
  lines.push('# Prerequisites:');
  lines.push('#   - Accumulate CLI wallet installed (https://docs.accumulatenetwork.io)');
  lines.push('#   - Wallet initialized: accumulate wallet init create');
  lines.push(`#   - Server set to ${flow.network ?? 'testnet'}`);
  lines.push('');
  lines.push('set -e  # Exit on error');
  lines.push('');
  lines.push(`NETWORK="${flow.network ?? 'https://testnet.accumulatenetwork.io/v2'}"`);
  lines.push('');

  for (const node of sortedNodes) {
    const config = node.config as Record<string, unknown>;
    lines.push(`# --- ${node.label || node.type} ---`);

    switch (node.type) {
      case 'GenerateKeys':
        lines.push('accumulate key generate my-key');
        lines.push('# Derive lite identity and token account from the generated key');
        lines.push('LITE_ACCOUNT=$(accumulate account list | grep -A1 my-key | tail -1 | awk \'{print $1}\')');
        lines.push('LITE_IDENTITY="${LITE_ACCOUNT%/*}"');
        lines.push('LITE_TOKEN_ACCOUNT="${LITE_IDENTITY}/ACME"');
        break;

      case 'CreateLiteTokenAccount':
        lines.push('# Lite token accounts are derived from keys automatically');
        lines.push('accumulate account generate');
        lines.push('LITE_ACCOUNT=$(accumulate account list | tail -1 | awk \'{print $1}\')');
        lines.push('LITE_IDENTITY="${LITE_ACCOUNT%/*}"');
        lines.push('LITE_TOKEN_ACCOUNT="${LITE_IDENTITY}/ACME"');
        break;

      case 'Faucet': {
        const account = config.account || '$LITE_TOKEN_ACCOUNT';
        const times = config.times || 1;
        for (let i = 0; i < Number(times); i++) {
          lines.push(`accumulate faucet ${account} --wait 10s`);
        }
        break;
      }

      case 'WaitForBalance': {
        const waitAccount = config.account || '$LITE_TOKEN_ACCOUNT';
        const minBalance = config.minBalance || '10000000';
        lines.push(`# Wait for balance >= ${minBalance} on ${waitAccount}`);
        lines.push('echo "Waiting for balance..."');
        lines.push(`while true; do`);
        lines.push(`  BALANCE=$(accumulate get ${waitAccount} --json 2>/dev/null | grep -o '"balance":"[^"]*"' | head -1 | cut -d'"' -f4)`);
        lines.push(`  if [ -n "$BALANCE" ] && [ "$BALANCE" -ge ${minBalance} ] 2>/dev/null; then`);
        lines.push(`    echo "Balance: $BALANCE (target: ${minBalance}) - OK"`);
        lines.push('    break');
        lines.push('  fi');
        lines.push(`  echo "Balance: \${BALANCE:-0} (waiting for ${minBalance})..."`);
        lines.push('  sleep 5');
        lines.push('done');
        break;
      }

      case 'WaitForCredits': {
        const waitCreditAccount = config.account || '$LITE_IDENTITY';
        const minCredits = config.minCredits || 1000;
        lines.push(`# Wait for credits >= ${minCredits} on ${waitCreditAccount}`);
        lines.push('echo "Waiting for credits..."');
        lines.push('while true; do');
        lines.push(`  CREDITS=$(accumulate get ${waitCreditAccount} --json 2>/dev/null | grep -o '"creditBalance":"[^"]*"' | head -1 | cut -d'"' -f4)`);
        lines.push(`  if [ -n "$CREDITS" ] && [ "$CREDITS" -ge ${minCredits} ] 2>/dev/null; then`);
        lines.push(`    echo "Credits: $CREDITS (target: ${minCredits}) - OK"`);
        lines.push('    break');
        lines.push('  fi');
        lines.push(`  echo "Credits: \${CREDITS:-0} (waiting for ${minCredits})..."`);
        lines.push('  sleep 5');
        lines.push('done');
        break;
      }

      case 'AddCredits': {
        const principal = config.principal || '$LITE_TOKEN_ACCOUNT';
        const recipient = config.recipient || '$LITE_IDENTITY';
        const amount = config.amount || '100000000';
        lines.push(`accumulate credits ${principal} ${recipient} ${amount} --wait 10s`);
        break;
      }

      case 'TransferCredits': {
        const principal = config.principal || '$LITE_IDENTITY';
        const recipient = config.recipient || 'acc://my-identity.acme/book/1';
        const amount = config.amount || 1000;
        lines.push(`accumulate credits ${principal} ${recipient} ${amount} --wait 10s`);
        break;
      }

      case 'BurnCredits': {
        const principal = config.principal || '$LITE_IDENTITY';
        const amount = config.amount || 1000;
        lines.push('# Burn credits by sending them to the burn address');
        lines.push(`accumulate tx execute ${principal} '{"type": "burnCredits", "amount": ${amount}}' --wait 10s`);
        break;
      }

      case 'CreateIdentity': {
        const principal = config.principal || '$LITE_TOKEN_ACCOUNT';
        const url = config.url || 'acc://my-identity.acme';
        const keyBook = config.keyBookUrl || '';
        lines.push(`accumulate adi create ${principal} ${url} ${keyBook ? keyBook + ' ' : ''}my-key --wait 10s`);
        break;
      }

      case 'CreateTokenAccount': {
        const principal = config.principal || 'acc://my-identity.acme';
        const url = config.url || 'acc://my-identity.acme/tokens';
        const tokenUrl = config.tokenUrl || 'acc://ACME';
        lines.push(`accumulate account create token ${principal} ${url} ${tokenUrl} --wait 10s`);
        break;
      }

      case 'CreateDataAccount': {
        const principal = config.principal || 'acc://my-identity.acme';
        const url = config.url || 'acc://my-identity.acme/data';
        lines.push(`accumulate account create data ${principal} ${url} --wait 10s`);
        break;
      }

      case 'CreateToken': {
        const principal = config.principal || 'acc://my-identity.acme';
        const url = config.url || 'acc://my-identity.acme/token';
        const symbol = config.symbol || 'MYT';
        const precision = config.precision ?? 8;
        const supplyLimit = config.supplyLimit ? ` ${config.supplyLimit}` : '';
        lines.push(`accumulate token create ${principal} ${url} ${symbol} ${precision}${supplyLimit} --wait 10s`);
        break;
      }

      case 'IssueTokens': {
        const principal = config.principal || 'acc://my-identity.acme/token';
        const recipient = config.recipient || 'acc://recipient/tokens';
        const amount = config.amount || '1000000';
        lines.push(`accumulate token issue ${principal} ${recipient} ${amount} --wait 10s`);
        break;
      }

      case 'BurnTokens': {
        const principal = config.principal || 'acc://my-identity.acme/tokens';
        const amount = config.amount || '1000000';
        lines.push(`accumulate token burn ${principal} ${amount} --wait 10s`);
        break;
      }

      case 'SendTokens': {
        const principal = config.principal || '$LITE_TOKEN_ACCOUNT';
        const recipients = (config.recipients as Array<{ url: string; amount: string }>) || [];
        if (recipients.length <= 1) {
          const url = recipients[0]?.url || 'acc://recipient/ACME';
          const amount = recipients[0]?.amount || '1000000';
          lines.push(`accumulate tx create ${principal} ${url} ${amount} --wait 10s`);
        } else {
          // Multi-recipient: use tx create with multiple recipient/amount pairs
          const args = recipients.map(r => `${r.url} ${r.amount}`).join(' ');
          lines.push(`accumulate tx create ${principal} ${args} --wait 10s`);
        }
        break;
      }

      case 'CreateKeyBook': {
        const principal = config.principal || 'acc://my-identity.acme';
        const url = config.url || 'acc://my-identity.acme/book';
        lines.push(`accumulate book create ${principal} ${url} my-key --wait 10s`);
        break;
      }

      case 'CreateKeyPage': {
        const principal = config.principal || 'acc://my-identity.acme/book';
        const keys = (config.keys as string[]) || [];
        const keyArgs = keys.length > 0 ? keys.join(' ') : 'my-key';
        lines.push(`accumulate page create ${principal} ${keyArgs} --wait 10s`);
        break;
      }

      case 'UpdateKeyPage': {
        const principal = config.principal || 'acc://my-identity.acme/book/1';
        const operations = config.operations || [];
        const opsJson = JSON.stringify(operations);
        lines.push(`accumulate tx execute ${principal} '{"type": "updateKeyPage", "operation": ${opsJson}}' --wait 10s`);
        break;
      }

      case 'UpdateKey': {
        const principal = config.principal || 'acc://my-identity.acme/book/1';
        const newKey = config.newKey || 'new-key';
        lines.push(`accumulate page key update ${principal} my-key ${newKey} --wait 10s`);
        break;
      }

      case 'WriteData': {
        const principal = config.principal || 'acc://my-identity.acme/data';
        const entries = (config.entries as string[]) || ['Hello World'];
        const entryArgs = entries.map(e => `"${e}"`).join(' ');
        lines.push(`accumulate data write ${principal} ${entryArgs} --wait 10s`);
        break;
      }

      case 'WriteDataTo': {
        const principal = config.principal || 'acc://my-identity.acme/data';
        const recipient = config.recipient || 'acc://recipient/data';
        const entries = (config.entries as string[]) || ['Hello World'];
        const entryArgs = entries.map(e => `"${e}"`).join(' ');
        lines.push(`accumulate data write-to ${principal} ${recipient} ${entryArgs} --wait 10s`);
        break;
      }

      case 'LockAccount': {
        const principal = config.principal || 'acc://my-identity.acme';
        const height = config.height || 1;
        lines.push(`accumulate account lock ${principal} ${height} --wait 10s`);
        break;
      }

      case 'UpdateAccountAuth': {
        const principal = config.principal || 'acc://my-identity.acme';
        const operations = config.operations || [];
        const opsJson = JSON.stringify(operations);
        lines.push(`accumulate tx execute ${principal} '{"type": "updateAccountAuth", "operations": ${opsJson}}' --wait 10s`);
        break;
      }

      case 'QueryAccount':
        lines.push(`accumulate get ${config.url || 'acc://my-identity.acme'}`);
        break;

      case 'Comment': {
        const text = (config.text as string) || '';
        // Render comment text as bash comments
        for (const line of text.split('\n')) {
          lines.push(`# ${line}`);
        }
        break;
      }

      default:
        lines.push(`# TODO: Implement ${node.type} CLI command`);
    }

    lines.push('');
  }

  lines.push('echo "Flow completed successfully!"');

  return lines.join('\n');
}
