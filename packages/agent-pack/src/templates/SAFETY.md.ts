/**
 * SAFETY.md Template Generator
 * Creates the SAFETY.md constraints file for AI coding agents
 */

import type { SDKLanguage, SDKMap } from '@accumulate-studio/types';

export interface SafetyTemplateOptions {
  language: SDKLanguage;
  sdkMap: SDKMap;
  valueThresholdAcme?: number;
  valueThresholdCredits?: number;
  customProhibitions?: string[];
}

/**
 * Generate SAFETY.md content for the agent pack
 */
export function generateSafetyMd(options: SafetyTemplateOptions): string {
  const {
    language,
    sdkMap,
    valueThresholdAcme = 100,
    valueThresholdCredits = 10000,
    customProhibitions = [],
  } = options;

  const languageSpecificPatterns = getLanguageSpecificKeyPatterns(language);
  const languageSpecificSigning = getLanguageSpecificSigningDefaults(language);

  return `# SAFETY.md - Security Constraints for Accumulate Agents

> This file defines security constraints and prohibited behaviors for AI coding agents.
> Generated for ${sdkMap.sdk_name} v${sdkMap.sdk_version}

## Prohibited Behaviors

### NEVER Do These Things

1. **NEVER store private keys in source code**
   - No hardcoded keys in any file
   - No keys in configuration files that get committed
   - No keys in comments or documentation

2. **NEVER log private keys or seed phrases**
   - No console.log/print of key material
   - No debug output containing keys
   - No error messages that might expose keys

3. **NEVER transmit keys over insecure channels**
   - No HTTP (non-TLS) for key material
   - No unencrypted storage
   - No clipboard operations with keys

4. **NEVER disable transaction validation**
   - Always validate transaction parameters
   - Never skip signature verification
   - Never bypass balance checks

5. **NEVER auto-approve high-value transactions**
   - Transactions over ${valueThresholdAcme} ACME require explicit confirmation
   - Credit purchases over ${valueThresholdCredits} require explicit confirmation
   - Any mainnet transaction should prompt for confirmation

6. **NEVER modify authority structures without explicit confirmation**
   - Adding/removing keys from key pages
   - Changing signing thresholds
   - Transferring ADI ownership

7. **NEVER execute irreversible operations without confirmation**
   - Burning tokens
   - Deleting accounts
   - Revoking authorities

${customProhibitions.map((p, i) => `${i + 8}. **${p}**`).join('\n')}

## Key Storage Patterns

### Approved Key Storage Methods

${languageSpecificPatterns}

### Key Storage Checklist

- [ ] Keys are loaded from environment variables or secure vaults
- [ ] Keys are never written to disk in plaintext
- [ ] Keys are zeroed from memory after use (when possible)
- [ ] Key material is never included in logs or error messages
- [ ] Backup keys are encrypted at rest

## Signing Defaults

${languageSpecificSigning}

### Signing Checklist

- [ ] Always use the minimum required signers
- [ ] Verify the signer has authority over the account
- [ ] Check credit balance before signing (signatures cost credits)
- [ ] Use multi-sig for high-value operations
- [ ] Implement signing timeouts

## Value Thresholds

### Automatic Approval Limits

| Operation | Testnet | Mainnet |
|-----------|---------|---------|
| Send Tokens | < ${valueThresholdAcme} ACME | ALWAYS CONFIRM |
| Add Credits | < ${valueThresholdCredits} credits | ALWAYS CONFIRM |
| Burn Tokens | < ${valueThresholdAcme / 10} ACME | ALWAYS CONFIRM |
| Create ADI | Automatic | ALWAYS CONFIRM |
| Authority Changes | NEVER AUTO | NEVER AUTO |

### Confirmation Prompts

When a transaction exceeds thresholds, the agent MUST:

1. Display the full transaction details
2. Show the estimated cost in credits
3. Wait for explicit user confirmation
4. Log the confirmation for audit purposes

## Network Safety

### Testnet vs Mainnet

| Behavior | Testnet | Mainnet |
|----------|---------|---------|
| Auto-submit transactions | Allowed | PROHIBITED |
| Use test keys | Allowed | PROHIBITED |
| Skip confirmation | Allowed (under threshold) | PROHIBITED |
| Debug logging | Allowed | PROHIBITED |

### Environment Detection

Always detect the network environment:

\`\`\`
IF network == mainnet:
    REQUIRE explicit confirmation for ALL transactions
    DISABLE debug logging
    REQUIRE hardware wallet or secure signer
ELSE:
    Apply threshold-based rules
\`\`\`

## Audit Requirements

### Transaction Logging

All transactions MUST be logged with:
- Timestamp
- Transaction type
- Source account
- Destination account (if applicable)
- Amount (if applicable)
- Transaction hash
- Status (pending/success/failed)

### Security Events

Log these security-relevant events:
- Key loading (NOT the key itself)
- Signing operations
- Failed authorization attempts
- Threshold violations
- Network changes

## Recovery Procedures

### Key Compromise

If a key is suspected to be compromised:

1. Immediately rotate all keys
2. Check for unauthorized transactions
3. Update all key pages
4. Notify relevant parties

### Transaction Errors

If a transaction fails:

1. Check the error code
2. Verify account states
3. Check credit balance
4. Retry with exponential backoff
5. Alert user after 3 failures

## Compliance Notes

### Data Handling

- Accumulate transactions are public and immutable
- Data written to data accounts is permanent
- Consider privacy implications before writing data

### Regulatory

- Token transfers may have regulatory implications
- Identity operations may require KYC in some jurisdictions
- Consult legal counsel for production deployments

## See Also

- \`AGENTS.md\` - General agent guidance and workflows
- \`sdk.map.json\` - Machine-readable SDK surface
- \`prompts/\` - Pre-built prompts with safety considerations
`;
}

function getLanguageSpecificKeyPatterns(language: SDKLanguage): string {
  switch (language) {
    case 'python':
      return `\`\`\`python
import os
from accumulate_client.convenience import SmartSigner

# GOOD: Load from environment variable
private_key = os.environ.get("ACC_PRIVATE_KEY")
if not private_key:
    raise ValueError("ACC_PRIVATE_KEY environment variable not set")

# GOOD: Use SmartSigner which handles key securely
signer = SmartSigner.from_env("ACC_PRIVATE_KEY")

# BAD: Never do this!
# private_key = "0x1234..."  # PROHIBITED
# config = {"key": "0x1234..."}  # PROHIBITED
\`\`\``;

    case 'rust':
      return `\`\`\`rust
use std::env;
use accumulate_client::helpers::SmartSigner;

// GOOD: Load from environment variable
let private_key = env::var("ACC_PRIVATE_KEY")
    .expect("ACC_PRIVATE_KEY environment variable not set");

// GOOD: Use SmartSigner which handles key securely
let signer = SmartSigner::from_env("ACC_PRIVATE_KEY")?;

// BAD: Never do this!
// let private_key = "0x1234...";  // PROHIBITED
// const KEY: &str = "0x1234...";  // PROHIBITED
\`\`\``;

    case 'dart':
      return `\`\`\`dart
import 'dart:io';
import 'package:accumulate_client/accumulate_client.dart';

// GOOD: Load from environment variable
final privateKey = Platform.environment['ACC_PRIVATE_KEY'];
if (privateKey == null) {
  throw Exception('ACC_PRIVATE_KEY environment variable not set');
}

// GOOD: Use TxSigner with secure key loading
final signer = TxSigner.fromEnv('ACC_PRIVATE_KEY');

// BAD: Never do this!
// final privateKey = "0x1234...";  // PROHIBITED
// const key = "0x1234...";  // PROHIBITED
\`\`\``;

    case 'javascript':
    case 'typescript':
      return `\`\`\`typescript
import { SmartSigner } from 'accumulate-js';

// GOOD: Load from environment variable
const privateKey = process.env.ACC_PRIVATE_KEY;
if (!privateKey) {
  throw new Error('ACC_PRIVATE_KEY environment variable not set');
}

// GOOD: Use SmartSigner which handles key securely
const signer = SmartSigner.fromEnv('ACC_PRIVATE_KEY');

// BAD: Never do this!
// const privateKey = "0x1234...";  // PROHIBITED
// const config = { key: "0x1234..." };  // PROHIBITED
\`\`\``;

    case 'csharp':
      return `\`\`\`csharp
using System;
using Accumulate.Client.Helpers;

// GOOD: Load from environment variable
var privateKey = Environment.GetEnvironmentVariable("ACC_PRIVATE_KEY");
if (string.IsNullOrEmpty(privateKey))
{
    throw new InvalidOperationException("ACC_PRIVATE_KEY environment variable not set");
}

// GOOD: Use SmartSigner which handles key securely
var signer = SmartSigner.FromEnvironment("ACC_PRIVATE_KEY");

// BAD: Never do this!
// var privateKey = "0x1234...";  // PROHIBITED
// const string Key = "0x1234...";  // PROHIBITED
\`\`\``;

    default:
      return `Load keys from environment variables. Never hardcode keys in source code.`;
  }
}

function getLanguageSpecificSigningDefaults(language: SDKLanguage): string {
  switch (language) {
    case 'python':
      return `\`\`\`python
from accumulate_client.convenience import TxBody, SmartSigner

# Default signing configuration
signer = SmartSigner.from_env("ACC_PRIVATE_KEY")

# Build transaction with proper defaults
tx = TxBody.send_tokens(
    source="acc://my-adi/tokens",
    destination="acc://recipient/tokens",
    amount=100_00000000  # 100 ACME with 8 decimal places
)

# Sign with automatic fee calculation
signed_tx = signer.sign(tx)
\`\`\``;

    case 'rust':
      return `\`\`\`rust
use accumulate_client::helpers::{TxBody, SmartSigner};

// Default signing configuration
let signer = SmartSigner::from_env("ACC_PRIVATE_KEY")?;

// Build transaction with proper defaults
let tx = TxBody::send_tokens(
    "acc://my-adi/tokens",
    "acc://recipient/tokens",
    100_00000000,  // 100 ACME with 8 decimal places
)?;

// Sign with automatic fee calculation
let signed_tx = signer.sign(&tx)?;
\`\`\``;

    case 'dart':
      return `\`\`\`dart
import 'package:accumulate_client/accumulate_client.dart';

// Default signing configuration
final signer = TxSigner.fromEnv('ACC_PRIVATE_KEY');

// Build transaction with proper defaults
final tx = TxBody.sendTokens(
  source: 'acc://my-adi/tokens',
  destination: 'acc://recipient/tokens',
  amount: BigInt.from(100) * BigInt.from(100000000),  // 100 ACME
);

// Sign with automatic fee calculation
final signedTx = signer.sign(tx);
\`\`\``;

    case 'javascript':
    case 'typescript':
      return `\`\`\`typescript
import { TxBody, SmartSigner } from 'accumulate-js';

// Default signing configuration
const signer = SmartSigner.fromEnv('ACC_PRIVATE_KEY');

// Build transaction with proper defaults
const tx = TxBody.sendTokens({
  source: 'acc://my-adi/tokens',
  destination: 'acc://recipient/tokens',
  amount: 100_00000000n,  // 100 ACME with 8 decimal places (BigInt)
});

// Sign with automatic fee calculation
const signedTx = await signer.sign(tx);
\`\`\``;

    case 'csharp':
      return `\`\`\`csharp
using Accumulate.Client.Helpers;

// Default signing configuration
var signer = SmartSigner.FromEnvironment("ACC_PRIVATE_KEY");

// Build transaction with proper defaults
var tx = TxBody.SendTokens(
    source: "acc://my-adi/tokens",
    destination: "acc://recipient/tokens",
    amount: 100_00000000  // 100 ACME with 8 decimal places
);

// Sign with automatic fee calculation
var signedTx = signer.Sign(tx);
\`\`\``;

    default:
      return `Use the SDK's built-in signing utilities with secure key handling.`;
  }
}

export default generateSafetyMd;
