/**
 * Golden Path Flow Templates
 *
 * Real flow definitions with nodes, connections, and configs based on
 * the canonical YAML templates in /templates/*.yaml.
 * These are loaded into the canvas when a user selects a template.
 */

import type { Flow, FlowTemplate } from '@accumulate-studio/types';

// =============================================================================
// Helper: standard vertical layout positions
// =============================================================================

function pos(index: number, xOffset = 300): { x: number; y: number } {
  return { x: xOffset, y: 80 + index * 160 };
}

// =============================================================================
// 1. Lite Account Setup (beginner)
// =============================================================================

const liteAccountSetupFlow: Flow = {
  version: '1.0',
  name: 'Lite Account Setup',
  description:
    'The simplest Accumulate flow. Generates a keypair which automatically creates a lite identity and lite token account, then funds it via the testnet faucet.',
  variables: [],
  nodes: [
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: pos(0),
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Tokens',
      config: { account: '{{generate_keys.liteTokenAccount}}', times: 1 },
      position: pos(1),
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for Balance',
      config: {
        account: '{{generate_keys.liteTokenAccount}}',
        minBalance: '5.00000000',
        maxAttempts: 30,
        delayMs: 2000,
      },
      position: pos(2),
    },
  ],
  connections: [
    {
      id: 'conn_generate_keys_faucet',
      sourceNodeId: 'generate_keys',
      sourcePortId: 'output',
      targetNodeId: 'faucet',
      targetPortId: 'input',
    },
    {
      id: 'conn_faucet_wait',
      sourceNodeId: 'faucet',
      sourcePortId: 'output',
      targetNodeId: 'wait_for_balance',
      targetPortId: 'input',
    },
  ],
  assertions: [
    {
      type: 'account.exists',
      url: '{{generate_keys.liteTokenAccount}}',
      message: 'Lite token account should exist after faucet',
    },
    {
      type: 'balance.delta',
      account: '{{generate_keys.liteTokenAccount}}',
      delta: '5.00000000',
      message: 'Balance should increase by at least 5 ACME',
    },
  ],
};

// =============================================================================
// 2. Full ADI Creation (beginner)
// =============================================================================

const adiCreationFlow: Flow = {
  version: '1.0',
  name: 'Create ADI',
  description:
    'Creates an Accumulate Digital Identity (ADI). The CreateIdentity transaction automatically provisions a key book and first key page with your public key.',
  variables: [
    { name: 'ADI_NAME', type: 'string', description: "Name for your ADI (e.g., 'my-company')", required: true },
  ],
  nodes: [
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: pos(0),
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Fund Lite Account',
      config: { account: '{{generate_keys.liteTokenAccount}}', times: 3 },
      position: pos(1),
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for ACME',
      config: {
        account: '{{generate_keys.liteTokenAccount}}',
        minBalance: '15.00000000',
        maxAttempts: 30,
        delayMs: 2000,
      },
      position: pos(2),
    },
    {
      id: 'add_credits',
      type: 'AddCredits',
      label: 'Add Credits',
      config: {
        recipient: '{{generate_keys.liteIdentity}}',
        amount: '10.00000000',
      },
      position: pos(3),
    },
    {
      id: 'create_identity',
      type: 'CreateIdentity',
      label: 'Create ADI',
      config: {
        url: 'acc://{{ADI_NAME}}.acme',
      },
      position: pos(4),
    },
  ],
  connections: [
    { id: 'conn_gk_faucet', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_faucet_wait', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
    { id: 'conn_wait_credits', sourceNodeId: 'wait_for_balance', sourcePortId: 'output', targetNodeId: 'add_credits', targetPortId: 'input' },
    { id: 'conn_credits_adi', sourceNodeId: 'add_credits', sourcePortId: 'output', targetNodeId: 'create_identity', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{create_identity.adiUrl}}', message: 'ADI should exist' },
    { type: 'account.exists', url: '{{create_identity.keyBookUrl}}', message: 'Key book should exist (auto-created by CreateIdentity)' },
    { type: 'account.exists', url: '{{create_identity.keyPageUrl}}', message: 'Key page should exist (auto-created by CreateIdentity)' },
  ],
};

// =============================================================================
// 3. Zero to Hero (beginner)
// =============================================================================

const zeroToHeroFlow: Flow = {
  version: '1.0',
  name: 'Zero to Hero: From Nothing to ADI',
  description:
    'Complete beginner flow that takes you from zero to a fully functional ADI with a token account. Perfect for first-time users.',
  variables: [
    { name: 'ADI_NAME', type: 'string', description: "Name for your ADI (e.g., 'my-first-adi')", required: true },
  ],
  nodes: [
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: pos(0),
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Tokens',
      config: { account: '{{generate_keys.liteTokenAccount}}', times: 2 },
      position: pos(1),
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for ACME',
      config: {
        account: '{{generate_keys.liteTokenAccount}}',
        minBalance: '10.00000000',
        maxAttempts: 30,
        delayMs: 2000,
      },
      position: pos(2),
    },
    {
      id: 'add_credits',
      type: 'AddCredits',
      label: 'Add Credits',
      config: {
        recipient: '{{generate_keys.liteIdentity}}',
        amount: '5.00000000',
      },
      position: pos(3),
    },
    {
      id: 'wait_for_credits',
      type: 'WaitForCredits',
      label: 'Wait for Credits',
      config: {
        account: '{{generate_keys.liteIdentity}}',
        minCredits: 1000,
        maxAttempts: 30,
        delayMs: 2000,
      },
      position: pos(4),
    },
    {
      id: 'create_identity',
      type: 'CreateIdentity',
      label: 'Create ADI',
      config: {
        url: 'acc://{{ADI_NAME}}.acme',
      },
      position: pos(5),
    },
    {
      id: 'add_adi_credits',
      type: 'AddCredits',
      label: 'Credit Key Page',
      config: {
        recipient: '{{create_identity.adiUrl}}/book/1',
        amount: '5.00000000',
      },
      position: pos(6),
    },
    {
      id: 'wait_for_adi_credits',
      type: 'WaitForCredits',
      label: 'Wait for Key Page Credits',
      config: {
        account: '{{create_identity.adiUrl}}/book/1',
        minCredits: 1000,
        maxAttempts: 30,
        delayMs: 2000,
      },
      position: pos(7),
    },
    {
      id: 'create_token_account',
      type: 'CreateTokenAccount',
      label: 'Create Token Account',
      config: {
        url: 'acc://{{ADI_NAME}}.acme/tokens',
        tokenUrl: 'acc://ACME',
        principal: '{{create_identity.adiUrl}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
      },
      position: pos(8),
    },
  ],
  connections: [
    { id: 'conn_gk_faucet', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_faucet_wait', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
    { id: 'conn_wait_credits', sourceNodeId: 'wait_for_balance', sourcePortId: 'output', targetNodeId: 'add_credits', targetPortId: 'input' },
    { id: 'conn_credits_waitc', sourceNodeId: 'add_credits', sourcePortId: 'output', targetNodeId: 'wait_for_credits', targetPortId: 'input' },
    { id: 'conn_waitc_adi', sourceNodeId: 'wait_for_credits', sourcePortId: 'output', targetNodeId: 'create_identity', targetPortId: 'input' },
    { id: 'conn_adi_adicredits', sourceNodeId: 'create_identity', sourcePortId: 'output', targetNodeId: 'add_adi_credits', targetPortId: 'input' },
    { id: 'conn_adicredits_waitadic', sourceNodeId: 'add_adi_credits', sourcePortId: 'output', targetNodeId: 'wait_for_adi_credits', targetPortId: 'input' },
    { id: 'conn_waitadic_token', sourceNodeId: 'wait_for_adi_credits', sourcePortId: 'output', targetNodeId: 'create_token_account', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{generate_keys.liteTokenAccount}}', message: 'Lite token account should exist' },
    { type: 'account.exists', url: '{{create_identity.adiUrl}}', message: 'ADI should exist after creation' },
    { type: 'account.exists', url: '{{create_identity.keyBookUrl}}', message: 'Key book should exist under ADI' },
    { type: 'account.exists', url: '{{create_identity.keyPageUrl}}', message: 'Key page should exist under ADI' },
    { type: 'account.exists', url: '{{create_token_account.tokenAccountUrl}}', message: 'Token account should exist under ADI' },
    { type: 'tx.status.equals', sourceStep: 'create_identity', status: 'success', message: 'CreateIdentity transaction should succeed' },
    { type: 'tx.status.equals', sourceStep: 'add_adi_credits', status: 'success', message: 'Key page credits transaction should succeed' },
    { type: 'tx.status.equals', sourceStep: 'create_token_account', status: 'success', message: 'CreateTokenAccount transaction should succeed' },
  ],
};

// =============================================================================
// 4. Token Transfer (self-contained, from scratch)
// =============================================================================

const tokenTransferFlow: Flow = {
  version: '1.0',
  name: 'Token Transfer',
  description:
    'Complete token transfer flow: sets up keys, funds via faucet, creates an ADI with two token accounts, funds the sender, then transfers ACME between them.',
  variables: [
    { name: 'ADI_NAME', type: 'string', description: "Name for your ADI (e.g., 'my-transfer-adi')", required: true },
    { name: 'TRANSFER_AMOUNT', type: 'decimal', description: 'Amount of ACME to transfer', default: '1.00000000' },
  ],
  nodes: [
    // ── Setup: keys, faucet, credits ──
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: pos(0),
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Tokens',
      config: { times: 3 },
      position: pos(1),
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for ACME',
      config: { minBalance: '15.00000000', maxAttempts: 30, delayMs: 2000 },
      position: pos(2),
    },
    {
      id: 'add_credits',
      type: 'AddCredits',
      label: 'Add Credits',
      config: { amount: '5.00000000' },
      position: pos(3),
    },
    {
      id: 'wait_for_credits',
      type: 'WaitForCredits',
      label: 'Wait for Credits',
      config: { minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(4),
    },
    // ── Create ADI ──
    {
      id: 'create_identity',
      type: 'CreateIdentity',
      label: 'Create ADI',
      config: { url: 'acc://{{ADI_NAME}}.acme' },
      position: pos(5),
    },
    // ── Credit key page for ADI operations ──
    {
      id: 'add_adi_credits',
      type: 'AddCredits',
      label: 'Credit Key Page',
      config: { recipient: '{{create_identity.adiUrl}}/book/1', amount: '5.00000000' },
      position: pos(6),
    },
    {
      id: 'wait_for_adi_credits',
      type: 'WaitForCredits',
      label: 'Wait for Key Page Credits',
      config: { account: '{{create_identity.adiUrl}}/book/1', minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(7),
    },
    // ── Create token accounts ──
    {
      id: 'create_sender_account',
      type: 'CreateTokenAccount',
      label: 'Create Sender Account',
      config: {
        url: 'acc://{{ADI_NAME}}.acme/sender-tokens',
        tokenUrl: 'acc://ACME',
        principal: '{{create_identity.adiUrl}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
      },
      position: pos(8),
    },
    {
      id: 'create_receiver_account',
      type: 'CreateTokenAccount',
      label: 'Create Receiver Account',
      config: {
        url: 'acc://{{ADI_NAME}}.acme/receiver-tokens',
        tokenUrl: 'acc://ACME',
        principal: '{{create_identity.adiUrl}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
      },
      position: pos(9),
    },
    // ── Fund sender from lite token account ──
    {
      id: 'fund_sender',
      type: 'SendTokens',
      label: 'Fund Sender Account',
      config: {
        principal: '{{generate_keys.liteTokenAccount}}',
        to: '{{create_sender_account.tokenAccountUrl}}',
        amount: '500000000',
      },
      position: pos(10),
    },
    // ── Wait for sender to receive funds ──
    {
      id: 'wait_for_sender_balance',
      type: 'WaitForBalance',
      label: 'Wait for Sender Balance',
      config: { account: '{{create_sender_account.tokenAccountUrl}}', minBalance: '1.00000000', maxAttempts: 30, delayMs: 2000 },
      position: pos(11),
    },
    // ── Transfer between ADI accounts ──
    {
      id: 'send_tokens',
      type: 'SendTokens',
      label: 'Transfer Tokens',
      config: {
        principal: '{{create_sender_account.tokenAccountUrl}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
        recipients: [{ url: '{{create_receiver_account.tokenAccountUrl}}', amount: '{{TRANSFER_AMOUNT}}' }],
      },
      position: pos(12),
    },
  ],
  connections: [
    { id: 'conn_gk_faucet', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_faucet_wait', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
    { id: 'conn_wait_credits', sourceNodeId: 'wait_for_balance', sourcePortId: 'output', targetNodeId: 'add_credits', targetPortId: 'input' },
    { id: 'conn_credits_waitc', sourceNodeId: 'add_credits', sourcePortId: 'output', targetNodeId: 'wait_for_credits', targetPortId: 'input' },
    { id: 'conn_waitc_adi', sourceNodeId: 'wait_for_credits', sourcePortId: 'output', targetNodeId: 'create_identity', targetPortId: 'input' },
    { id: 'conn_adi_adicredits', sourceNodeId: 'create_identity', sourcePortId: 'output', targetNodeId: 'add_adi_credits', targetPortId: 'input' },
    { id: 'conn_adicredits_waitadic', sourceNodeId: 'add_adi_credits', sourcePortId: 'output', targetNodeId: 'wait_for_adi_credits', targetPortId: 'input' },
    { id: 'conn_waitadic_sender', sourceNodeId: 'wait_for_adi_credits', sourcePortId: 'output', targetNodeId: 'create_sender_account', targetPortId: 'input' },
    { id: 'conn_sender_receiver', sourceNodeId: 'create_sender_account', sourcePortId: 'output', targetNodeId: 'create_receiver_account', targetPortId: 'input' },
    { id: 'conn_receiver_fund', sourceNodeId: 'create_receiver_account', sourcePortId: 'output', targetNodeId: 'fund_sender', targetPortId: 'input' },
    { id: 'conn_fund_waitsender', sourceNodeId: 'fund_sender', sourcePortId: 'output', targetNodeId: 'wait_for_sender_balance', targetPortId: 'input' },
    { id: 'conn_waitsender_send', sourceNodeId: 'wait_for_sender_balance', sourcePortId: 'output', targetNodeId: 'send_tokens', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{create_identity.adiUrl}}', message: 'ADI should exist' },
    { type: 'account.exists', url: '{{create_identity.keyPageUrl}}', message: 'Key page should exist under ADI' },
    { type: 'account.exists', url: '{{create_sender_account.tokenAccountUrl}}', message: 'Sender token account should exist' },
    { type: 'account.exists', url: '{{create_receiver_account.tokenAccountUrl}}', message: 'Receiver token account should exist' },
    { type: 'tx.status.equals', sourceStep: 'create_identity', status: 'success', message: 'CreateIdentity transaction should succeed' },
    { type: 'tx.status.equals', sourceStep: 'create_sender_account', status: 'success', message: 'Create sender account should succeed' },
    { type: 'tx.status.equals', sourceStep: 'create_receiver_account', status: 'success', message: 'Create receiver account should succeed' },
    { type: 'tx.status.equals', sourceStep: 'fund_sender', status: 'success', message: 'Funding sender account should succeed' },
    { type: 'tx.status.equals', sourceStep: 'send_tokens', status: 'success', message: 'Token transfer should succeed' },
  ],
};

// =============================================================================
// 5. Data Writing (self-contained, from scratch)
// =============================================================================

const dataWritingFlow: Flow = {
  version: '1.0',
  name: 'Data Storage',
  description:
    'Complete data storage flow from scratch. Sets up keys, creates an ADI, then creates a data account and writes entries to it.',
  variables: [
    { name: 'ADI_NAME', type: 'string', description: "Name for your ADI (e.g., 'my-data-adi')", required: true },
    { name: 'DATA_CONTENT', type: 'string', description: 'Data to store', default: 'Hello, Accumulate!' },
  ],
  nodes: [
    // ── Setup: keys, faucet, credits ──
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: pos(0),
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Tokens',
      config: { times: 3 },
      position: pos(1),
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for ACME',
      config: { minBalance: '15.00000000', maxAttempts: 30, delayMs: 2000 },
      position: pos(2),
    },
    {
      id: 'add_credits',
      type: 'AddCredits',
      label: 'Add Credits',
      config: { amount: '5.00000000' },
      position: pos(3),
    },
    {
      id: 'wait_for_credits',
      type: 'WaitForCredits',
      label: 'Wait for Credits',
      config: { minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(4),
    },
    // ── Create ADI ──
    {
      id: 'create_identity',
      type: 'CreateIdentity',
      label: 'Create ADI',
      config: { url: 'acc://{{ADI_NAME}}.acme' },
      position: pos(5),
    },
    // ── Credit key page for ADI operations ──
    {
      id: 'add_adi_credits',
      type: 'AddCredits',
      label: 'Credit Key Page',
      config: { recipient: '{{create_identity.adiUrl}}/book/1', amount: '5.00000000' },
      position: pos(6),
    },
    {
      id: 'wait_for_adi_credits',
      type: 'WaitForCredits',
      label: 'Wait for Key Page Credits',
      config: { account: '{{create_identity.adiUrl}}/book/1', minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(7),
    },
    // ── Data operations ──
    {
      id: 'create_data_account',
      type: 'CreateDataAccount',
      label: 'Create Data Account',
      config: {
        url: 'acc://{{ADI_NAME}}.acme/data',
        principal: '{{create_identity.adiUrl}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
      },
      position: pos(8),
    },
    {
      id: 'write_data',
      type: 'WriteData',
      label: 'Write Data',
      config: {
        entries: ['{{DATA_CONTENT}}'],
        scratch: false,
        writeToState: false,
        principal: '{{create_data_account.dataAccountUrl}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
      },
      position: pos(9),
    },
    {
      id: 'query_account',
      type: 'QueryAccount',
      label: 'Verify Data',
      config: { url: '{{create_data_account.dataAccountUrl}}' },
      position: pos(10),
    },
  ],
  connections: [
    { id: 'conn_gk_faucet', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_faucet_wait', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
    { id: 'conn_wait_credits', sourceNodeId: 'wait_for_balance', sourcePortId: 'output', targetNodeId: 'add_credits', targetPortId: 'input' },
    { id: 'conn_credits_waitc', sourceNodeId: 'add_credits', sourcePortId: 'output', targetNodeId: 'wait_for_credits', targetPortId: 'input' },
    { id: 'conn_waitc_adi', sourceNodeId: 'wait_for_credits', sourcePortId: 'output', targetNodeId: 'create_identity', targetPortId: 'input' },
    { id: 'conn_adi_adicredits', sourceNodeId: 'create_identity', sourcePortId: 'output', targetNodeId: 'add_adi_credits', targetPortId: 'input' },
    { id: 'conn_adicredits_waitadic', sourceNodeId: 'add_adi_credits', sourcePortId: 'output', targetNodeId: 'wait_for_adi_credits', targetPortId: 'input' },
    { id: 'conn_waitadic_data', sourceNodeId: 'wait_for_adi_credits', sourcePortId: 'output', targetNodeId: 'create_data_account', targetPortId: 'input' },
    { id: 'conn_create_write', sourceNodeId: 'create_data_account', sourcePortId: 'output', targetNodeId: 'write_data', targetPortId: 'input' },
    { id: 'conn_write_query', sourceNodeId: 'write_data', sourcePortId: 'output', targetNodeId: 'query_account', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{create_identity.adiUrl}}', message: 'ADI should exist' },
    { type: 'account.exists', url: '{{create_data_account.dataAccountUrl}}', message: 'Data account should exist under ADI' },
    { type: 'tx.status.equals', sourceStep: 'create_identity', status: 'success', message: 'CreateIdentity should succeed' },
    { type: 'tx.status.equals', sourceStep: 'create_data_account', status: 'success', message: 'CreateDataAccount should succeed' },
    { type: 'tx.status.equals', sourceStep: 'write_data', status: 'success', message: 'WriteData should succeed' },
  ],
};

// =============================================================================
// 6. Custom Token Issuance (self-contained, from scratch)
// =============================================================================

const customTokenFlow: Flow = {
  version: '1.0',
  name: 'Custom Token Issuance',
  description:
    'Complete custom token flow from scratch. Sets up keys, creates an ADI, then creates a custom token issuer, issues tokens, and verifies the result.',
  variables: [
    { name: 'ADI_NAME', type: 'string', description: "Name for your ADI (e.g., 'my-token-adi')", required: true },
    { name: 'TOKEN_SYMBOL', type: 'string', description: "Token symbol (e.g., 'MYT')", required: true },
    { name: 'INITIAL_ISSUE_AMOUNT', type: 'decimal', description: 'Initial tokens to issue', default: '1000000.00000000' },
  ],
  nodes: [
    // ── Setup: keys, faucet, credits ──
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: pos(0),
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Tokens',
      config: { times: 3 },
      position: pos(1),
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for ACME',
      config: { minBalance: '15.00000000', maxAttempts: 30, delayMs: 2000 },
      position: pos(2),
    },
    {
      id: 'add_credits',
      type: 'AddCredits',
      label: 'Add Credits',
      config: { amount: '5.00000000' },
      position: pos(3),
    },
    {
      id: 'wait_for_credits',
      type: 'WaitForCredits',
      label: 'Wait for Credits',
      config: { minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(4),
    },
    // ── Create ADI ──
    {
      id: 'create_identity',
      type: 'CreateIdentity',
      label: 'Create ADI',
      config: { url: 'acc://{{ADI_NAME}}.acme' },
      position: pos(5),
    },
    // ── Credit key page for ADI operations ──
    {
      id: 'add_adi_credits',
      type: 'AddCredits',
      label: 'Credit Key Page',
      config: { recipient: '{{create_identity.adiUrl}}/book/1', amount: '5.00000000' },
      position: pos(6),
    },
    {
      id: 'wait_for_adi_credits',
      type: 'WaitForCredits',
      label: 'Wait for Key Page Credits',
      config: { account: '{{create_identity.adiUrl}}/book/1', minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(7),
    },
    // ── Token operations ──
    {
      id: 'create_token',
      type: 'CreateToken',
      label: 'Create Token Issuer',
      config: {
        url: 'acc://{{ADI_NAME}}.acme/{{TOKEN_SYMBOL}}',
        symbol: '{{TOKEN_SYMBOL}}',
        precision: 8,
        principal: '{{create_identity.adiUrl}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
      },
      position: pos(8),
    },
    {
      id: 'create_token_account',
      type: 'CreateTokenAccount',
      label: 'Create Token Account',
      config: {
        url: 'acc://{{ADI_NAME}}.acme/{{TOKEN_SYMBOL}}-account',
        tokenUrl: 'acc://{{ADI_NAME}}.acme/{{TOKEN_SYMBOL}}',
        principal: '{{create_identity.adiUrl}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
      },
      position: pos(9),
    },
    {
      id: 'issue_tokens',
      type: 'IssueTokens',
      label: 'Issue Tokens',
      config: {
        principal: '{{create_token.tokenUrl}}',
        url: '{{create_token.tokenUrl}}',
        recipient: '{{create_token_account.tokenAccountUrl}}',
        amount: '{{INITIAL_ISSUE_AMOUNT}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
      },
      position: pos(10),
    },
    {
      id: 'query_token',
      type: 'QueryAccount',
      label: 'Verify Issuer',
      config: { url: '{{create_token.url}}' },
      position: pos(11),
    },
  ],
  connections: [
    { id: 'conn_gk_faucet', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_faucet_wait', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
    { id: 'conn_wait_credits', sourceNodeId: 'wait_for_balance', sourcePortId: 'output', targetNodeId: 'add_credits', targetPortId: 'input' },
    { id: 'conn_credits_waitc', sourceNodeId: 'add_credits', sourcePortId: 'output', targetNodeId: 'wait_for_credits', targetPortId: 'input' },
    { id: 'conn_waitc_adi', sourceNodeId: 'wait_for_credits', sourcePortId: 'output', targetNodeId: 'create_identity', targetPortId: 'input' },
    { id: 'conn_adi_adicredits', sourceNodeId: 'create_identity', sourcePortId: 'output', targetNodeId: 'add_adi_credits', targetPortId: 'input' },
    { id: 'conn_adicredits_waitadic', sourceNodeId: 'add_adi_credits', sourcePortId: 'output', targetNodeId: 'wait_for_adi_credits', targetPortId: 'input' },
    { id: 'conn_waitadic_token', sourceNodeId: 'wait_for_adi_credits', sourcePortId: 'output', targetNodeId: 'create_token', targetPortId: 'input' },
    { id: 'conn_token_account', sourceNodeId: 'create_token', sourcePortId: 'output', targetNodeId: 'create_token_account', targetPortId: 'input' },
    { id: 'conn_account_issue', sourceNodeId: 'create_token_account', sourcePortId: 'output', targetNodeId: 'issue_tokens', targetPortId: 'input' },
    { id: 'conn_issue_query', sourceNodeId: 'issue_tokens', sourcePortId: 'output', targetNodeId: 'query_token', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{create_identity.adiUrl}}', message: 'ADI should exist' },
    { type: 'account.exists', url: '{{create_token.url}}', message: 'Token issuer should exist' },
    { type: 'account.exists', url: '{{create_token_account.tokenAccountUrl}}', message: 'Token account should exist' },
    { type: 'tx.status.equals', sourceStep: 'create_token', status: 'success', message: 'CreateToken should succeed' },
    { type: 'tx.status.equals', sourceStep: 'create_token_account', status: 'success', message: 'CreateTokenAccount should succeed' },
    { type: 'tx.status.equals', sourceStep: 'issue_tokens', status: 'success', message: 'IssueTokens should succeed' },
  ],
};

// =============================================================================
// 7. Multi-Signature Setup (self-contained, from scratch)
// =============================================================================

const multiSigSetupFlow: Flow = {
  version: '1.0',
  name: 'Multi-Signature Setup',
  description:
    'Complete multi-sig flow from scratch. Sets up keys, creates an ADI, then creates a dedicated key book with multiple signers and a 2-of-3 threshold.',
  variables: [
    { name: 'ADI_NAME', type: 'string', description: "Name for your ADI (e.g., 'my-multisig-adi')", required: true },
  ],
  nodes: [
    // ── Setup: keys, faucet, credits ──
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys (Signer 1)',
      config: { algorithm: 'Ed25519' },
      position: pos(0),
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Tokens',
      config: { times: 3 },
      position: pos(1),
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for ACME',
      config: { minBalance: '15.00000000', maxAttempts: 30, delayMs: 2000 },
      position: pos(2),
    },
    {
      id: 'add_credits',
      type: 'AddCredits',
      label: 'Add Credits',
      config: { amount: '10.00000000' },
      position: pos(3),
    },
    {
      id: 'wait_for_credits',
      type: 'WaitForCredits',
      label: 'Wait for Credits',
      config: { minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(4),
    },
    // ── Create ADI ──
    {
      id: 'create_identity',
      type: 'CreateIdentity',
      label: 'Create ADI',
      config: { url: 'acc://{{ADI_NAME}}.acme' },
      position: pos(5),
    },
    // ── Credit key page for ADI operations ──
    {
      id: 'add_adi_credits',
      type: 'AddCredits',
      label: 'Credit Key Page',
      config: { recipient: '{{create_identity.adiUrl}}/book/1', amount: '10.00000000' },
      position: pos(6),
    },
    {
      id: 'wait_for_adi_credits',
      type: 'WaitForCredits',
      label: 'Wait for Key Page Credits',
      config: { account: '{{create_identity.adiUrl}}/book/1', minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(7),
    },
    // ── Multi-sig operations ──
    {
      id: 'create_key_book',
      type: 'CreateKeyBook',
      label: 'Create Multi-Sig Key Book',
      config: {
        url: '{{create_identity.adiUrl}}/multisig-book',
        publicKeyHash: '{{generate_keys.publicKeyHash}}',
        principal: '{{create_identity.adiUrl}}',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
      },
      position: pos(8),
    },
    // ── Credit the new multisig key page ──
    {
      id: 'credit_multisig_page',
      type: 'AddCredits',
      label: 'Credit Multi-Sig Key Page',
      config: {
        recipient: '{{create_identity.adiUrl}}/multisig-book/1',
        amount: '5.00000000',
      },
      position: pos(9),
    },
    {
      id: 'wait_multisig_credits',
      type: 'WaitForCredits',
      label: 'Wait for Multi-Sig Credits',
      config: {
        account: '{{create_identity.adiUrl}}/multisig-book/1',
        minCredits: 1000,
        maxAttempts: 30,
        delayMs: 2000,
      },
      position: pos(10),
    },
    // ── Add signers and set threshold ──
    {
      id: 'generate_keys_2',
      type: 'GenerateKeys',
      label: 'Generate Keys (Signer 2)',
      config: { algorithm: 'Ed25519' },
      position: pos(11),
    },
    {
      id: 'add_signer_2',
      type: 'UpdateKeyPage',
      label: 'Add Signer 2',
      config: {
        url: '{{create_identity.adiUrl}}/multisig-book/1',
        operation: [{ type: 'add', entry: { keyHash: '{{generate_keys_2.publicKeyHash}}' } }],
        signerUrl: '{{create_identity.adiUrl}}/multisig-book/1',
        keyVarName: '{{generate_keys.varName}}',
      },
      position: pos(12),
    },
    {
      id: 'generate_keys_3',
      type: 'GenerateKeys',
      label: 'Generate Keys (Signer 3)',
      config: { algorithm: 'Ed25519' },
      position: pos(13),
    },
    {
      id: 'add_signer_3',
      type: 'UpdateKeyPage',
      label: 'Add Signer 3',
      config: {
        url: '{{create_identity.adiUrl}}/multisig-book/1',
        operation: [{ type: 'add', entry: { keyHash: '{{generate_keys_3.publicKeyHash}}' } }],
        signerUrl: '{{create_identity.adiUrl}}/multisig-book/1',
        keyVarName: '{{generate_keys.varName}}',
      },
      position: pos(14),
    },
    {
      id: 'set_threshold',
      type: 'UpdateKeyPage',
      label: 'Set Threshold (2 of 3)',
      config: {
        url: '{{create_identity.adiUrl}}/multisig-book/1',
        operation: [{ type: 'setThreshold', threshold: 2 }],
        signerUrl: '{{create_identity.adiUrl}}/multisig-book/1',
        keyVarName: '{{generate_keys.varName}}',
      },
      position: pos(15),
    },
  ],
  connections: [
    { id: 'conn_gk_faucet', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_faucet_wait', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
    { id: 'conn_wait_credits', sourceNodeId: 'wait_for_balance', sourcePortId: 'output', targetNodeId: 'add_credits', targetPortId: 'input' },
    { id: 'conn_credits_waitc', sourceNodeId: 'add_credits', sourcePortId: 'output', targetNodeId: 'wait_for_credits', targetPortId: 'input' },
    { id: 'conn_waitc_adi', sourceNodeId: 'wait_for_credits', sourcePortId: 'output', targetNodeId: 'create_identity', targetPortId: 'input' },
    { id: 'conn_adi_adicredits', sourceNodeId: 'create_identity', sourcePortId: 'output', targetNodeId: 'add_adi_credits', targetPortId: 'input' },
    { id: 'conn_adicredits_waitadic', sourceNodeId: 'add_adi_credits', sourcePortId: 'output', targetNodeId: 'wait_for_adi_credits', targetPortId: 'input' },
    { id: 'conn_waitadic_book', sourceNodeId: 'wait_for_adi_credits', sourcePortId: 'output', targetNodeId: 'create_key_book', targetPortId: 'input' },
    { id: 'conn_book_creditms', sourceNodeId: 'create_key_book', sourcePortId: 'output', targetNodeId: 'credit_multisig_page', targetPortId: 'input' },
    { id: 'conn_creditms_waitms', sourceNodeId: 'credit_multisig_page', sourcePortId: 'output', targetNodeId: 'wait_multisig_credits', targetPortId: 'input' },
    { id: 'conn_waitms_gk2', sourceNodeId: 'wait_multisig_credits', sourcePortId: 'output', targetNodeId: 'generate_keys_2', targetPortId: 'input' },
    { id: 'conn_gk2_s2', sourceNodeId: 'generate_keys_2', sourcePortId: 'output', targetNodeId: 'add_signer_2', targetPortId: 'input' },
    { id: 'conn_s2_gk3', sourceNodeId: 'add_signer_2', sourcePortId: 'output', targetNodeId: 'generate_keys_3', targetPortId: 'input' },
    { id: 'conn_gk3_s3', sourceNodeId: 'generate_keys_3', sourcePortId: 'output', targetNodeId: 'add_signer_3', targetPortId: 'input' },
    { id: 'conn_s3_threshold', sourceNodeId: 'add_signer_3', sourcePortId: 'output', targetNodeId: 'set_threshold', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{create_identity.adiUrl}}', message: 'ADI should exist' },
    { type: 'account.exists', url: '{{create_identity.keyPageUrl}}', message: 'Default key page should exist' },
    { type: 'tx.status.equals', sourceStep: 'create_identity', status: 'success', message: 'CreateIdentity should succeed' },
    { type: 'tx.status.equals', sourceStep: 'create_key_book', status: 'success', message: 'CreateKeyBook should succeed' },
    { type: 'tx.status.equals', sourceStep: 'add_signer_2', status: 'success', message: 'Adding signer 2 should succeed' },
    { type: 'tx.status.equals', sourceStep: 'add_signer_3', status: 'success', message: 'Adding signer 3 should succeed' },
    { type: 'tx.status.equals', sourceStep: 'set_threshold', status: 'success', message: 'Setting threshold should succeed' },
  ],
};

// =============================================================================
// 8. Key Rotation (self-contained, from scratch)
// =============================================================================

const keyRotationFlow: Flow = {
  version: '1.0',
  name: 'Key Rotation',
  description:
    'Complete key rotation flow from scratch. Sets up keys, creates an ADI, then generates a new keypair and rotates the key on the ADI key page.',
  variables: [
    { name: 'ADI_NAME', type: 'string', description: "Name for your ADI (e.g., 'my-rotate-adi')", required: true },
  ],
  nodes: [
    // ── Setup: keys, faucet, credits ──
    {
      id: 'generate_keys',
      type: 'GenerateKeys',
      label: 'Generate Keys',
      config: { algorithm: 'Ed25519' },
      position: pos(0),
    },
    {
      id: 'faucet',
      type: 'Faucet',
      label: 'Request Tokens',
      config: { times: 3 },
      position: pos(1),
    },
    {
      id: 'wait_for_balance',
      type: 'WaitForBalance',
      label: 'Wait for ACME',
      config: { minBalance: '15.00000000', maxAttempts: 30, delayMs: 2000 },
      position: pos(2),
    },
    {
      id: 'add_credits',
      type: 'AddCredits',
      label: 'Add Credits',
      config: { amount: '5.00000000' },
      position: pos(3),
    },
    {
      id: 'wait_for_credits',
      type: 'WaitForCredits',
      label: 'Wait for Credits',
      config: { minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(4),
    },
    // ── Create ADI ──
    {
      id: 'create_identity',
      type: 'CreateIdentity',
      label: 'Create ADI',
      config: { url: 'acc://{{ADI_NAME}}.acme' },
      position: pos(5),
    },
    // ── Credit key page for ADI operations ──
    {
      id: 'add_adi_credits',
      type: 'AddCredits',
      label: 'Credit Key Page',
      config: { recipient: '{{create_identity.adiUrl}}/book/1', amount: '5.00000000' },
      position: pos(6),
    },
    {
      id: 'wait_for_adi_credits',
      type: 'WaitForCredits',
      label: 'Wait for Key Page Credits',
      config: { account: '{{create_identity.adiUrl}}/book/1', minCredits: 1000, maxAttempts: 30, delayMs: 2000 },
      position: pos(7),
    },
    // ── Key rotation ──
    {
      id: 'generate_new_keys',
      type: 'GenerateKeys',
      label: 'Generate New Keys',
      config: { algorithm: 'Ed25519' },
      position: pos(8),
    },
    {
      id: 'update_key',
      type: 'UpdateKey',
      label: 'Replace Key',
      config: {
        newKeyHash: '{{generate_new_keys.publicKeyHash}}',
        principal: '{{create_identity.adiUrl}}/book/1',
        signerUrl: '{{create_identity.adiUrl}}/book/1',
        keyVarName: '{{generate_keys.varName}}',
      },
      position: pos(9),
    },
    {
      id: 'verify_key_page',
      type: 'QueryAccount',
      label: 'Verify Key Page',
      config: { url: '{{create_identity.keyPageUrl}}' },
      position: pos(10),
    },
  ],
  connections: [
    { id: 'conn_gk_faucet', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: 'conn_faucet_wait', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', targetPortId: 'input' },
    { id: 'conn_wait_credits', sourceNodeId: 'wait_for_balance', sourcePortId: 'output', targetNodeId: 'add_credits', targetPortId: 'input' },
    { id: 'conn_credits_waitc', sourceNodeId: 'add_credits', sourcePortId: 'output', targetNodeId: 'wait_for_credits', targetPortId: 'input' },
    { id: 'conn_waitc_adi', sourceNodeId: 'wait_for_credits', sourcePortId: 'output', targetNodeId: 'create_identity', targetPortId: 'input' },
    { id: 'conn_adi_adicredits', sourceNodeId: 'create_identity', sourcePortId: 'output', targetNodeId: 'add_adi_credits', targetPortId: 'input' },
    { id: 'conn_adicredits_waitadic', sourceNodeId: 'add_adi_credits', sourcePortId: 'output', targetNodeId: 'wait_for_adi_credits', targetPortId: 'input' },
    { id: 'conn_waitadic_newkeys', sourceNodeId: 'wait_for_adi_credits', sourcePortId: 'output', targetNodeId: 'generate_new_keys', targetPortId: 'input' },
    { id: 'conn_newkeys_update', sourceNodeId: 'generate_new_keys', sourcePortId: 'output', targetNodeId: 'update_key', targetPortId: 'input' },
    { id: 'conn_update_verify', sourceNodeId: 'update_key', sourcePortId: 'output', targetNodeId: 'verify_key_page', targetPortId: 'input' },
  ],
  assertions: [
    { type: 'account.exists', url: '{{create_identity.adiUrl}}', message: 'ADI should exist' },
    { type: 'account.exists', url: '{{create_identity.keyPageUrl}}', message: 'Key page should exist after rotation' },
    { type: 'tx.status.equals', sourceStep: 'create_identity', status: 'success', message: 'CreateIdentity should succeed' },
    { type: 'tx.status.equals', sourceStep: 'update_key', status: 'success', message: 'Key rotation should succeed' },
  ],
};

// =============================================================================
// Exported Template Definitions
// =============================================================================

export const GOLDEN_PATH_TEMPLATES: FlowTemplate[] = [
  {
    id: 'lite-account-setup',
    name: 'Lite Account Setup',
    description:
      'The simplest Accumulate flow. Generates a keypair, creates a lite account, and funds it via the testnet faucet. Great for understanding the basics.',
    category: 'beginner',
    estimatedTime: '2 min',
    tags: ['identity', 'beginner', 'getting-started'],
    flow: liteAccountSetupFlow,
    instructions: [
      'Generate an Ed25519 keypair',
      'Request tokens from the testnet faucet',
      'Wait for balance to confirm',
    ],
    prerequisites: ['None - great for beginners!'],
  },
  {
    id: 'create-adi',
    name: 'Create Your First ADI',
    description:
      'Create an Accumulate Digital Identity (ADI) from a lite account. CreateIdentity automatically provisions a key book and key page with your public key.',
    category: 'beginner',
    estimatedTime: '3 min',
    tags: ['identity', 'beginner', 'getting-started'],
    flow: adiCreationFlow,
    instructions: [
      'Generate a keypair',
      'Fund the lite account using the faucet',
      'Add credits to the lite identity',
      'Create your ADI (key book + key page are auto-provisioned)',
    ],
    prerequisites: ['None - great for beginners!'],
  },
  {
    id: 'zero-to-hero',
    name: 'Zero to Hero',
    description:
      'Complete beginner flow from nothing to a fully functional ADI with a token account. Covers keys, faucet, credits, ADI creation, and token accounts.',
    category: 'beginner',
    estimatedTime: '7 min',
    tags: ['identity', 'tokens', 'beginner', 'getting-started'],
    flow: zeroToHeroFlow,
    instructions: [
      'Generate cryptographic keys',
      'Request testnet tokens from faucet',
      'Wait for ACME tokens to arrive',
      'Add credits to lite identity',
      'Create an ADI',
      'Credit the ADI key page for signing',
      'Wait for key page credits',
      'Create a token account under the ADI',
    ],
    prerequisites: ['None - great for beginners!'],
  },
  {
    id: 'token-transfer',
    name: 'Send ACME Tokens',
    description:
      'Complete token transfer flow from scratch. Sets up keys, creates an ADI with sender and receiver accounts, then transfers ACME between them.',
    category: 'intermediate',
    estimatedTime: '10 min',
    tags: ['tokens', 'intermediate', 'transfer'],
    flow: tokenTransferFlow,
    instructions: [
      'Generate keys and fund via faucet',
      'Add credits and create an ADI',
      'Credit the ADI key page',
      'Create sender and receiver token accounts',
      'Fund the sender account from lite token account',
      'Transfer ACME from sender to receiver',
    ],
    prerequisites: ['None - fully self-contained!'],
  },
  {
    id: 'data-writing',
    name: 'Write Data to Chain',
    description:
      'Complete data storage flow from scratch. Sets up keys, creates an ADI, then creates a data account and writes entries to it.',
    category: 'intermediate',
    estimatedTime: '10 min',
    tags: ['data', 'intermediate', 'storage'],
    flow: dataWritingFlow,
    instructions: [
      'Generate keys and fund via faucet',
      'Add credits and create an ADI',
      'Credit the ADI key page',
      'Create a data account under the ADI',
      'Write data entries to the account',
      'Query the account to verify data',
    ],
    prerequisites: ['None - fully self-contained!'],
  },
  {
    id: 'custom-token',
    name: 'Create Custom Token',
    description:
      'Complete custom token flow from scratch. Sets up keys, creates an ADI, then creates a custom token issuer, issues tokens, and verifies the result.',
    category: 'intermediate',
    estimatedTime: '10 min',
    tags: ['tokens', 'intermediate', 'issuer'],
    flow: customTokenFlow,
    instructions: [
      'Generate keys and fund via faucet',
      'Add credits and create an ADI',
      'Credit the ADI key page',
      'Create a custom token issuer',
      'Create a token account for the custom token',
      'Issue initial supply of tokens',
      'Verify token issuer',
    ],
    prerequisites: ['None - fully self-contained!'],
  },
  {
    id: 'multi-sig-setup',
    name: 'Multi-Signature Setup',
    description:
      'Complete multi-sig flow from scratch. Sets up keys, creates an ADI, then creates a key book with 3 signers and a 2-of-3 threshold.',
    category: 'advanced',
    estimatedTime: '15 min',
    tags: ['security', 'advanced', 'multi-sig'],
    flow: multiSigSetupFlow,
    instructions: [
      'Generate keys and fund via faucet',
      'Add credits and create an ADI',
      'Credit the ADI key page',
      'Create a dedicated multi-sig key book',
      'Generate signer 2 keys and add to key page',
      'Generate signer 3 keys and add to key page',
      'Set the signature threshold (2 of 3)',
    ],
    prerequisites: ['None - fully self-contained!'],
  },
  {
    id: 'key-rotation',
    name: 'Key Rotation',
    description:
      'Complete key rotation flow from scratch. Sets up keys, creates an ADI, then generates a new keypair and rotates the key on the key page.',
    category: 'intermediate',
    estimatedTime: '10 min',
    tags: ['security', 'intermediate', 'key-management'],
    flow: keyRotationFlow,
    instructions: [
      'Generate keys and fund via faucet',
      'Add credits and create an ADI',
      'Credit the ADI key page',
      'Generate a new keypair',
      'Rotate the key on the key page',
      'Verify the key page was updated',
    ],
    prerequisites: ['None - fully self-contained!'],
  },
];
