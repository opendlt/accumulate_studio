/**
 * Bundle Generator - Generate complete export bundles for flows
 */

import type {
  Flow,
  FlowAssertion,
  GeneratedFile,
  SDKLanguage,
  NetworkId,
} from '@accumulate-studio/types';
import { serializeFlowToYaml } from './flow-serializer';
import { generateProject, PROJECT_GENERATORS } from './project-scaffolds';
import { generateAssertions, type GeneratedAssertions } from './assertions-generator';
import {
  generateAgentTask,
  generateAgentAcceptance,
  generateAgentPackRef,
  generateMCPConfig,
} from './agent-files';

// =============================================================================
// Types
// =============================================================================

export interface BundleOptions {
  /** Languages to generate code for */
  languages: SDKLanguage[];
  /** Include auto-generated assertions */
  includeAssertions: boolean;
  /** Include agent files (task.md, acceptance.md, etc.) */
  includeAgentFiles: boolean;
  /** Target network */
  network: NetworkId;
  /** Custom bundle name (defaults to flow name) */
  bundleName?: string;
  /** Include original flow JSON */
  includeFlowJson?: boolean;
}

export interface Bundle {
  /** Bundle manifest */
  manifest: BundleManifest;
  /** All files in the bundle */
  files: BundleFile[];
  /** Generated assertions (if requested) */
  assertions?: GeneratedAssertions;
}

export interface BundleManifest {
  /** Bundle format version */
  version: '1.0';
  /** Bundle name */
  name: string;
  /** Flow name */
  flowName: string;
  /** Flow description */
  flowDescription?: string;
  /** Target network */
  network: NetworkId;
  /** Generation timestamp */
  generatedAt: string;
  /** Studio version */
  studioVersion: string;
  /** Languages included */
  languages: SDKLanguage[];
  /** File manifest */
  files: FileManifestEntry[];
  /** Options used for generation */
  options: Partial<BundleOptions>;
}

export interface FileManifestEntry {
  /** File path within bundle */
  path: string;
  /** File type/purpose */
  type: 'manifest' | 'flow' | 'readme' | 'code' | 'assertion' | 'agent';
  /** Language (for code files) */
  language?: SDKLanguage;
  /** Is this an entry point */
  isEntryPoint?: boolean;
  /** File size in bytes */
  size: number;
}

export interface BundleFile {
  /** File path within bundle */
  path: string;
  /** File content */
  content: string;
  /** File type */
  type: FileManifestEntry['type'];
  /** Language (for code files) */
  language?: SDKLanguage;
  /** Is entry point */
  isEntryPoint?: boolean;
}

// =============================================================================
// Default Options
// =============================================================================

const DEFAULT_OPTIONS: BundleOptions = {
  languages: ['python', 'rust', 'javascript'],
  includeAssertions: true,
  includeAgentFiles: true,
  network: 'testnet',
  includeFlowJson: true,
};

// =============================================================================
// Bundle Generator
// =============================================================================

/**
 * Generate a complete export bundle for a flow
 */
export async function generateBundle(
  flow: Flow,
  options: Partial<BundleOptions> = {}
): Promise<Bundle> {
  const opts: BundleOptions = { ...DEFAULT_OPTIONS, ...options };
  const bundleName = opts.bundleName ?? toKebabCase(flow.name);
  const files: BundleFile[] = [];

  // 1. Generate flow.yaml
  const flowYaml = serializeFlowToYaml(flow);
  files.push({
    path: 'flow.yaml',
    content: flowYaml,
    type: 'flow',
  });

  // 2. Include original flow JSON (optional)
  if (opts.includeFlowJson) {
    files.push({
      path: 'flow.json',
      content: JSON.stringify(flow, null, 2),
      type: 'flow',
    });
  }

  // 3. Generate README.md
  const readme = generateBundleReadme(flow, opts);
  files.push({
    path: 'README.md',
    content: readme,
    type: 'readme',
  });

  // 4. Generate code for each language
  for (const language of opts.languages) {
    const generator = PROJECT_GENERATORS[language];
    if (generator) {
      const projectFiles = generator(flow);
      for (const file of projectFiles) {
        files.push({
          path: `generated/${language}/${file.path}`,
          content: file.content,
          type: 'code',
          language,
          isEntryPoint: file.isEntryPoint,
        });
      }
    }
  }

  // 5. Generate assertions
  let assertions: GeneratedAssertions | undefined;
  if (opts.includeAssertions) {
    assertions = generateAssertions(flow);

    // assertions.yaml
    files.push({
      path: 'assertions/assertions.yaml',
      content: generateAssertionsYaml(assertions),
      type: 'assertion',
    });

    // expected-state.json
    files.push({
      path: 'assertions/expected-state.json',
      content: JSON.stringify(assertions.expectedState, null, 2),
      type: 'assertion',
    });
  }

  // 6. Generate agent files
  if (opts.includeAgentFiles) {
    // agent-task.md
    files.push({
      path: 'agent/agent-task.md',
      content: generateAgentTask(flow),
      type: 'agent',
    });

    // agent-acceptance.md
    files.push({
      path: 'agent/agent-acceptance.md',
      content: generateAgentAcceptance(flow),
      type: 'agent',
    });

    // agent-pack.ref.json
    files.push({
      path: 'agent/agent-pack.ref.json',
      content: JSON.stringify(generateAgentPackRef(flow), null, 2),
      type: 'agent',
    });

    // mcp.config.json
    files.push({
      path: 'agent/mcp.config.json',
      content: JSON.stringify(generateMCPConfig(flow), null, 2),
      type: 'agent',
    });
  }

  // 7. Generate manifest
  const manifest = generateManifest(flow, files, opts, bundleName);
  files.unshift({
    path: 'bundle.manifest.json',
    content: JSON.stringify(manifest, null, 2),
    type: 'manifest',
  });

  return {
    manifest,
    files,
    assertions,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate the bundle manifest
 */
function generateManifest(
  flow: Flow,
  files: BundleFile[],
  options: BundleOptions,
  bundleName: string
): BundleManifest {
  const fileEntries: FileManifestEntry[] = files.map((f) => ({
    path: f.path,
    type: f.type,
    language: f.language,
    isEntryPoint: f.isEntryPoint,
    size: new TextEncoder().encode(f.content).length,
  }));

  return {
    version: '1.0',
    name: bundleName,
    flowName: flow.name,
    flowDescription: flow.description,
    network: options.network,
    generatedAt: new Date().toISOString(),
    studioVersion: '1.0.0',
    languages: options.languages,
    files: fileEntries,
    options: {
      includeAssertions: options.includeAssertions,
      includeAgentFiles: options.includeAgentFiles,
      includeFlowJson: options.includeFlowJson,
    },
  };
}

/**
 * Generate bundle README
 */
function generateBundleReadme(flow: Flow, options: BundleOptions): string {
  const languageList = options.languages
    .map((l) => `- ${getLanguageDisplayName(l)}`)
    .join('\n');

  return `# ${flow.name}

${flow.description ?? 'Accumulate protocol flow generated by Accumulate Studio.'}

## Network

**Target Network**: ${options.network}

## Bundle Contents

### Flow Definition

- \`flow.yaml\` - Canonical flow definition
${options.includeFlowJson ? '- `flow.json` - Original studio flow format' : ''}

### Generated Code

${languageList}

Each language folder contains a complete project with:
- Package manifest (pyproject.toml, Cargo.toml, package.json, etc.)
- Main entry point
- README with usage instructions

${
  options.includeAssertions
    ? `### Assertions

- \`assertions/assertions.yaml\` - Auto-generated assertions
- \`assertions/expected-state.json\` - Expected final state
`
    : ''
}
${
  options.includeAgentFiles
    ? `### Agent Files

- \`agent/agent-task.md\` - Task description for AI agents
- \`agent/agent-acceptance.md\` - Acceptance criteria
- \`agent/agent-pack.ref.json\` - Agent pack reference
- \`agent/mcp.config.json\` - MCP server configuration
`
    : ''
}

## Quick Start

### Python

\`\`\`bash
cd generated/python
pip install -e .
python -m ${toSnakeCase(flow.name)}.main
\`\`\`

### Rust

\`\`\`bash
cd generated/rust
cargo run
\`\`\`

### JavaScript

\`\`\`bash
cd generated/javascript
npm install
npm start
\`\`\`

## Variables

${
  flow.variables.length > 0
    ? flow.variables
        .map(
          (v) =>
            `- **${v.name}** (\`${v.type}\`)${v.required === false ? ' [optional]' : ''}: ${v.description ?? 'No description'}`
        )
        .join('\n')
    : 'No variables defined.'
}

## Flow Steps

${flow.nodes.map((n, i) => `${i + 1}. **${n.type}** (${n.id})`).join('\n')}

---

*Generated by Accumulate Studio v1.0.0*
`;
}

/**
 * Generate assertions YAML
 */
function generateAssertionsYaml(assertions: GeneratedAssertions): string {
  const lines = ['# Auto-generated assertions', '', 'assertions:'];

  for (const assertion of assertions.assertions) {
    lines.push(`  - type: ${assertion.type}`);

    if (assertion.account) lines.push(`    account: "${assertion.account}"`);
    if (assertion.url) lines.push(`    url: "${assertion.url}"`);
    if (assertion.delta) lines.push(`    delta: "${assertion.delta}"`);
    if (assertion.equals) lines.push(`    equals: "${assertion.equals}"`);
    if (assertion.sourceStep) lines.push(`    sourceStep: "${assertion.sourceStep}"`);
    if (assertion.chain) lines.push(`    chain: "${assertion.chain}"`);
    if (assertion.minDelta !== undefined) lines.push(`    minDelta: ${assertion.minDelta}`);
    if (assertion.status) lines.push(`    status: "${assertion.status}"`);
    if (assertion.message) lines.push(`    message: "${assertion.message}"`);

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get display name for a language
 */
function getLanguageDisplayName(language: SDKLanguage): string {
  const names: Record<SDKLanguage, string> = {
    python: 'Python',
    rust: 'Rust',
    dart: 'Dart',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    csharp: 'C#',
  };
  return names[language] ?? language;
}

/**
 * Convert string to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/-+/g, '-');
}

/**
 * Convert string to snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/_+/g, '_');
}

// =============================================================================
// ZIP Archive Generation
// =============================================================================

/**
 * Generate a ZIP archive from a bundle
 * Note: This requires the archiver package and should be used in Node.js environment
 */
export async function generateBundleZip(bundle: Bundle): Promise<Buffer> {
  // Dynamic import for archiver (only available in Node.js)
  const archiver = await import('archiver');
  const { Readable, Writable } = await import('stream');

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    // Create a writable stream to collect chunks
    const writableStream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });

    // Create archive
    const archive = archiver.default('zip', {
      zlib: { level: 9 },
    });

    // Handle events
    archive.on('error', reject);
    writableStream.on('finish', () => {
      resolve(Buffer.concat(chunks));
    });

    // Pipe archive to writable stream
    archive.pipe(writableStream);

    // Add files to archive
    for (const file of bundle.files) {
      archive.append(file.content, { name: file.path });
    }

    // Finalize
    archive.finalize();
  });
}

/**
 * Generate bundle and return as ZIP buffer
 */
export async function generateBundleAsZip(
  flow: Flow,
  options: Partial<BundleOptions> = {}
): Promise<{ bundle: Bundle; zipBuffer: Buffer }> {
  const bundle = await generateBundle(flow, options);
  const zipBuffer = await generateBundleZip(bundle);
  return { bundle, zipBuffer };
}

// =============================================================================
// Exports
// =============================================================================

export type { GeneratedAssertions };
