/**
 * Golden Path Templates Registry
 * Pre-built flow templates for common Accumulate operations
 */

import type { FlowTemplate, Flow, FlowVariable, FlowNode, FlowConnection, FlowAssertion } from '@accumulate-studio/types';

// =============================================================================
// Template Metadata
// =============================================================================

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  tags: string[];
  prerequisites?: string[];
  instructions?: string[];
}

// =============================================================================
// Zero to Hero Template
// =============================================================================

const zeroToHeroFlow: Flow = {
  version: '1.0',
  name: 'Zero to Hero: From Nothing to ADI',
  description: 'Complete beginner flow that takes you from zero to a fully functional ADI with a token account.',
  tags: ['beginner', 'getting-started', 'adi', 'faucet'],
  network: 'testnet',
  variables: [
    {
      name: 'ADI_NAME',
      type: 'string',
      description: 'Name for your ADI (e.g., "my-first-adi")',
      required: true,
    },
    {
      name: 'TOKEN_ACCOUNT_NAME',
      type: 'string',
      description: 'Name for the token account',
      default: 'tokens',
      required: false,
    },
  ],
  nodes: [
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: { x: 100, y: 100 },
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Faucet',
      config: { account: '{{generate_keys.liteTokenAccount}}', times: 2 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for Balance',
      config: { account: '{{generate_keys.liteTokenAccount}}', minBalance: '10.00000000', maxAttempts: 30, delayMs: 2000 },
      position: { x: 100, y: 300 },
    },
    {
      id: 'add_credits',
      type: 'AddCredits',
      label: 'Add Credits',
      config: { recipient: '{{generate_keys.liteIdentity}}', amount: '5.00000000' },
      position: { x: 100, y: 400 },
    },
    {
      id: 'wait_for_credits',
      type: 'WaitForCredits',
      label: 'Wait for Credits',
      config: { account: '{{generate_keys.liteIdentity}}', minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: { x: 100, y: 500 },
    },
    {
      id: 'create_identity',
      type: 'CreateIdentity',
      label: 'Create ADI',
      config: { url: 'acc://{{ADI_NAME}}.acme', keyBookUrl: 'acc://{{ADI_NAME}}.acme/book', publicKeyHash: '{{generate_keys.publicKeyHash}}' },
      position: { x: 100, y: 600 },
    },
    {
      id: 'create_token_account',
      type: 'CreateTokenAccount',
      label: 'Create Token Account',
      config: { url: 'acc://{{ADI_NAME}}.acme/{{TOKEN_ACCOUNT_NAME}}', tokenUrl: 'acc://ACME' },
      position: { x: 100, y: 700 },
    },
  ],
  connections: [
    { id: 'conn_1', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_2', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
    { id: 'conn_3', sourceNodeId: 'wait_for_balance', sourcePortId: 'output', targetNodeId: 'add_credits', targetPortId: 'input' },
    { id: 'conn_4', sourceNodeId: 'add_credits', sourcePortId: 'output', targetNodeId: 'wait_for_credits', targetPortId: 'input' },
    { id: 'conn_5', sourceNodeId: 'wait_for_credits', sourcePortId: 'output', targetNodeId: 'create_identity', targetPortId: 'input' },
    { id: 'conn_6', sourceNodeId: 'create_identity', sourcePortId: 'output', targetNodeId: 'create_token_account', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: 'acc://{{ADI_NAME}}.acme', message: 'ADI should exist after creation' },
    { type: 'account.exists', url: 'acc://{{ADI_NAME}}.acme/book', message: 'Key book should exist under ADI' },
    { type: 'account.exists', url: 'acc://{{ADI_NAME}}.acme/{{TOKEN_ACCOUNT_NAME}}', message: 'Token account should exist under ADI' },
    { type: 'receipt.verified', sourceStep: 'create_identity', message: 'ADI creation transaction should have valid receipt' },
    { type: 'receipt.verified', sourceStep: 'create_token_account', message: 'Token account creation should have valid receipt' },
  ],
};

export const zeroToHeroTemplate: FlowTemplate = {
  id: 'zero-to-hero',
  name: 'Zero to Hero',
  description: 'Complete beginner flow: Generate keys, fund via faucet, add credits, create ADI, and set up a token account. Perfect for first-time users.',
  category: 'beginner',
  estimatedTime: '10 min',
  tags: ['beginner', 'getting-started', 'adi', 'faucet', 'tokens'],
  flow: zeroToHeroFlow,
  instructions: [
    'Generate a new Ed25519 keypair',
    'Request testnet tokens from the faucet',
    'Wait for ACME tokens to arrive',
    'Add credits to the lite identity',
    'Wait for credits to be confirmed',
    'Create your ADI with key book',
    'Create a token account under the ADI',
  ],
  prerequisites: ['None - great for beginners!'],
};

// =============================================================================
// Lite Account Setup Template
// =============================================================================

const liteAccountSetupFlow: Flow = {
  version: '1.0',
  name: 'Lite Account Setup',
  description: 'The simplest Accumulate flow. Creates a lite identity and funds it.',
  tags: ['beginner', 'lite-account', 'faucet'],
  network: 'testnet',
  variables: [],
  nodes: [
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: { x: 100, y: 100 },
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Faucet',
      config: { account: '{{generate_keys.liteTokenAccount}}', times: 1 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for Balance',
      config: { account: '{{generate_keys.liteTokenAccount}}', minBalance: '5.00000000', maxAttempts: 30, delayMs: 2000 },
      position: { x: 100, y: 300 },
    },
  ],
  connections: [
    { id: 'conn_1', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_2', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{generate_keys.liteTokenAccount}}', message: 'Lite token account should exist after faucet' },
    { type: 'balance.delta', account: '{{generate_keys.liteTokenAccount}}', delta: '5.00000000', message: 'Balance should increase by at least 5 ACME' },
  ],
};

export const liteAccountSetupTemplate: FlowTemplate = {
  id: 'lite-account-setup',
  name: 'Lite Account Setup',
  description: 'The simplest Accumulate flow. Generates a keypair which automatically creates a lite identity, then funds it via the testnet faucet.',
  category: 'beginner',
  estimatedTime: '3 min',
  tags: ['beginner', 'lite-account', 'faucet', 'getting-started'],
  flow: liteAccountSetupFlow,
  instructions: [
    'Generate a new Ed25519 keypair',
    'Request testnet tokens from the faucet',
    'Wait for ACME tokens to arrive',
  ],
  prerequisites: ['None - great for beginners!'],
};

// =============================================================================
// ADI Creation Template
// =============================================================================

const adiCreationFlow: Flow = {
  version: '1.0',
  name: 'Full ADI Creation',
  description: 'Creates a complete ADI with proper key management structure.',
  tags: ['intermediate', 'adi', 'key-management'],
  network: 'testnet',
  variables: [
    {
      name: 'ADI_NAME',
      type: 'string',
      description: 'Name for your ADI (e.g., "my-company")',
      required: true,
    },
    {
      name: 'KEY_BOOK_NAME',
      type: 'string',
      description: 'Name for the key book',
      default: 'book',
      required: false,
    },
  ],
  nodes: [
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: { x: 100, y: 100 },
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Faucet',
      config: { account: '{{generate_keys.liteTokenAccount}}', times: 3 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for Balance',
      config: { account: '{{generate_keys.liteTokenAccount}}', minBalance: '15.00000000', maxAttempts: 30, delayMs: 2000 },
      position: { x: 100, y: 300 },
    },
    {
      id: 'add_credits',
      type: 'AddCredits',
      label: 'Add Credits',
      config: { recipient: '{{generate_keys.liteIdentity}}', amount: '10.00000000' },
      position: { x: 100, y: 400 },
    },
    {
      id: 'create_identity',
      type: 'CreateIdentity',
      label: 'Create ADI',
      config: { url: 'acc://{{ADI_NAME}}.acme', keyBookUrl: 'acc://{{ADI_NAME}}.acme/{{KEY_BOOK_NAME}}', publicKeyHash: '{{generate_keys.publicKeyHash}}' },
      position: { x: 100, y: 500 },
    },
    {
      id: 'create_key_book',
      type: 'CreateKeyBook',
      label: 'Create Admin Key Book',
      config: { url: 'acc://{{ADI_NAME}}.acme/admin-book', publicKeyHash: '{{generate_keys.publicKeyHash}}' },
      position: { x: 100, y: 600 },
    },
    {
      id: 'create_key_page',
      type: 'CreateKeyPage',
      label: 'Create Key Page',
      config: { url: 'acc://{{ADI_NAME}}.acme/admin-book/2', keys: ['{{generate_keys.publicKeyHash}}'] },
      position: { x: 100, y: 700 },
    },
  ],
  connections: [
    { id: 'conn_1', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_2', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
    { id: 'conn_3', sourceNodeId: 'wait_for_balance', sourcePortId: 'output', targetNodeId: 'add_credits', targetPortId: 'input' },
    { id: 'conn_4', sourceNodeId: 'add_credits', sourcePortId: 'output', targetNodeId: 'create_identity', targetPortId: 'input' },
    { id: 'conn_5', sourceNodeId: 'create_identity', sourcePortId: 'output', targetNodeId: 'create_key_book', targetPortId: 'input' },
    { id: 'conn_6', sourceNodeId: 'create_key_book', sourcePortId: 'output', targetNodeId: 'create_key_page', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: 'acc://{{ADI_NAME}}.acme', message: 'ADI should exist' },
    { type: 'account.exists', url: 'acc://{{ADI_NAME}}.acme/{{KEY_BOOK_NAME}}', message: 'Primary key book should exist' },
    { type: 'account.exists', url: 'acc://{{ADI_NAME}}.acme/admin-book', message: 'Admin key book should exist' },
    { type: 'account.exists', url: 'acc://{{ADI_NAME}}.acme/admin-book/2', message: 'Additional key page should exist' },
    { type: 'receipt.verified', sourceStep: 'create_identity', message: 'ADI creation receipt should be valid' },
    { type: 'receipt.verified', sourceStep: 'create_key_book', message: 'Key book creation receipt should be valid' },
    { type: 'receipt.verified', sourceStep: 'create_key_page', message: 'Key page creation receipt should be valid' },
  ],
};

export const adiCreationTemplate: FlowTemplate = {
  id: 'adi-creation',
  name: 'Full ADI Creation',
  description: 'Creates a complete ADI with proper key management structure including a key book with key pages.',
  category: 'intermediate',
  estimatedTime: '8 min',
  tags: ['intermediate', 'adi', 'key-management', 'identity'],
  flow: adiCreationFlow,
  instructions: [
    'Generate primary keypair',
    'Fund the lite account via faucet',
    'Wait for ACME tokens to arrive',
    'Add credits to lite identity',
    'Create the ADI with initial key book',
    'Create an additional admin key book',
    'Create a key page in the admin book',
  ],
  prerequisites: ['None - this template is self-contained'],
};

// =============================================================================
// Token Transfer Template
// =============================================================================

const tokenTransferFlow: Flow = {
  version: '1.0',
  name: 'Token Transfer',
  description: 'Demonstrates sending ACME tokens between accounts.',
  tags: ['intermediate', 'tokens', 'transfer'],
  variables: [
    {
      name: 'ADI_URL',
      type: 'url',
      description: 'Your ADI URL (e.g., "acc://my-adi.acme")',
      required: true,
    },
    {
      name: 'SENDER_ACCOUNT_NAME',
      type: 'string',
      description: 'Name for sender token account',
      default: 'sender',
      required: false,
    },
    {
      name: 'RECEIVER_ACCOUNT_NAME',
      type: 'string',
      description: 'Name for receiver token account',
      default: 'receiver',
      required: false,
    },
    {
      name: 'TRANSFER_AMOUNT',
      type: 'decimal',
      description: 'Amount of ACME to transfer',
      default: '1.00000000',
      required: false,
    },
  ],
  nodes: [
    {
      id: 'create_sender_account',
      type: 'CreateTokenAccount',
      label: 'Create Sender Account',
      config: { url: '{{ADI_URL}}/{{SENDER_ACCOUNT_NAME}}', tokenUrl: 'acc://ACME' },
      position: { x: 100, y: 100 },
    },
    {
      id: 'create_receiver_account',
      type: 'CreateTokenAccount',
      label: 'Create Receiver Account',
      config: { url: '{{ADI_URL}}/{{RECEIVER_ACCOUNT_NAME}}', tokenUrl: 'acc://ACME' },
      position: { x: 300, y: 100 },
    },
    {
      id: 'query_sender',
      type: 'QueryAccount',
      label: 'Verify Sender',
      config: { url: '{{ADI_URL}}/{{SENDER_ACCOUNT_NAME}}' },
      position: { x: 100, y: 200 },
    },
    {
      id: 'send_tokens',
      type: 'SendTokens',
      label: 'Send Tokens',
      config: { recipients: [{ url: '{{ADI_URL}}/{{RECEIVER_ACCOUNT_NAME}}', amount: '{{TRANSFER_AMOUNT}}' }] },
      position: { x: 200, y: 300 },
    },
  ],
  connections: [
    { id: 'conn_1', sourceNodeId: 'create_sender_account', sourcePortId: 'output', targetNodeId: 'query_sender', targetPortId: 'input' },
    { id: 'conn_2', sourceNodeId: 'query_sender', sourcePortId: 'output', targetNodeId: 'send_tokens', targetPortId: 'input' },
    { id: 'conn_3', sourceNodeId: 'create_receiver_account', sourcePortId: 'output', targetNodeId: 'send_tokens', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{ADI_URL}}/{{SENDER_ACCOUNT_NAME}}', message: 'Sender token account should exist' },
    { type: 'account.exists', url: '{{ADI_URL}}/{{RECEIVER_ACCOUNT_NAME}}', message: 'Receiver token account should exist' },
    { type: 'balance.delta', account: '{{ADI_URL}}/{{RECEIVER_ACCOUNT_NAME}}', delta: '{{TRANSFER_AMOUNT}}', message: 'Receiver should have received the transfer amount' },
    { type: 'receipt.verified', sourceStep: 'send_tokens', message: 'Token transfer receipt should be valid' },
    { type: 'synthetic.delivered', sourceStep: 'send_tokens', message: 'Synthetic deposit transaction should be delivered' },
  ],
};

export const tokenTransferTemplate: FlowTemplate = {
  id: 'token-transfer',
  name: 'Token Transfer',
  description: 'Demonstrates how to send ACME tokens between accounts. Creates sender and receiver accounts, then performs a transfer.',
  category: 'intermediate',
  estimatedTime: '5 min',
  tags: ['intermediate', 'tokens', 'transfer', 'send'],
  flow: tokenTransferFlow,
  instructions: [
    'Create sender token account',
    'Create receiver token account',
    'Verify sender account exists',
    'Send tokens from sender to receiver',
  ],
  prerequisites: ['An existing ADI with credits'],
};

// =============================================================================
// Data Writing Template
// =============================================================================

const dataWritingFlow: Flow = {
  version: '1.0',
  name: 'Data Storage',
  description: 'Demonstrates Accumulate data storage capabilities.',
  tags: ['beginner', 'data', 'storage'],
  variables: [
    {
      name: 'ADI_URL',
      type: 'url',
      description: 'Your ADI URL (e.g., "acc://my-adi.acme")',
      required: true,
    },
    {
      name: 'DATA_ACCOUNT_NAME',
      type: 'string',
      description: 'Name for the data account',
      default: 'data',
      required: false,
    },
    {
      name: 'DATA_CONTENT',
      type: 'string',
      description: 'Data to store',
      default: 'Hello, Accumulate!',
      required: false,
    },
  ],
  nodes: [
    {
      id: 'create_data_account',
      type: 'CreateDataAccount',
      label: 'Create Data Account',
      config: { url: '{{ADI_URL}}/{{DATA_ACCOUNT_NAME}}' },
      position: { x: 100, y: 100 },
    },
    {
      id: 'write_data',
      type: 'WriteData',
      label: 'Write Data',
      config: { entries: ['{{DATA_CONTENT}}'], scratch: false, writeToState: false },
      position: { x: 100, y: 200 },
    },
    {
      id: 'query_account',
      type: 'QueryAccount',
      label: 'Verify Data',
      config: { url: '{{ADI_URL}}/{{DATA_ACCOUNT_NAME}}' },
      position: { x: 100, y: 300 },
    },
  ],
  connections: [
    { id: 'conn_1', sourceNodeId: 'create_data_account', sourcePortId: 'output', targetNodeId: 'write_data', targetPortId: 'input' },
    { id: 'conn_2', sourceNodeId: 'write_data', sourcePortId: 'output', targetNodeId: 'query_account', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{ADI_URL}}/{{DATA_ACCOUNT_NAME}}', message: 'Data account should exist' },
    { type: 'chain.entry_count_delta_min', url: '{{ADI_URL}}/{{DATA_ACCOUNT_NAME}}', chain: 'main', minDelta: 1, message: 'Main chain should have at least one new entry' },
    { type: 'receipt.verified', sourceStep: 'create_data_account', message: 'Data account creation receipt should be valid' },
    { type: 'receipt.verified', sourceStep: 'write_data', message: 'Write data receipt should be valid' },
  ],
};

export const dataWritingTemplate: FlowTemplate = {
  id: 'data-writing',
  name: 'Data Storage',
  description: 'Demonstrates Accumulate data storage capabilities. Creates a data account and writes entries to it.',
  category: 'beginner',
  estimatedTime: '5 min',
  tags: ['beginner', 'data', 'storage', 'write'],
  flow: dataWritingFlow,
  instructions: [
    'Create data account under ADI',
    'Write data entry to the account',
    'Query account to verify data',
  ],
  prerequisites: ['An existing ADI with credits'],
};

// =============================================================================
// Custom Token Template
// =============================================================================

const customTokenFlow: Flow = {
  version: '1.0',
  name: 'Custom Token Issuance',
  description: 'Creates and issues a custom token on Accumulate.',
  tags: ['advanced', 'tokens', 'issuer'],
  variables: [
    {
      name: 'ADI_URL',
      type: 'url',
      description: 'Your ADI URL',
      required: true,
    },
    {
      name: 'TOKEN_SYMBOL',
      type: 'string',
      description: 'Token symbol (e.g., "MYT")',
      required: true,
    },
    {
      name: 'TOKEN_PRECISION',
      type: 'int',
      description: 'Decimal precision (0-18)',
      default: 8,
      required: false,
    },
    {
      name: 'SUPPLY_LIMIT',
      type: 'decimal',
      description: 'Maximum supply (empty for unlimited)',
      required: false,
    },
    {
      name: 'INITIAL_ISSUE_AMOUNT',
      type: 'decimal',
      description: 'Initial tokens to issue',
      default: '1000000.00000000',
      required: false,
    },
    {
      name: 'RECIPIENT_URL',
      type: 'url',
      description: 'Recipient token account URL',
      required: true,
    },
  ],
  nodes: [
    {
      id: 'create_token',
      type: 'CreateToken',
      label: 'Create Token Issuer',
      config: { url: '{{ADI_URL}}/{{TOKEN_SYMBOL}}', symbol: '{{TOKEN_SYMBOL}}', precision: '{{TOKEN_PRECISION}}', supplyLimit: '{{SUPPLY_LIMIT}}' },
      position: { x: 100, y: 100 },
    },
    {
      id: 'issue_tokens',
      type: 'IssueTokens',
      label: 'Issue Tokens',
      config: { recipient: '{{RECIPIENT_URL}}', amount: '{{INITIAL_ISSUE_AMOUNT}}' },
      position: { x: 100, y: 200 },
    },
    {
      id: 'query_token',
      type: 'QueryAccount',
      label: 'Verify Token',
      config: { url: '{{ADI_URL}}/{{TOKEN_SYMBOL}}' },
      position: { x: 100, y: 300 },
    },
    {
      id: 'send_tokens',
      type: 'SendTokens',
      label: 'Send Custom Tokens',
      config: { recipients: [{ url: '{{RECIPIENT_URL}}', amount: '100.00000000' }] },
      position: { x: 100, y: 400 },
    },
  ],
  connections: [
    { id: 'conn_1', sourceNodeId: 'create_token', sourcePortId: 'output', targetNodeId: 'issue_tokens', targetPortId: 'input' },
    { id: 'conn_2', sourceNodeId: 'issue_tokens', sourcePortId: 'output', targetNodeId: 'query_token', targetPortId: 'input' },
    { id: 'conn_3', sourceNodeId: 'issue_tokens', sourcePortId: 'output', targetNodeId: 'send_tokens', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{ADI_URL}}/{{TOKEN_SYMBOL}}', message: 'Token issuer account should exist' },
    { type: 'balance.equals', account: '{{RECIPIENT_URL}}', equals: '{{INITIAL_ISSUE_AMOUNT}}', message: 'Recipient should have received initial issuance' },
    { type: 'receipt.verified', sourceStep: 'create_token', message: 'Token creation receipt should be valid' },
    { type: 'receipt.verified', sourceStep: 'issue_tokens', message: 'Token issuance receipt should be valid' },
    { type: 'synthetic.delivered', sourceStep: 'issue_tokens', message: 'Token issuance synthetic transaction should be delivered' },
  ],
};

export const customTokenTemplate: FlowTemplate = {
  id: 'custom-token',
  name: 'Custom Token Issuance',
  description: 'Advanced flow for creating your own custom token. Create a token issuer, issue tokens, and distribute them.',
  category: 'advanced',
  estimatedTime: '10 min',
  tags: ['advanced', 'tokens', 'issuer', 'custom'],
  flow: customTokenFlow,
  instructions: [
    'Create the token issuer account',
    'Issue initial supply of tokens',
    'Verify token creation',
    'Send custom tokens to recipients',
  ],
  prerequisites: ['An existing ADI with credits', 'A recipient token account'],
};

// =============================================================================
// Multi-Sig Setup Template
// =============================================================================

const multiSigSetupFlow: Flow = {
  version: '1.0',
  name: 'Multi-Signature Setup',
  description: 'Configures multi-signature authentication with thresholds.',
  tags: ['advanced', 'security', 'multi-sig'],
  variables: [
    {
      name: 'ADI_URL',
      type: 'url',
      description: 'Your ADI URL',
      required: true,
    },
    {
      name: 'KEY_BOOK_NAME',
      type: 'string',
      description: 'Name for the multi-sig key book',
      default: 'multisig-book',
      required: false,
    },
    {
      name: 'SIGNER_1_PUBLIC_KEY_HASH',
      type: 'string',
      description: 'First signer public key hash',
      required: true,
    },
    {
      name: 'SIGNER_2_PUBLIC_KEY_HASH',
      type: 'string',
      description: 'Second signer public key hash',
      required: true,
    },
    {
      name: 'SIGNER_3_PUBLIC_KEY_HASH',
      type: 'string',
      description: 'Third signer public key hash',
      required: true,
    },
    {
      name: 'THRESHOLD',
      type: 'int',
      description: 'Number of signatures required (e.g., 2 of 3)',
      default: 2,
      required: false,
    },
  ],
  nodes: [
    {
      id: 'create_key_book',
      type: 'CreateKeyBook',
      label: 'Create Multi-Sig Key Book',
      config: { url: '{{ADI_URL}}/{{KEY_BOOK_NAME}}', publicKeyHash: '{{SIGNER_1_PUBLIC_KEY_HASH}}' },
      position: { x: 100, y: 100 },
    },
    {
      id: 'create_key_page',
      type: 'CreateKeyPage',
      label: 'Create Key Page',
      config: { url: '{{ADI_URL}}/{{KEY_BOOK_NAME}}/1', keys: ['{{SIGNER_1_PUBLIC_KEY_HASH}}'] },
      position: { x: 100, y: 200 },
    },
    {
      id: 'add_signer_2',
      type: 'UpdateKeyPage',
      label: 'Add Signer 2',
      config: { operations: [{ type: 'add', key: '{{SIGNER_2_PUBLIC_KEY_HASH}}' }] },
      position: { x: 100, y: 300 },
    },
    {
      id: 'add_signer_3',
      type: 'UpdateKeyPage',
      label: 'Add Signer 3',
      config: { operations: [{ type: 'add', key: '{{SIGNER_3_PUBLIC_KEY_HASH}}' }] },
      position: { x: 100, y: 400 },
    },
    {
      id: 'set_threshold',
      type: 'UpdateKeyPage',
      label: 'Set Threshold',
      config: { operations: [{ type: 'setThreshold', threshold: '{{THRESHOLD}}' }] },
      position: { x: 100, y: 500 },
    },
  ],
  connections: [
    { id: 'conn_1', sourceNodeId: 'create_key_book', sourcePortId: 'output', targetNodeId: 'create_key_page', targetPortId: 'input' },
    { id: 'conn_2', sourceNodeId: 'create_key_page', sourcePortId: 'output', targetNodeId: 'add_signer_2', targetPortId: 'input' },
    { id: 'conn_3', sourceNodeId: 'add_signer_2', sourcePortId: 'output', targetNodeId: 'add_signer_3', targetPortId: 'input' },
    { id: 'conn_4', sourceNodeId: 'add_signer_3', sourcePortId: 'output', targetNodeId: 'set_threshold', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{ADI_URL}}/{{KEY_BOOK_NAME}}', message: 'Multi-sig key book should exist' },
    { type: 'account.exists', url: '{{ADI_URL}}/{{KEY_BOOK_NAME}}/1', message: 'Key page should exist' },
    { type: 'receipt.verified', sourceStep: 'create_key_book', message: 'Key book creation receipt should be valid' },
    { type: 'receipt.verified', sourceStep: 'create_key_page', message: 'Key page creation receipt should be valid' },
    { type: 'receipt.verified', sourceStep: 'set_threshold', message: 'Threshold update receipt should be valid' },
  ],
};

export const multiSigSetupTemplate: FlowTemplate = {
  id: 'multi-sig-setup',
  name: 'Multi-Signature Setup',
  description: 'Advanced security configuration. Sets up multi-signature scheme with multiple key pages and thresholds.',
  category: 'advanced',
  estimatedTime: '15 min',
  tags: ['advanced', 'security', 'multi-sig', 'key-management'],
  flow: multiSigSetupFlow,
  instructions: [
    'Create a dedicated multi-sig key book',
    'Create the initial key page with first signer',
    'Add second signer to key page',
    'Add third signer to key page',
    'Set the signature threshold (e.g., 2 of 3)',
  ],
  prerequisites: ['An existing ADI with credits', 'Public key hashes for all signers'],
};

// =============================================================================
// Key Rotation Template
// =============================================================================

const keyRotationFlow: Flow = {
  version: '1.0',
  name: 'Key Rotation',
  description: 'Security best practice for rotating keys.',
  tags: ['advanced', 'security', 'key-management'],
  variables: [
    {
      name: 'KEY_PAGE_URL',
      type: 'url',
      description: 'Key page URL to update',
      required: true,
    },
    {
      name: 'OLD_PUBLIC_KEY_HASH',
      type: 'string',
      description: 'Hash of the key being replaced',
      required: true,
    },
  ],
  nodes: [
    {
      id: 'generate_new_keys',
      type: 'GenerateKeys',
      label: 'Generate New Keys',
      config: { algorithm: 'Ed25519' },
      position: { x: 100, y: 100 },
    },
    {
      id: 'update_key',
      type: 'UpdateKey',
      label: 'Update Key',
      config: { newKey: '{{generate_new_keys.publicKeyHash}}' },
      position: { x: 100, y: 200 },
    },
    {
      id: 'verify_key_page',
      type: 'QueryAccount',
      label: 'Verify Key Page',
      config: { url: '{{KEY_PAGE_URL}}' },
      position: { x: 100, y: 300 },
    },
  ],
  connections: [
    { id: 'conn_1', sourceNodeId: 'generate_new_keys', sourcePortId: 'output', targetNodeId: 'update_key', targetPortId: 'input' },
    { id: 'conn_2', sourceNodeId: 'update_key', sourcePortId: 'output', targetNodeId: 'verify_key_page', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{KEY_PAGE_URL}}', message: 'Key page should still exist after rotation' },
    { type: 'receipt.verified', sourceStep: 'update_key', message: 'Key update receipt should be valid' },
    { type: 'tx.status.equals', sourceStep: 'update_key', status: 'delivered', message: 'Key update transaction should be delivered' },
  ],
};

export const keyRotationTemplate: FlowTemplate = {
  id: 'key-rotation',
  name: 'Key Rotation',
  description: 'Security best practice for rotating keys. Generates a new keypair and updates the key page.',
  category: 'advanced',
  estimatedTime: '5 min',
  tags: ['advanced', 'security', 'key-management', 'rotation'],
  flow: keyRotationFlow,
  instructions: [
    'Generate new keypair for rotation',
    'Update the key on the key page',
    'Verify key page was updated',
  ],
  prerequisites: ['An existing key page with the old key', 'Access to sign with the old key'],
};

// =============================================================================
// Template Registry
// =============================================================================

/**
 * All available Golden Path templates
 */
export const GOLDEN_PATH_TEMPLATES: FlowTemplate[] = [
  zeroToHeroTemplate,
  liteAccountSetupTemplate,
  adiCreationTemplate,
  tokenTransferTemplate,
  dataWritingTemplate,
  customTokenTemplate,
  multiSigSetupTemplate,
  keyRotationTemplate,
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): FlowTemplate | undefined {
  return GOLDEN_PATH_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: 'beginner' | 'intermediate' | 'advanced'): FlowTemplate[] {
  return GOLDEN_PATH_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get templates by tag
 */
export function getTemplatesByTag(tag: string): FlowTemplate[] {
  return GOLDEN_PATH_TEMPLATES.filter((t) => t.tags.includes(tag));
}

/**
 * Search templates by name or description
 */
export function searchTemplates(query: string): FlowTemplate[] {
  const lowerQuery = query.toLowerCase();
  return GOLDEN_PATH_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Template categories with counts
 */
export function getTemplateCategoryCounts(): Record<string, number> {
  return {
    all: GOLDEN_PATH_TEMPLATES.length,
    beginner: GOLDEN_PATH_TEMPLATES.filter((t) => t.category === 'beginner').length,
    intermediate: GOLDEN_PATH_TEMPLATES.filter((t) => t.category === 'intermediate').length,
    advanced: GOLDEN_PATH_TEMPLATES.filter((t) => t.category === 'advanced').length,
  };
}

// =============================================================================
// Default Export
// =============================================================================

export default GOLDEN_PATH_TEMPLATES;
