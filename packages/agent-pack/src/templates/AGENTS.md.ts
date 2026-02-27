/**
 * AGENTS.md Template Generator
 * Creates the AGENTS.md runbook for AI coding agents
 */

import type { SDKLanguage, SDKMap } from '@accumulate-studio/types';

export interface AgentsTemplateOptions {
  language: SDKLanguage;
  sdkMap: SDKMap;
  customRules?: string[];
}

/**
 * Generate AGENTS.md content for the agent pack
 */
export function generateAgentsMd(options: AgentsTemplateOptions): string {
  const { language, sdkMap, customRules = [] } = options;

  const languageSpecificQuickStart = getLanguageSpecificQuickStart(language, sdkMap);
  const languageSpecificImports = getLanguageSpecificImports(language, sdkMap);

  return `# AGENTS.md - Accumulate ${sdkMap.sdk_name} Agent Runbook

> This file provides guidance for AI coding agents working with the Accumulate SDK.
> Generated for ${sdkMap.sdk_name} v${sdkMap.sdk_version}

## Golden Rules

1. **NEVER store private keys in plaintext** - Always use environment variables or secure key stores
2. **ALWAYS wait for transaction finalization** - Use the SDK's transaction wait methods
3. **NEVER skip transaction validation** - Always validate before submitting
4. **ALWAYS handle network errors gracefully** - Implement proper retry logic
5. **PREFER testnet for development** - Never test on mainnet with real funds
6. **ALWAYS check account balances** before transfers to avoid insufficient funds errors
7. **NEVER hardcode network endpoints** - Use environment variables or configuration
8. **ALWAYS use the correct token precision** (ACME uses 8 decimal places)
${customRules.map((rule, i) => `${i + 9}. ${rule}`).join('\n')}

## Quick Start

${languageSpecificQuickStart}

## SDK Entry Points

${sdkMap.entrypoints.map(ep => `### ${ep.symbol}
- **Import**: \`${ep.path}\`
- **Kind**: ${ep.kind}
${ep.doc ? `- **Description**: ${ep.doc}` : ''}
`).join('\n')}

## Canonical Flows

### 1. Create an ADI (Accumulate Digital Identifier)

\`\`\`
1. Generate a key pair (or load existing)
2. Create a lite account and fund it with credits
3. Use the lite account to create the ADI
4. Wait for transaction finalization
5. Verify the ADI exists
\`\`\`

### 2. Send Tokens

\`\`\`
1. Load or create a signer with appropriate authority
2. Check source account balance
3. Create and sign the SendTokens transaction
4. Submit and wait for finalization
5. Verify the transaction succeeded
\`\`\`

### 3. Create a Token Account

\`\`\`
1. Ensure the parent ADI exists and you have authority
2. Create the token account under the ADI
3. Wait for transaction finalization
4. Verify the account was created
\`\`\`

### 4. Write Data to a Data Account

\`\`\`
1. Ensure the data account exists (or create it)
2. Prepare the data entry
3. Sign and submit the WriteData transaction
4. Wait for finalization
5. Query the data entry to verify
\`\`\`

## Standard Imports

${languageSpecificImports}

## Network Configuration

### Mainnet
- Primary endpoint: \`https://mainnet.accumulatenetwork.io/v2\`
- Chain ID: \`mainnet\`

### Testnet
- Primary endpoint: \`https://testnet.accumulatenetwork.io/v2\`
- Chain ID: \`testnet\`

### Local Development (DevNet)
- Primary endpoint: \`http://localhost:26660/v2\`
- Chain ID: \`devnet\`

## Operations Reference

${generateOperationsReference(sdkMap)}

## Error Handling

${generateErrorReference(sdkMap)}

## See Also

- \`SAFETY.md\` - Security constraints and prohibited behaviors
- \`sdk.map.json\` - Machine-readable SDK surface
- \`prompts/\` - Pre-built prompts for common operations
- \`examples/\` - Complete working examples
`;
}

function getLanguageSpecificQuickStart(language: SDKLanguage, sdkMap: SDKMap): string {
  const mainEntry = sdkMap.entrypoints.find(ep => ep.kind === 'class' || ep.kind === 'module');

  switch (language) {
    case 'python':
      return `\`\`\`python
from accumulate_client import Accumulate
import os

# Connect to testnet
acc = Accumulate.testnet()

# Or use environment-based configuration
# acc = Accumulate.from_env()

# Your private key should be in an environment variable
private_key = os.environ.get("ACC_PRIVATE_KEY")
\`\`\``;

    case 'rust':
      return `\`\`\`rust
use accumulate_client::AccumulateClient;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Connect to testnet
    let client = AccumulateClient::testnet().await?;

    // Or use environment-based configuration
    // let client = AccumulateClient::from_env().await?;

    // Your private key should be in an environment variable
    let private_key = env::var("ACC_PRIVATE_KEY")?;

    Ok(())
}
\`\`\``;

    case 'dart':
      return `\`\`\`dart
import 'package:accumulate_client/accumulate_client.dart';
import 'dart:io';

void main() async {
  // Connect to testnet
  final acc = Accumulate.network(AccumulateNetwork.testnet);

  // Your private key should be in an environment variable
  final privateKey = Platform.environment['ACC_PRIVATE_KEY'];
}
\`\`\``;

    case 'javascript':
    case 'typescript':
      return `\`\`\`typescript
import { Accumulate } from 'accumulate-js';

// Connect to testnet
const acc = Accumulate.testnet();

// Or use environment-based configuration
// const acc = Accumulate.fromEnv();

// Your private key should be in an environment variable
const privateKey = process.env.ACC_PRIVATE_KEY;
\`\`\``;

    case 'csharp':
      return `\`\`\`csharp
using Accumulate.Client;

// Connect to testnet
var client = AccumulateClient.Testnet();

// Or use environment-based configuration
// var client = AccumulateClient.FromEnvironment();

// Your private key should be in an environment variable
var privateKey = Environment.GetEnvironmentVariable("ACC_PRIVATE_KEY");
\`\`\``;

    default:
      return `See the SDK documentation for ${language}-specific setup.`;
  }
}

function getLanguageSpecificImports(language: SDKLanguage, sdkMap: SDKMap): string {
  switch (language) {
    case 'python':
      return `\`\`\`python
from accumulate_client import Accumulate
from accumulate_client.convenience import TxBody, SmartSigner
from accumulate_client.types import (
    SendTokens, CreateIdentity, CreateTokenAccount,
    WriteData, AddCredits, BurnCredits
)
\`\`\``;

    case 'rust':
      return `\`\`\`rust
use accumulate_client::{
    AccumulateClient,
    helpers::{TxBody, SmartSigner},
    types::{SendTokens, CreateIdentity, CreateTokenAccount, WriteData},
};
\`\`\``;

    case 'dart':
      return `\`\`\`dart
import 'package:accumulate_client/accumulate_client.dart';
// Includes: Accumulate, TxBody, TxSigner, AccumulateHelper
// and all transaction types
\`\`\``;

    case 'javascript':
    case 'typescript':
      return `\`\`\`typescript
import {
  Accumulate,
  TxBody,
  SmartSigner,
  SendTokens,
  CreateIdentity,
  CreateTokenAccount,
  WriteData,
} from 'accumulate-js';
\`\`\``;

    case 'csharp':
      return `\`\`\`csharp
using Accumulate.Client;
using Accumulate.Client.Helpers;
using Accumulate.Protocol;
\`\`\``;

    default:
      return `See the SDK documentation for ${language}-specific imports.`;
  }
}

function generateOperationsReference(sdkMap: SDKMap): string {
  const categories = new Map<string, typeof sdkMap.operations>();

  for (const op of sdkMap.operations) {
    const category = op.category || 'other';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(op);
  }

  let result = '';

  for (const [category, ops] of categories) {
    result += `### ${capitalize(category)} Operations\n\n`;
    result += '| Operation | Prerequisites | Description |\n';
    result += '|-----------|--------------|-------------|\n';

    for (const op of ops) {
      const prereqs = op.requires.length > 0 ? op.requires.join(', ') : 'None';
      const desc = op.symbols[0]?.signature || op.op;
      result += `| \`${op.op}\` | ${prereqs} | ${desc} |\n`;
    }

    result += '\n';
  }

  return result;
}

function generateErrorReference(sdkMap: SDKMap): string {
  if (!sdkMap.errors || sdkMap.errors.length === 0) {
    return `Refer to the SDK documentation for error codes and handling.`;
  }

  let result = '| Error Code | Hint | Resolution |\n';
  result += '|------------|------|------------|\n';

  for (const error of sdkMap.errors) {
    result += `| \`${error.code}\` | ${error.hint} | ${error.details || 'See documentation'} |\n`;
  }

  return result;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default generateAgentsMd;
