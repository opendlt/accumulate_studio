/**
 * Default Prompt Templates for Accumulate Agent Pack
 * These prompts guide AI agents through common Accumulate operations
 */

import type { SDKLanguage } from '@accumulate-studio/types';

export interface PromptTemplate {
  /** Unique prompt identifier */
  id: string;
  /** Human-readable title */
  title: string;
  /** Short description */
  description: string;
  /** Prompt content */
  content: string;
  /** Tags for categorization */
  tags: string[];
  /** Required context/prerequisites */
  requires?: string[];
}

export interface PromptIndex {
  version: string;
  prompts: PromptTemplate[];
}

/**
 * Create ADI prompt template
 */
export const createAdiPrompt: PromptTemplate = {
  id: 'create-adi',
  title: 'Create an ADI (Accumulate Digital Identifier)',
  description: 'Guide for creating a new ADI with proper authority setup',
  tags: ['identity', 'adi', 'setup'],
  requires: ['funded-lite-account', 'credits'],
  content: `# Create an ADI (Accumulate Digital Identifier)

## Overview

Create a new Accumulate Digital Identifier (ADI) which serves as a namespace for accounts and identities on the Accumulate network.

## Prerequisites

Before creating an ADI, you need:
1. A funded lite account with ACME tokens
2. Credits on the lite account (for transaction fees)
3. A key pair for the ADI's initial authority

## Steps

### 1. Generate or Load a Key Pair

\`\`\`
# The key will be used as the initial authority for the ADI
# Store securely - loss of this key means loss of access to the ADI
\`\`\`

### 2. Create and Fund a Lite Account

\`\`\`
# Lite accounts are derived from public keys
# Fund via faucet (testnet) or transfer (mainnet)
\`\`\`

### 3. Add Credits to the Lite Account

\`\`\`
# Credits are required for transaction fees
# Use AddCredits transaction to convert ACME to credits
\`\`\`

### 4. Create the ADI

\`\`\`
# Use CreateIdentity transaction
# Specify the ADI URL (e.g., acc://my-new-adi)
# Include the public key for initial authority
\`\`\`

### 5. Verify the ADI

\`\`\`
# Query the ADI URL to confirm creation
# Check the key book and key page
\`\`\`

## Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| \`adi_url\` | The URL for the new ADI | \`acc://my-company\` |
| \`public_key\` | Initial authority public key | Ed25519 public key |
| \`key_book_url\` | URL for the key book | \`acc://my-company/book\` |

## Common Errors

- **InsufficientCredits**: Add more credits to the lite account
- **IdentityAlreadyExists**: Choose a different ADI name
- **InvalidUrl**: ADI URLs must follow acc:// format

## Security Notes

- The initial key has full control over the ADI
- Consider setting up multi-sig for production ADIs
- Always backup the authority keys securely
`,
};

/**
 * Send tokens prompt template
 */
export const sendTokensPrompt: PromptTemplate = {
  id: 'send-tokens',
  title: 'Send Tokens',
  description: 'Transfer ACME or custom tokens between accounts',
  tags: ['tokens', 'transfer', 'acme'],
  requires: ['funded-token-account', 'signing-authority'],
  content: `# Send Tokens

## Overview

Transfer ACME tokens or custom tokens between Accumulate token accounts.

## Prerequisites

1. A token account with sufficient balance
2. Signing authority over the source account
3. Credits for transaction fees

## Steps

### 1. Verify Source Account Balance

\`\`\`
# Query the source token account
# Ensure sufficient balance for transfer + fees
\`\`\`

### 2. Prepare the Transaction

\`\`\`
# Create SendTokens transaction body
# Specify source, destination, and amount
\`\`\`

### 3. Sign the Transaction

\`\`\`
# Sign with a key that has authority over the source account
# The key must be on a key page referenced by the account's key book
\`\`\`

### 4. Submit and Wait

\`\`\`
# Submit the transaction
# Wait for finalization (typically 2-10 seconds)
\`\`\`

### 5. Verify the Transfer

\`\`\`
# Query both source and destination accounts
# Confirm balances updated correctly
\`\`\`

## Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| \`source\` | Source token account URL | \`acc://my-adi/acme-tokens\` |
| \`destination\` | Destination token account URL | \`acc://recipient/tokens\` |
| \`amount\` | Amount in token units (8 decimals for ACME) | \`10000000000\` (100 ACME) |

## Token Precision

ACME uses 8 decimal places:
- 1 ACME = 100,000,000 (10^8) units
- 0.01 ACME = 1,000,000 units
- Always use integer amounts in the smallest unit

## Common Errors

- **InsufficientBalance**: Not enough tokens in source account
- **Unauthorized**: Signer doesn't have authority
- **InvalidDestination**: Destination account doesn't exist or wrong type

## Security Notes

- Always verify destination address before sending
- Consider using allowlists for large transfers
- Implement confirmation prompts for amounts over threshold
`,
};

/**
 * Write data prompt template
 */
export const writeDataPrompt: PromptTemplate = {
  id: 'write-data',
  title: 'Write Data to a Data Account',
  description: 'Store arbitrary data on the Accumulate network',
  tags: ['data', 'storage', 'write'],
  requires: ['data-account', 'signing-authority'],
  content: `# Write Data to a Data Account

## Overview

Store arbitrary data on the Accumulate network using a data account. Data is stored permanently and can be queried by anyone.

## Prerequisites

1. A data account under an ADI you control
2. Signing authority over the account
3. Credits for transaction fees

## Steps

### 1. Ensure Data Account Exists

\`\`\`
# Query the data account URL
# If it doesn't exist, create it first with CreateDataAccount
\`\`\`

### 2. Prepare the Data Entry

\`\`\`
# Data can be:
# - Raw bytes
# - JSON (will be stored as bytes)
# - Accumulate Data Entry format
\`\`\`

### 3. Create WriteData Transaction

\`\`\`
# Create WriteData transaction body
# Include the data entry
\`\`\`

### 4. Sign and Submit

\`\`\`
# Sign with authority key
# Submit and wait for finalization
\`\`\`

### 5. Verify the Data

\`\`\`
# Query the data account
# Retrieve the entry by hash or index
\`\`\`

## Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| \`account\` | Data account URL | \`acc://my-adi/data\` |
| \`data\` | Data to write (bytes or entry) | \`{"key": "value"}\` |
| \`scratch\` | Write to scratch chain (optional) | \`true/false\` |

## Data Entry Types

1. **Accumulate Data Entry**: Native format with fields
2. **Raw Bytes**: Any binary data
3. **DoubleHash Data Entry**: For proving data existence without revealing

## Size Limits

- Single entry: Up to 20KB
- Multiple entries can be chained for larger data

## Common Errors

- **AccountNotFound**: Data account doesn't exist
- **Unauthorized**: Signer doesn't have authority
- **DataTooLarge**: Entry exceeds size limit

## Security Notes

- Data written is public and permanent
- Do not write sensitive information
- Consider encryption for private data
- Hash data first if you only need to prove existence
`,
};

/**
 * Zero to hero prompt template
 */
export const zeroToHeroPrompt: PromptTemplate = {
  id: 'zero-to-hero',
  title: 'Zero to Hero: Complete Accumulate Setup',
  description: 'Full walkthrough from no account to fully operational ADI',
  tags: ['tutorial', 'setup', 'complete'],
  requires: [],
  content: `# Zero to Hero: Complete Accumulate Setup

## Overview

This guide walks through setting up a complete Accumulate identity from scratch, including:
- Creating a lite account
- Funding with tokens and credits
- Creating an ADI
- Setting up token and data accounts
- Performing transactions

## Phase 1: Key Generation

### 1.1 Generate a Key Pair

\`\`\`
# Generate an Ed25519 key pair
# IMPORTANT: Store the private key securely
# The public key will derive your lite account address
\`\`\`

### 1.2 Derive Lite Account Address

\`\`\`
# Lite accounts are derived from the SHA-256 hash of the public key
# Format: acc://<first-48-chars-of-hash>
\`\`\`

## Phase 2: Funding

### 2.1 Fund the Lite Account (Testnet)

\`\`\`
# Use the faucet to get test ACME tokens
# Faucet URL: https://testnet.faucet.accumulate.org
\`\`\`

### 2.2 Add Credits

\`\`\`
# Convert ACME to credits for transaction fees
# Typical amounts: 1000-10000 credits for testing
\`\`\`

## Phase 3: Create ADI

### 3.1 Choose an ADI Name

\`\`\`
# ADI names are globally unique
# Format: acc://your-adi-name
# Use lowercase letters, numbers, and hyphens
\`\`\`

### 3.2 Create the ADI

\`\`\`
# CreateIdentity transaction from lite account
# This creates the ADI, key book, and first key page
\`\`\`

### 3.3 Verify ADI Creation

\`\`\`
# Query acc://your-adi to confirm it exists
# Check acc://your-adi/book for the key book
# Check acc://your-adi/book/1 for the key page
\`\`\`

## Phase 4: Set Up Accounts

### 4.1 Create Token Account

\`\`\`
# Create an ACME token account under your ADI
# URL: acc://your-adi/acme-tokens
\`\`\`

### 4.2 Create Data Account

\`\`\`
# Create a data account for storing data
# URL: acc://your-adi/data
\`\`\`

### 4.3 Fund the Token Account

\`\`\`
# Transfer ACME from lite account to ADI token account
\`\`\`

## Phase 5: Operations

### 5.1 Write Some Data

\`\`\`
# Write a test entry to your data account
# Query to verify it's stored
\`\`\`

### 5.2 Send Tokens

\`\`\`
# Send tokens from your ADI token account
# Can send to another ADI or lite account
\`\`\`

## Verification Checklist

- [ ] Key pair generated and stored securely
- [ ] Lite account funded with ACME
- [ ] Credits added to lite account
- [ ] ADI created successfully
- [ ] Key book and key page verified
- [ ] Token account created
- [ ] Data account created
- [ ] Test transaction completed

## Next Steps

After completing this setup:
1. Consider adding additional keys for backup
2. Set up multi-signature if needed
3. Create additional accounts as needed
4. Implement proper key management for production
`,
};

/**
 * Get all default prompts
 */
export function getDefaultPrompts(): PromptTemplate[] {
  return [
    createAdiPrompt,
    sendTokensPrompt,
    writeDataPrompt,
    zeroToHeroPrompt,
  ];
}

/**
 * Generate the prompts index.json structure
 */
export function generatePromptsIndex(): PromptIndex {
  return {
    version: '1.0.0',
    prompts: getDefaultPrompts(),
  };
}

/**
 * Generate prompt file content with language-specific examples
 */
export function generatePromptWithLanguage(
  prompt: PromptTemplate,
  language: SDKLanguage
): string {
  // Add language-specific header
  let content = `---
id: ${prompt.id}
title: ${prompt.title}
language: ${language}
tags: ${prompt.tags.join(', ')}
requires: ${prompt.requires?.join(', ') || 'none'}
---

`;
  content += prompt.content;
  return content;
}

export default {
  createAdiPrompt,
  sendTokensPrompt,
  writeDataPrompt,
  zeroToHeroPrompt,
  getDefaultPrompts,
  generatePromptsIndex,
  generatePromptWithLanguage,
};
