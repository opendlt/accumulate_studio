/**
 * Agent Pack Generator
 * Generates the complete agent-pack folder structure
 */

import type { SDKLanguage, SDKMap } from '@accumulate-studio/types';
import { generateAgentsMd, type AgentsTemplateOptions } from './templates/AGENTS.md';
import { generateSafetyMd, type SafetyTemplateOptions } from './templates/SAFETY.md';
import { generateSDKMap, type SDKMapperOptions } from './sdk-mapper';
import { getDefaultPrompts, generatePromptsIndex, generatePromptWithLanguage, type PromptTemplate } from './prompts';

// =============================================================================
// Types
// =============================================================================

export interface AgentPackFile {
  /** Relative path within the agent-pack folder */
  path: string;
  /** File content */
  content: string;
  /** Content type hint */
  type: 'json' | 'markdown' | 'text';
}

export interface AgentPackFiles {
  /** All generated files */
  files: AgentPackFile[];
  /** The generated SDK map */
  sdkMap: SDKMap;
  /** Validation warnings during generation */
  warnings: string[];
}

export interface GeneratorOptions {
  /** SDK path for introspection */
  sdkPath: string;
  /** Target language */
  language: SDKLanguage;
  /** SDK name override */
  sdkName?: string;
  /** SDK version override */
  sdkVersion?: string;
  /** Git commit SHA */
  commit?: string;
  /** Additional notes for AGENTS.md */
  notes?: string;
  /** Custom golden rules */
  customRules?: string[];
  /** Custom prohibited behaviors */
  customProhibitions?: string[];
  /** Value threshold for ACME (auto-approve below this) */
  valueThresholdAcme?: number;
  /** Credit threshold (auto-approve below this) */
  valueThresholdCredits?: number;
  /** Include example files */
  includeExamples?: boolean;
  /** Custom prompts to include */
  customPrompts?: PromptTemplate[];
}

// =============================================================================
// Main Generator Function
// =============================================================================

/**
 * Generate a complete agent pack for an SDK
 */
export function generateAgentPack(
  sdkPath: string,
  language: SDKLanguage,
  options?: Partial<Omit<GeneratorOptions, 'sdkPath' | 'language'>>
): AgentPackFiles {
  const warnings: string[] = [];

  // Generate SDK map
  const sdkMapOptions: Partial<SDKMapperOptions> = {
    sdkName: options?.sdkName,
    sdkVersion: options?.sdkVersion,
    commit: options?.commit,
    notes: options?.notes,
  };

  const sdkMap = generateSDKMap(sdkPath, language, sdkMapOptions);

  // Generate AGENTS.md
  const agentsOptions: AgentsTemplateOptions = {
    language,
    sdkMap,
    customRules: options?.customRules,
  };
  const agentsMd = generateAgentsMd(agentsOptions);

  // Generate SAFETY.md
  const safetyOptions: SafetyTemplateOptions = {
    language,
    sdkMap,
    valueThresholdAcme: options?.valueThresholdAcme,
    valueThresholdCredits: options?.valueThresholdCredits,
    customProhibitions: options?.customProhibitions,
  };
  const safetyMd = generateSafetyMd(safetyOptions);

  // Generate prompts
  const defaultPrompts = getDefaultPrompts();
  const customPrompts = options?.customPrompts || [];
  const allPrompts = [...defaultPrompts, ...customPrompts];
  const promptsIndex = generatePromptsIndex();

  // Add custom prompts to index
  for (const prompt of customPrompts) {
    promptsIndex.prompts.push(prompt);
  }

  // Generate manifest
  const manifest = generateManifest(sdkMap, language);

  // Collect all files
  const files: AgentPackFile[] = [];

  // Add manifest
  files.push({
    path: 'agent-pack.json',
    content: JSON.stringify(manifest, null, 2),
    type: 'json',
  });

  // Add AGENTS.md
  files.push({
    path: 'AGENTS.md',
    content: agentsMd,
    type: 'markdown',
  });

  // Add SAFETY.md
  files.push({
    path: 'SAFETY.md',
    content: safetyMd,
    type: 'markdown',
  });

  // Add sdk.map.json
  files.push({
    path: 'sdk.map.json',
    content: JSON.stringify(sdkMap, null, 2),
    type: 'json',
  });

  // Add prompts/index.json
  files.push({
    path: 'prompts/index.json',
    content: JSON.stringify(promptsIndex, null, 2),
    type: 'json',
  });

  // Add individual prompt files
  for (const prompt of allPrompts) {
    const promptContent = generatePromptWithLanguage(prompt, language);
    files.push({
      path: `prompts/${prompt.id}.prompt.md`,
      content: promptContent,
      type: 'markdown',
    });
  }

  // Add example structure (if requested)
  if (options?.includeExamples !== false) {
    files.push(...generateExampleFiles(sdkMap, language));
  }

  // Add README
  files.push({
    path: 'README.md',
    content: generateReadme(sdkMap, language),
    type: 'markdown',
  });

  return {
    files,
    sdkMap,
    warnings,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate the agent-pack.json manifest
 */
function generateManifest(sdkMap: SDKMap, language: SDKLanguage): Record<string, unknown> {
  return {
    version: '1.0.0',
    schema_version: '1.0',
    sdk_name: sdkMap.sdk_name,
    sdk_version: sdkMap.sdk_version,
    language,
    generated_at: new Date().toISOString(),
    files: {
      agents_md: 'AGENTS.md',
      safety_md: 'SAFETY.md',
      sdk_map: 'sdk.map.json',
      prompts_index: 'prompts/index.json',
    },
    metadata: {
      generator: '@accumulate-studio/agent-pack',
      generator_version: '1.0.0',
    },
  };
}

/**
 * Generate example file stubs
 */
function generateExampleFiles(sdkMap: SDKMap, language: SDKLanguage): AgentPackFile[] {
  const files: AgentPackFile[] = [];
  const ext = getFileExtension(language);

  // Create examples directory structure
  files.push({
    path: 'examples/.gitkeep',
    content: '# Examples directory\n',
    type: 'text',
  });

  // Generate example stubs for key operations
  const keyOperations = ['create_adi', 'send_tokens', 'write_data', 'add_credits', 'query_account'];

  for (const opName of keyOperations) {
    const op = sdkMap.operations.find(o => o.op === opName);
    if (op) {
      files.push({
        path: `examples/${opName}.${ext}`,
        content: generateExampleStub(opName, language, op),
        type: 'text',
      });
    }
  }

  // Create a complete example
  files.push({
    path: `examples/complete_example.${ext}`,
    content: generateCompleteExample(language, sdkMap),
    type: 'text',
  });

  return files;
}

/**
 * Generate an example file stub for an operation
 */
function generateExampleStub(
  opName: string,
  language: SDKLanguage,
  op: SDKMap['operations'][0]
): string {
  const title = opName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  switch (language) {
    case 'python':
      return `"""
Example: ${title}

Prerequisites: ${op.requires.join(', ') || 'None'}
"""

import os
from accumulate_client import Accumulate
from accumulate_client.convenience import TxBody, SmartSigner

def main():
    # Connect to testnet
    acc = Accumulate.testnet()

    # Load signer from environment
    signer = SmartSigner.from_env("ACC_PRIVATE_KEY")

    # TODO: Implement ${opName}
    # See AGENTS.md for detailed guidance

    print("Example: ${title}")

if __name__ == "__main__":
    main()
`;

    case 'rust':
      return `//! Example: ${title}
//!
//! Prerequisites: ${op.requires.join(', ') || 'None'}

use accumulate_client::AccumulateClient;
use accumulate_client::helpers::{TxBody, SmartSigner};
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Connect to testnet
    let client = AccumulateClient::testnet().await?;

    // Load signer from environment
    let signer = SmartSigner::from_env("ACC_PRIVATE_KEY")?;

    // TODO: Implement ${opName}
    // See AGENTS.md for detailed guidance

    println!("Example: ${title}");

    Ok(())
}
`;

    case 'dart':
      return `/// Example: ${title}
///
/// Prerequisites: ${op.requires.join(', ') || 'None'}

import 'dart:io';
import 'package:accumulate_client/accumulate_client.dart';

void main() async {
  // Connect to testnet
  final acc = Accumulate.network(AccumulateNetwork.testnet);

  // Load signer from environment
  final privateKey = Platform.environment['ACC_PRIVATE_KEY'];

  // TODO: Implement ${opName}
  // See AGENTS.md for detailed guidance

  print('Example: ${title}');
}
`;

    case 'javascript':
    case 'typescript':
      return `/**
 * Example: ${title}
 *
 * Prerequisites: ${op.requires.join(', ') || 'None'}
 */

import { Accumulate, TxBody, SmartSigner } from 'accumulate-js';

async function main() {
  // Connect to testnet
  const acc = Accumulate.testnet();

  // Load signer from environment
  const signer = SmartSigner.fromEnv('ACC_PRIVATE_KEY');

  // TODO: Implement ${opName}
  // See AGENTS.md for detailed guidance

  console.log('Example: ${title}');
}

main().catch(console.error);
`;

    case 'csharp':
      return `/// <summary>
/// Example: ${title}
/// Prerequisites: ${op.requires.join(', ') || 'None'}
/// </summary>

using Accumulate.Client;
using Accumulate.Client.Helpers;

class Program
{
    static async Task Main(string[] args)
    {
        // Connect to testnet
        var client = AccumulateClient.Testnet();

        // Load signer from environment
        var signer = SmartSigner.FromEnvironment("ACC_PRIVATE_KEY");

        // TODO: Implement ${opName}
        // See AGENTS.md for detailed guidance

        Console.WriteLine("Example: ${title}");
    }
}
`;

    default:
      return `# Example: ${title}\n# Prerequisites: ${op.requires.join(', ') || 'None'}\n`;
  }
}

/**
 * Generate a complete example that demonstrates the full workflow
 */
function generateCompleteExample(language: SDKLanguage, sdkMap: SDKMap): string {
  switch (language) {
    case 'python':
      return `"""
Complete Example: Zero to Hero with Accumulate

This example demonstrates:
1. Creating a lite account
2. Adding credits
3. Creating an ADI
4. Creating token and data accounts
5. Sending tokens and writing data

Prerequisites: Private key in ACC_PRIVATE_KEY environment variable
"""

import os
import asyncio
from accumulate_client import Accumulate
from accumulate_client.convenience import TxBody, SmartSigner

async def main():
    # Connect to testnet
    acc = Accumulate.testnet()

    # Load signer from environment
    private_key = os.environ.get("ACC_PRIVATE_KEY")
    if not private_key:
        raise ValueError("ACC_PRIVATE_KEY environment variable not set")

    signer = SmartSigner(private_key)

    # Get lite account address
    lite_address = signer.lite_address
    print(f"Lite Account: {lite_address}")

    # Check balance
    account = await acc.query(lite_address)
    print(f"Balance: {account.get('balance', 0)}")

    # TODO: Complete the workflow
    # See AGENTS.md for detailed steps

    print("Complete example finished!")

if __name__ == "__main__":
    asyncio.run(main())
`;

    case 'rust':
      return `//! Complete Example: Zero to Hero with Accumulate
//!
//! This example demonstrates:
//! 1. Creating a lite account
//! 2. Adding credits
//! 3. Creating an ADI
//! 4. Creating token and data accounts
//! 5. Sending tokens and writing data
//!
//! Prerequisites: Private key in ACC_PRIVATE_KEY environment variable

use accumulate_client::AccumulateClient;
use accumulate_client::helpers::{TxBody, SmartSigner};
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Connect to testnet
    let client = AccumulateClient::testnet().await?;

    // Load signer from environment
    let private_key = env::var("ACC_PRIVATE_KEY")
        .expect("ACC_PRIVATE_KEY environment variable not set");

    let signer = SmartSigner::new(&private_key)?;

    // Get lite account address
    let lite_address = signer.lite_address();
    println!("Lite Account: {}", lite_address);

    // Check balance
    let account = client.query(&lite_address).await?;
    println!("Balance: {:?}", account.balance);

    // TODO: Complete the workflow
    // See AGENTS.md for detailed steps

    println!("Complete example finished!");

    Ok(())
}
`;

    case 'dart':
      return `/// Complete Example: Zero to Hero with Accumulate
///
/// This example demonstrates:
/// 1. Creating a lite account
/// 2. Adding credits
/// 3. Creating an ADI
/// 4. Creating token and data accounts
/// 5. Sending tokens and writing data
///
/// Prerequisites: Private key in ACC_PRIVATE_KEY environment variable

import 'dart:io';
import 'package:accumulate_client/accumulate_client.dart';

void main() async {
  // Connect to testnet
  final acc = Accumulate.network(AccumulateNetwork.testnet);

  // Load signer from environment
  final privateKey = Platform.environment['ACC_PRIVATE_KEY'];
  if (privateKey == null) {
    throw Exception('ACC_PRIVATE_KEY environment variable not set');
  }

  final signer = TxSigner.fromPrivateKey(privateKey);

  // Get lite account address
  final liteAddress = signer.liteAddress;
  print('Lite Account: \$liteAddress');

  // Check balance
  final account = await acc.query(liteAddress);
  print('Balance: \${account.balance}');

  // TODO: Complete the workflow
  // See AGENTS.md for detailed steps

  print('Complete example finished!');
}
`;

    case 'javascript':
    case 'typescript':
      return `/**
 * Complete Example: Zero to Hero with Accumulate
 *
 * This example demonstrates:
 * 1. Creating a lite account
 * 2. Adding credits
 * 3. Creating an ADI
 * 4. Creating token and data accounts
 * 5. Sending tokens and writing data
 *
 * Prerequisites: Private key in ACC_PRIVATE_KEY environment variable
 */

import { Accumulate, TxBody, SmartSigner } from 'accumulate-js';

async function main() {
  // Connect to testnet
  const acc = Accumulate.testnet();

  // Load signer from environment
  const privateKey = process.env.ACC_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('ACC_PRIVATE_KEY environment variable not set');
  }

  const signer = new SmartSigner(privateKey);

  // Get lite account address
  const liteAddress = signer.liteAddress;
  console.log(\`Lite Account: \${liteAddress}\`);

  // Check balance
  const account = await acc.query(liteAddress);
  console.log(\`Balance: \${account.balance || 0}\`);

  // TODO: Complete the workflow
  // See AGENTS.md for detailed steps

  console.log('Complete example finished!');
}

main().catch(console.error);
`;

    case 'csharp':
      return `/// <summary>
/// Complete Example: Zero to Hero with Accumulate
///
/// This example demonstrates:
/// 1. Creating a lite account
/// 2. Adding credits
/// 3. Creating an ADI
/// 4. Creating token and data accounts
/// 5. Sending tokens and writing data
///
/// Prerequisites: Private key in ACC_PRIVATE_KEY environment variable
/// </summary>

using Accumulate.Client;
using Accumulate.Client.Helpers;

class CompleteExample
{
    static async Task Main(string[] args)
    {
        // Connect to testnet
        var client = AccumulateClient.Testnet();

        // Load signer from environment
        var privateKey = Environment.GetEnvironmentVariable("ACC_PRIVATE_KEY");
        if (string.IsNullOrEmpty(privateKey))
        {
            throw new InvalidOperationException("ACC_PRIVATE_KEY environment variable not set");
        }

        var signer = new SmartSigner(privateKey);

        // Get lite account address
        var liteAddress = signer.LiteAddress;
        Console.WriteLine($"Lite Account: {liteAddress}");

        // Check balance
        var account = await client.QueryAsync(liteAddress);
        Console.WriteLine($"Balance: {account.Balance}");

        // TODO: Complete the workflow
        // See AGENTS.md for detailed steps

        Console.WriteLine("Complete example finished!");
    }
}
`;

    default:
      return `# Complete Example\n# See AGENTS.md for detailed steps\n`;
  }
}

/**
 * Generate README for the agent pack
 */
function generateReadme(sdkMap: SDKMap, language: SDKLanguage): string {
  return `# Agent Pack for ${sdkMap.sdk_name}

This agent pack provides AI coding agents with the knowledge and tools needed to work with the Accumulate ${language} SDK.

## Contents

- \`agent-pack.json\` - Pack manifest
- \`AGENTS.md\` - Runbook for AI agents with golden rules, workflows, and operations reference
- \`SAFETY.md\` - Security constraints and prohibited behaviors
- \`sdk.map.json\` - Machine-readable SDK surface map
- \`prompts/\` - Pre-built prompts for common operations
- \`examples/\` - Example code for each operation

## Usage

### For AI Coding Agents

1. Read \`AGENTS.md\` first for golden rules and workflows
2. Consult \`SAFETY.md\` before any key handling or high-value operations
3. Use \`sdk.map.json\` to find the right SDK methods
4. Refer to \`prompts/\` for step-by-step guidance on specific tasks
5. Check \`examples/\` for working code samples

### For Developers

This pack was generated for:
- SDK: ${sdkMap.sdk_name}
- Version: ${sdkMap.sdk_version}
- Language: ${language}
- Generated: ${sdkMap.generated_at || 'Unknown'}

## Operations Supported

${sdkMap.operations.slice(0, 10).map(op => `- \`${op.op}\` (${op.category})`).join('\n')}
${sdkMap.operations.length > 10 ? `\n... and ${sdkMap.operations.length - 10} more operations` : ''}

## Getting Started

See the \`zero-to-hero.prompt.md\` in the prompts folder for a complete walkthrough from no account to fully operational ADI.

## License

This agent pack is part of Accumulate Studio.
`;
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
  generateAgentPack,
};
