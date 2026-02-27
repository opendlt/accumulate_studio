/**
 * Node Executor - Execute individual block types via SDK Proxy
 *
 * All transaction signing and submission is delegated to the Python SDK proxy
 * which uses the official accumulate-sdk-opendlt package for proper binary
 * encoding, signing, and V3 API submission.
 */

import type {
  FlowNode,
  BlockType,
  CreateIdentityConfig,
  CreateKeyBookConfig,
  CreateKeyPageConfig,
  CreateTokenAccountConfig,
  CreateDataAccountConfig,
  WriteDataConfig,
  WriteDataToConfig,
  AddCreditsConfig,
  SendTokensConfig,
  FaucetConfig,
  QueryAccountConfig,
  WaitForBalanceConfig,
  WaitForCreditsConfig,
  GenerateKeysConfig,
  UpdateAccountAuthConfig,
} from '@accumulate-studio/types';
import { AccumulateAPI } from '../network/api';
import type { ExecutionContext } from './index';

// =============================================================================
// Types
// =============================================================================

export type NodeOutputs = Record<string, unknown>;

export interface KeyPair {
  publicKey: string;       // hex string (from proxy)
  publicKeyHash: string;
  liteIdentity: string;
  liteTokenAccount: string;
}

/** Keys that should be propagated through every executor so downstream nodes can access them. */
const CONTEXT_KEYS = [
  'adiUrl', 'keyBookUrl', 'keyPageUrl',
  'dataAccountUrl', 'tokenAccountUrl',
  'recipient',
] as const;

// =============================================================================
// Node Executor
// =============================================================================

export class NodeExecutor {
  private api: AccumulateAPI;
  private sessionId: string;

  constructor(api: AccumulateAPI, sessionId: string) {
    this.api = api;
    this.sessionId = sessionId;
  }

  /**
   * Execute a node and return its outputs
   */
  async execute(
    node: FlowNode,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    const type = node.type as BlockType;

    switch (type) {
      case 'GenerateKeys':
        return this.executeGenerateKeys(node.config as GenerateKeysConfig, inputs);

      case 'CreateLiteTokenAccount':
        return this.executeCreateLiteTokenAccount(inputs);

      case 'Faucet':
        return this.executeFaucet(node.config as FaucetConfig, inputs);

      case 'AddCredits':
        return this.executeAddCredits(node.config as AddCreditsConfig, inputs, context);

      case 'CreateIdentity':
        return this.executeCreateIdentity(node.config as CreateIdentityConfig, inputs, context);

      case 'CreateKeyBook':
        return this.executeCreateKeyBook(node.config as CreateKeyBookConfig, inputs, context);

      case 'CreateKeyPage':
        return this.executeCreateKeyPage(node.config as CreateKeyPageConfig, inputs, context);

      case 'SendTokens':
        return this.executeSendTokens(node.config as SendTokensConfig, inputs, context);

      case 'CreateTokenAccount':
        return this.executeCreateTokenAccount(node.config as CreateTokenAccountConfig, inputs, context);

      case 'CreateDataAccount':
        return this.executeCreateDataAccount(node.config as CreateDataAccountConfig, inputs, context);

      case 'WriteData':
        return this.executeWriteData(node.config as WriteDataConfig, inputs, context);

      case 'WriteDataTo':
        return this.executeWriteDataTo(node.config as WriteDataToConfig, inputs, context);

      case 'QueryAccount':
        return this.executeQuery(node.config as QueryAccountConfig, inputs);

      case 'WaitForBalance':
        return this.executeWaitForBalance(node.config as WaitForBalanceConfig, inputs, context);

      case 'WaitForCredits':
        return this.executeWaitForCredits(node.config as WaitForCreditsConfig, inputs, context);

      case 'UpdateAccountAuth':
        return this.executeUpdateAccountAuth(node.config as UpdateAccountAuthConfig, inputs, context);

      case 'Comment':
        return {}; // No-op for comments

      default:
        return this.executeGenericTransaction(node, inputs, context);
    }
  }

  // ---------------------------------------------------------------------------
  // Utility Block Executors
  // ---------------------------------------------------------------------------

  /**
   * Generate keypair via SDK proxy (supports Ed25519, RCD1, BTC, ETH)
   */
  async executeGenerateKeys(config: GenerateKeysConfig, inputs: NodeOutputs = {}): Promise<NodeOutputs> {
    // If an upstream keypair already exists, this is a secondary key generation
    // (e.g. generating a NEW key for rotation).  Don't overwrite the session
    // signer so that subsequent transactions still sign with the original key.
    const hasExistingKeypair = !!(inputs.keypair || inputs.signer);

    const result = await this.api.callProxy<{
      algorithm: string;
      public_key: string;
      lite_identity: string;
      lite_token_account: string;
      public_key_hash: string;
    }>('/api/generate-keys', {
      session_id: this.sessionId,
      algorithm: (config.algorithm || 'Ed25519').toLowerCase(),
      store_as_signer: !hasExistingKeypair,
    });

    const keypairData: KeyPair = {
      publicKey: result.public_key,
      publicKeyHash: result.public_key_hash,
      liteIdentity: result.lite_identity,
      liteTokenAccount: result.lite_token_account,
    };

    return {
      ...this.collectPassthrough(inputs),
      keypair: keypairData,
      publicKey: result.public_key,
      publicKeyHash: result.public_key_hash,
      liteIdentity: result.lite_identity,
      liteTokenAccount: result.lite_token_account,
    };
  }

  /**
   * Create lite token account from keypair (lite accounts are implicit)
   */
  async executeCreateLiteTokenAccount(inputs: NodeOutputs): Promise<NodeOutputs> {
    const keypair = (inputs.keypair || inputs.signer) as KeyPair | undefined;

    if (!keypair) {
      throw new Error('CreateLiteTokenAccount requires a keypair from an upstream GenerateKeys block');
    }

    return {
      keypair,
      liteIdentityUrl: keypair.liteIdentity,
      liteTokenAccountUrl: keypair.liteTokenAccount,
      publicKeyHash: keypair.publicKeyHash,
      signer: keypair,
      principal: keypair.liteTokenAccount,
    };
  }

  /**
   * Call faucet via SDK proxy
   */
  async executeFaucet(config: FaucetConfig, inputs: NodeOutputs): Promise<NodeOutputs> {
    let account = config.account ? this.resolveValue(config.account, inputs) : '';
    if (!account) {
      account =
        (inputs.liteTokenAccount as string) ||
        (inputs.liteTokenAccountUrl as string) ||
        '';
    }
    if (!account) {
      const keypair = (inputs.keypair || inputs.signer) as KeyPair | undefined;
      if (keypair) {
        account = keypair.liteTokenAccount;
      }
    }
    if (!account) {
      throw new Error(
        'Faucet requires a lite token account URL. Configure the account field or connect a GenerateKeys block upstream.'
      );
    }

    const times = config.times || 2;

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/faucet', {
      session_id: this.sessionId,
      account,
      times,
    });

    if (!result.success) {
      throw new Error(result.error || 'Faucet request failed');
    }

    const keypair = (inputs.keypair || inputs.signer) as KeyPair | undefined;

    return {
      success: true,
      txHash: result.tx_hash,
      ...(keypair && {
        keypair,
        signer: keypair,
        principal: account,
        liteIdentity: keypair.liteIdentity,
        liteTokenAccount: keypair.liteTokenAccount,
      }),
    };
  }

  /**
   * Build and submit AddCredits transaction via SDK proxy
   */
  async executeAddCredits(
    config: AddCreditsConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    let recipient = config.recipient ? this.resolveValue(config.recipient, inputs) : '';
    if (!recipient) {
      // If CreateIdentity ran upstream, credit the ADI's key page
      // Otherwise, credit the lite identity for initial setup
      recipient =
        (inputs.keyPageUrl as string) ||
        (inputs.liteIdentity as string) ||
        (inputs.liteIdentityUrl as string) ||
        '';
    }
    if (!recipient) {
      const kp = (inputs.keypair || inputs.signer) as KeyPair | undefined;
      if (kp) recipient = kp.liteIdentity;
    }
    if (!recipient) {
      throw new Error(
        'AddCredits requires a recipient (lite identity or key page URL). Configure the recipient field or connect upstream blocks.'
      );
    }

    let amount = config.amount ? this.resolveValue(config.amount, inputs) : '';
    if (!amount) {
      amount = '5';
    }

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/add-credits', {
      session_id: this.sessionId,
      recipient,
      amount: this.parseAmount(amount),
      oracle: config.oracle || null,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit AddCredits transaction');
    }

    const keypair = (inputs.keypair || inputs.signer) as KeyPair | undefined;

    return {
      txHash: result.tx_hash,
      recipient,
      amount,
      ...this.collectPassthrough(inputs),
      ...(keypair && {
        keypair,
        signer: keypair,
        principal: (inputs.principal as string) || keypair.liteTokenAccount,
        liteIdentity: keypair.liteIdentity,
        liteTokenAccount: keypair.liteTokenAccount,
      }),
    };
  }

  /**
   * Build and submit CreateIdentity transaction via SDK proxy
   */
  async executeCreateIdentity(
    config: CreateIdentityConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    const url = this.resolveValue(config.url, inputs);

    // Resolve keyBookUrl — default to <adi>/book if empty or has unresolved templates
    let keyBookUrl = config.keyBookUrl ? this.resolveValue(config.keyBookUrl, inputs) : '';
    if (!keyBookUrl || keyBookUrl.includes('{{')) {
      keyBookUrl = `${url}/book`;
    }

    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    const principal = (inputs.principal as string) || keypair?.liteTokenAccount || '';

    if (!keypair || !principal) {
      throw new Error('CreateIdentity requires signer keypair and principal account');
    }

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/create-identity', {
      session_id: this.sessionId,
      url,
      key_book_url: keyBookUrl,
      principal,
      signer_url: keypair.liteTokenAccount,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit CreateIdentity transaction');
    }

    return {
      txHash: result.tx_hash,
      adiUrl: url,
      keyBookUrl,
      keyPageUrl: `${keyBookUrl}/1`,
      keypair,
      signer: keypair,
      principal,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  /**
   * Build and submit CreateKeyBook transaction via SDK proxy.
   *
   * When publicKeyHash is not provided in the config, the session
   * keypair's SHA-256 hash is used so the same signing key is
   * registered on the new book's first page.
   */
  async executeCreateKeyBook(
    config: CreateKeyBookConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    if (!keypair) {
      throw new Error('CreateKeyBook requires a signer keypair');
    }

    const url = this.resolveValue(config.url, inputs);

    // Auto-generate a public key hash if the user didn't provide one.
    // Use the SESSION keypair's hash so the same signing key is
    // registered on the new book's first page.
    let publicKeyHash = config.publicKeyHash
      ? this.resolveValue(config.publicKeyHash, inputs)
      : '';
    if (!publicKeyHash) {
      publicKeyHash = keypair.publicKeyHash;
    }

    // ADI context: principal is the ADI, signer is the key page
    const adiUrl = inputs.adiUrl as string | undefined;
    const keyPageUrl = inputs.keyPageUrl as string | undefined;
    const principal = adiUrl || keypair.liteTokenAccount;
    const signerUrl = keyPageUrl || keypair.liteTokenAccount;

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/sign-and-submit', {
      session_id: this.sessionId,
      tx_type: 'CreateKeyBook',
      principal,
      signer_url: signerUrl,
      fields: { url, publicKeyHash },
      wait: true,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit CreateKeyBook transaction');
    }

    return {
      txHash: result.tx_hash,
      ...this.collectPassthrough(inputs),
      // Explicit values AFTER passthrough so they take precedence
      keyBookUrl: url,
      keyPageUrl: `${url}/1`,
      keypair,
      signer: keypair,
      principal,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  /**
   * Build and submit CreateKeyPage transaction via SDK proxy.
   *
   * The key page URL is auto-assigned by the protocol as
   * <keyBookUrl>/<nextPageNumber>.  When initial keys are not provided
   * the session keypair's hash is used as the initial key so the user
   * can immediately sign from the new page.
   */
  async executeCreateKeyPage(
    config: CreateKeyPageConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    if (!keypair) {
      throw new Error('CreateKeyPage requires a signer keypair');
    }

    // The principal for CreateKeyPage is the key book URL
    const keyBookUrl = inputs.keyBookUrl as string | undefined;
    if (!keyBookUrl) {
      throw new Error(
        'CreateKeyPage requires a key book URL from an upstream CreateIdentity or CreateKeyBook block.'
      );
    }

    // Signer is the existing key page that has authority over the book
    const keyPageUrl = inputs.keyPageUrl as string | undefined;
    const signerUrl = keyPageUrl || keypair.liteTokenAccount;

    // Build keys array — auto-generate if not provided.
    // The proxy also has a server-side fallback for this.
    let keys: Array<{ keyHash: string }> = [];
    if (config.keys && config.keys.length > 0) {
      keys = config.keys
        .filter((k) => k)
        .map((k) => ({ keyHash: this.resolveValue(k, inputs) }));
    }

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/sign-and-submit', {
      session_id: this.sessionId,
      tx_type: 'CreateKeyPage',
      principal: keyBookUrl,
      signer_url: signerUrl,
      fields: { keys: keys.length > 0 ? keys : undefined },
      wait: true,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit CreateKeyPage transaction');
    }

    // Figure out the new page number by counting completed CreateKeyPage
    // nodes in the flow (page /1 was created by CreateIdentity or CreateKeyBook)
    const completedPages = context.flow.nodes
      .filter((n) => n.type === 'CreateKeyPage')
      .filter((n) => context.nodeOutputs.has(n.id))
      .length;
    const newPageNumber = completedPages + 2; // +2 because /1 already exists
    const newKeyPageUrl = `${keyBookUrl}/${newPageNumber}`;

    return {
      txHash: result.tx_hash,
      ...this.collectPassthrough(inputs),
      // Explicit values AFTER passthrough so they take precedence
      keyPageUrl: newKeyPageUrl,
      keyBookUrl,
      keypair,
      signer: keypair,
      principal: keyBookUrl,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  /**
   * Build and submit SendTokens transaction via SDK proxy
   */
  async executeSendTokens(
    config: SendTokensConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    if (!keypair) {
      throw new Error('SendTokens requires a signer keypair');
    }

    // ── Resolve source account (from / principal) ──
    let from = config.from ? this.resolveValue(config.from, inputs) : '';
    if (!from) {
      // Default: lite token account (most common funding source)
      from = keypair.liteTokenAccount;
    }

    // ── Resolve destination (to) ──
    let to = config.to ? this.resolveValue(config.to, inputs) : '';
    if (!to) {
      // Auto-resolve: if an ADI token account was created upstream, send there
      to = (inputs.tokenAccountUrl as string) || '';
    }

    // ── Resolve amount ──
    const amountStr = config.amount ? this.resolveValue(config.amount, inputs) : '';

    // ── Determine signer based on whether "from" is lite or ADI ──
    const isLiteAccount = /^acc:\/\/[0-9a-fA-F]{40,}/.test(from);
    const keyPageUrl = inputs.keyPageUrl as string | undefined;
    let signerUrl: string;

    if (isLiteAccount) {
      signerUrl = keypair.liteTokenAccount;
    } else if (keyPageUrl) {
      signerUrl = keyPageUrl;
    } else {
      signerUrl = keypair.liteTokenAccount;
    }

    // ── Build recipients list ──
    let recipients: Array<{ url: string; amount: string }> = [];

    // Try explicit recipients array first (advanced mode)
    if (config.recipients && config.recipients.length > 0) {
      recipients = config.recipients
        .filter((r) => r.url && r.amount)
        .map((r) => ({
          url: this.resolveValue(r.url, inputs),
          amount: String(this.parseAmount(this.resolveValue(r.amount, inputs))),
        }));
    }

    // If no valid recipients from the array, use simple to/amount fields
    if (recipients.length === 0 && to) {
      const amount = amountStr || '1';
      recipients = [{
        url: to,
        amount: String(this.parseAmount(amount)),
      }];
    }

    if (recipients.length === 0) {
      throw new Error(
        'SendTokens requires a destination. Set the "to" field or connect a CreateTokenAccount block upstream.'
      );
    }

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/send-tokens', {
      session_id: this.sessionId,
      principal: from,
      recipients,
      signer_url: signerUrl,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit SendTokens transaction');
    }

    return {
      txHash: result.tx_hash,
      from,
      recipients,
      ...this.collectPassthrough(inputs),
      keypair,
      signer: keypair,
      principal: from,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  /**
   * Query account state via SDK proxy
   */
  async executeQuery(config: QueryAccountConfig, inputs: NodeOutputs): Promise<NodeOutputs> {
    const url = this.resolveValue(config.url, inputs);

    const result = await this.api.callProxy<{
      success: boolean;
      data?: Record<string, unknown>;
      error?: string;
    }>('/api/query', { url });

    if (!result.success) {
      throw new Error(result.error || 'Query failed');
    }

    return {
      account: result.data,
      type: result.data?.type,
      url: result.data?.url,
      balance: result.data?.balance,
      creditBalance: result.data?.creditBalance,
    };
  }

  /**
   * Poll for balance via SDK proxy
   */
  async executeWaitForBalance(
    config: WaitForBalanceConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    let account = config.account ? this.resolveValue(config.account, inputs) : '';
    if (!account) {
      account =
        (inputs.liteTokenAccount as string) ||
        (inputs.liteTokenAccountUrl as string) ||
        '';
    }
    if (!account) {
      const keypair = (inputs.keypair || inputs.signer) as KeyPair | undefined;
      if (keypair) account = keypair.liteTokenAccount;
    }
    if (!account) {
      throw new Error(
        'WaitForBalance requires a token account URL. Configure the account field or connect upstream blocks.'
      );
    }

    let minBalanceStr = config.minBalance ? this.resolveValue(config.minBalance, inputs) : '';
    const minBalance = minBalanceStr ? this.parseAmount(minBalanceStr) : 1000000;
    const maxAttempts = config.maxAttempts || 30;
    const delayMs = config.delayMs || 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (context.abortController.signal.aborted) {
        throw new Error('Execution aborted');
      }

      const result = await this.api.callProxy<{
        success: boolean;
        data?: Record<string, unknown>;
        error?: string;
      }>('/api/query', { url: account });

      if (result.success && result.data?.balance) {
        const currentBalance = this.parseAmount(result.data.balance as string);
        if (currentBalance >= minBalance) {
          const keypair = (inputs.keypair || inputs.signer) as KeyPair | undefined;
          return {
            balance: result.data.balance,
            balanceNumeric: currentBalance,
            attempts: attempt + 1,
            ...this.collectPassthrough(inputs),
            ...(keypair && {
              keypair,
              signer: keypair,
              principal: account,
              liteIdentity: keypair.liteIdentity,
              liteTokenAccount: keypair.liteTokenAccount,
            }),
          };
        }
      }

      await this.delay(delayMs);
    }

    throw new Error(`Balance not reached after ${maxAttempts} attempts`);
  }

  /**
   * Poll for credit balance via SDK proxy
   */
  async executeWaitForCredits(
    config: WaitForCreditsConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    let account = config.account ? this.resolveValue(config.account, inputs) : '';
    if (!account) {
      // Check what the upstream AddCredits just credited:
      // - If it credited a key page (ADI flow), poll the key page
      // - If it credited a lite identity (initial setup), poll that
      account =
        (inputs.recipient as string) ||
        (inputs.keyPageUrl as string) ||
        (inputs.liteIdentity as string) ||
        (inputs.liteIdentityUrl as string) ||
        '';
    }
    if (!account) {
      const keypair = (inputs.keypair || inputs.signer) as KeyPair | undefined;
      if (keypair) account = keypair.liteIdentity;
    }
    if (!account) {
      throw new Error(
        'WaitForCredits requires a credit account URL. Configure the account field or connect upstream blocks.'
      );
    }

    const minCredits = config.minCredits || 100;
    const maxAttempts = config.maxAttempts || 30;
    const delayMs = config.delayMs || 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (context.abortController.signal.aborted) {
        throw new Error('Execution aborted');
      }

      const result = await this.api.callProxy<{
        success: boolean;
        data?: Record<string, unknown>;
        error?: string;
      }>('/api/query', { url: account });

      if (result.success && result.data) {
        const currentCredits = Number(result.data.creditBalance ?? result.data.credits ?? 0);
        if (currentCredits >= minCredits) {
          const keypair = (inputs.keypair || inputs.signer) as KeyPair | undefined;
          return {
            creditBalance: currentCredits,
            attempts: attempt + 1,
            ...this.collectPassthrough(inputs),
            ...(keypair && {
              keypair,
              signer: keypair,
              principal: (inputs.principal as string) || keypair.liteTokenAccount,
              liteIdentity: keypair.liteIdentity,
              liteTokenAccount: keypair.liteTokenAccount,
            }),
          };
        }
      }

      await this.delay(delayMs);
    }

    throw new Error(`Credit balance not reached after ${maxAttempts} attempts`);
  }

  /**
   * Create a token account under an ADI via dedicated proxy endpoint
   */
  async executeCreateTokenAccount(
    config: CreateTokenAccountConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    if (!keypair) {
      throw new Error('CreateTokenAccount requires a signer keypair');
    }

    // Resolve URL — default to <adiUrl>/token1, token2, etc. if empty or has unresolved templates
    let url = config.url ? this.resolveValue(config.url, inputs) : '';
    if (!url || url.includes('{{')) {
      const adiUrl = inputs.adiUrl as string | undefined;
      if (adiUrl) {
        // Count how many CreateTokenAccount nodes already completed for sequential naming
        const completedTokenAccounts = context.flow.nodes
          .filter((n) => n.type === 'CreateTokenAccount')
          .filter((n) => context.nodeOutputs.has(n.id))
          .length;
        const tokenIndex = completedTokenAccounts + 1;
        url = `${adiUrl}/token${tokenIndex}`;
      }
    }
    const tokenUrl = config.tokenUrl ? this.resolveValue(config.tokenUrl, inputs) : 'acc://ACME';

    // ADI context: principal is the ADI, signer is the key page
    const adiUrl = inputs.adiUrl as string | undefined;
    const keyPageUrl = inputs.keyPageUrl as string | undefined;
    const principal = adiUrl || keypair.liteTokenAccount;
    const signerUrl = keyPageUrl || keypair.liteTokenAccount;

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/create-token-account', {
      session_id: this.sessionId,
      url,
      token_url: tokenUrl,
      principal,
      signer_url: signerUrl,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit CreateTokenAccount transaction');
    }

    return {
      txHash: result.tx_hash,
      tokenAccountUrl: url,
      tokenUrl,
      ...this.collectPassthrough(inputs),
      keypair,
      signer: keypair,
      principal,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  /**
   * Create a data account under an ADI via dedicated proxy endpoint
   */
  async executeCreateDataAccount(
    config: CreateDataAccountConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    if (!keypair) {
      throw new Error('CreateDataAccount requires a signer keypair');
    }

    // Resolve URL — default to <adiUrl>/data1, data2, etc. if empty or has unresolved templates
    let url = config.url ? this.resolveValue(config.url, inputs) : '';
    if (!url || url.includes('{{')) {
      const adiUrl = inputs.adiUrl as string | undefined;
      if (adiUrl) {
        // Count how many CreateDataAccount nodes already completed for sequential naming
        const completedDataAccounts = context.flow.nodes
          .filter((n) => n.type === 'CreateDataAccount')
          .filter((n) => context.nodeOutputs.has(n.id))
          .length;
        const dataIndex = completedDataAccounts + 1;
        url = `${adiUrl}/data${dataIndex}`;
      }
    }

    // ADI context: principal is the ADI, signer is the key page
    const adiUrl = inputs.adiUrl as string | undefined;
    const keyPageUrl = inputs.keyPageUrl as string | undefined;
    const principal = adiUrl || keypair.liteTokenAccount;
    const signerUrl = keyPageUrl || keypair.liteTokenAccount;

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/create-data-account', {
      session_id: this.sessionId,
      url,
      principal,
      signer_url: signerUrl,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit CreateDataAccount transaction');
    }

    return {
      txHash: result.tx_hash,
      dataAccountUrl: url,
      ...this.collectPassthrough(inputs),
      keypair,
      signer: keypair,
      principal,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  /**
   * Write data to a data account via dedicated proxy endpoint
   */
  async executeWriteData(
    config: WriteDataConfig,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    if (!keypair) {
      throw new Error('WriteData requires a signer keypair');
    }

    // Data account URL: check config field first, then upstream output
    let account = config.account ? this.resolveValue(config.account, inputs) : '';
    if (!account) {
      account = (inputs.dataAccountUrl as string) || '';
    }
    if (!account) {
      throw new Error(
        'WriteData requires a data account URL. Set the account field or connect a CreateDataAccount block upstream.'
      );
    }

    // ADI context: principal is the data account, signer is the key page
    const keyPageUrl = inputs.keyPageUrl as string | undefined;
    const signerUrl = keyPageUrl || keypair.liteTokenAccount;

    // Entries are plain text strings; the proxy converts them to hex via write_data_strings
    const entries = (config.entries && config.entries.length > 0)
      ? config.entries.map((e) => this.resolveValue(e, inputs))
      : ['hello from accumulate studio'];

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/write-data', {
      session_id: this.sessionId,
      account,
      entries,
      principal: account,
      signer_url: signerUrl,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit WriteData transaction');
    }

    return {
      txHash: result.tx_hash,
      ...this.collectPassthrough(inputs),
      keypair,
      signer: keypair,
      principal: account,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  /**
   * Write data to a lite data account (or any specified recipient).
   *
   * The lite data account URL is derived from the data entry contents,
   * NOT from the keypair.  When no recipient is configured the proxy
   * auto-computes it from the entries + the session keypair's public-key
   * hash (used as an external ID so each keypair gets a unique account).
   */
  async executeWriteDataTo(
    config: WriteDataToConfig,
    inputs: NodeOutputs,
    _context: ExecutionContext
  ): Promise<NodeOutputs> {
    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    if (!keypair) {
      throw new Error('WriteDataTo requires a signer keypair');
    }

    // Resolve recipient — config first, then upstream dataAccountUrl.
    // If neither is set, omit it and let the proxy compute it from entries.
    let recipient = config.recipient ? this.resolveValue(config.recipient, inputs) : '';
    if (!recipient || recipient.includes('{{')) {
      recipient = (inputs.dataAccountUrl as string) || '';
    }

    // Principal is the account that pays — lite token account or ADI
    const keyPageUrl = inputs.keyPageUrl as string | undefined;
    const principal = (inputs.principal as string) || keypair.liteTokenAccount;
    const signerUrl = keyPageUrl || keypair.liteTokenAccount;

    // Entries — plain text strings; the proxy hex-encodes them
    const entries = (config.entries && config.entries.length > 0)
      ? config.entries.map((e) => this.resolveValue(e, inputs))
      : ['hello from accumulate studio'];

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      recipient?: string;
      error?: string;
    }>('/api/write-data-to', {
      session_id: this.sessionId,
      ...(recipient ? { recipient } : {}),
      entries,
      principal,
      signer_url: signerUrl,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit WriteDataTo transaction');
    }

    // Use proxy-computed recipient if we didn't supply one
    const finalRecipient = result.recipient || recipient;

    return {
      txHash: result.tx_hash,
      ...this.collectPassthrough(inputs),
      recipient: finalRecipient,
      dataAccountUrl: finalRecipient,
      keypair,
      signer: keypair,
      principal,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  /**
   * Update account authorities (add/remove/enable/disable).
   *
   * Principal = the account being modified (token account, data account, etc.).
   * Signer = the key page that has authority over that account.
   */
  async executeUpdateAccountAuth(
    config: UpdateAccountAuthConfig,
    inputs: NodeOutputs,
    _context: ExecutionContext
  ): Promise<NodeOutputs> {
    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    if (!keypair) {
      throw new Error('UpdateAccountAuth requires a signer keypair');
    }

    // Principal = the account being modified.
    // Default: config.account → upstream tokenAccountUrl → upstream dataAccountUrl → adiUrl
    let account = config.account ? this.resolveValue(config.account, inputs) : '';
    if (!account) {
      account = (inputs.tokenAccountUrl as string)
        || (inputs.dataAccountUrl as string)
        || (inputs.adiUrl as string)
        || '';
    }
    if (!account) {
      throw new Error(
        'UpdateAccountAuth requires a target account URL. Set it in config or connect a CreateTokenAccount/CreateDataAccount block upstream.'
      );
    }

    // Signer = key page with authority over the account
    const keyPageUrl = inputs.keyPageUrl as string | undefined;
    const signerUrl = keyPageUrl || keypair.liteTokenAccount;

    // Map frontend operation types to Go/SDK types
    const OP_TYPE_MAP: Record<string, string> = {
      add: 'addAuthority',
      remove: 'removeAuthority',
      enable: 'enable',
      disable: 'disable',
    };

    const operations = (config.operations || []).map((op) => ({
      type: OP_TYPE_MAP[op.type] || op.type,
      authority: this.resolveValue(op.authority, inputs),
    }));

    if (operations.length === 0) {
      throw new Error('UpdateAccountAuth requires at least one operation');
    }

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/sign-and-submit', {
      session_id: this.sessionId,
      tx_type: 'UpdateAccountAuth',
      principal: account,
      signer_url: signerUrl,
      fields: { operations },
      wait: true,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to submit UpdateAccountAuth transaction');
    }

    return {
      txHash: result.tx_hash,
      ...this.collectPassthrough(inputs),
      keypair,
      signer: keypair,
      principal: account,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  /**
   * Generic transaction executor via SDK proxy sign-and-submit.
   *
   * Handles both lite-account operations and ADI-level operations:
   * - ADI Create* (CreateTokenAccount, CreateDataAccount, etc.):
   *     principal = ADI URL, signer = key page
   * - ADI account ops (WriteData, BurnTokens, etc.):
   *     principal = account URL from config, signer = key page
   * - Lite operations (no ADI context):
   *     principal = lite token account, signer = lite token account
   */
  async executeGenericTransaction(
    node: FlowNode,
    inputs: NodeOutputs,
    context: ExecutionContext
  ): Promise<NodeOutputs> {
    const keypair = (inputs.signer || inputs.keypair) as KeyPair | undefined;
    if (!keypair) {
      throw new Error(`${node.type} requires a signer keypair`);
    }

    // Resolve config values
    const resolvedConfig: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.config as Record<string, unknown>)) {
      resolvedConfig[key] = this.deepResolve(value, inputs);
    }

    // Determine principal and signer based on ADI context
    const adiUrl = inputs.adiUrl as string | undefined;
    const keyPageUrl = inputs.keyPageUrl as string | undefined;

    let principal: string;
    let signerUrl: string;

    if (adiUrl && keyPageUrl) {
      // ADI-level operation: signer is always the key page
      signerUrl = keyPageUrl;

      // For Create* operations, the principal is the ADI (parent account)
      const ADI_CREATE_OPS = [
        'CreateTokenAccount', 'CreateDataAccount', 'CreateToken',
        'CreateKeyBook', 'CreateKeyPage',
      ];
      if (ADI_CREATE_OPS.includes(node.type)) {
        principal = adiUrl;
      } else if (['UpdateKeyPage', 'UpdateKey'].includes(node.type)) {
        // Key page operations: principal AND signer are the key page itself
        // (the signing key must live on the page being modified)
        const targetPage = (resolvedConfig.url as string) || keyPageUrl;
        principal = targetPage;
        signerUrl = targetPage;
      } else if (node.type === 'LockAccount') {
        // LockAccount only works on lite token accounts.
        // Principal = the account being locked (config.account or lite token account).
        // Signer = the lite token account itself (self-signed).
        const account = (resolvedConfig.account as string) || keypair.liteTokenAccount;
        principal = account;
        signerUrl = account;
      } else if (['TransferCredits', 'BurnCredits'].includes(node.type)) {
        // Credit operations: principal is the credit source (key page).
        // The key page holds the credits and signs for itself.
        // Note: after CreateKeyPage, keyPageUrl is the NEW page (e.g. book/2).
        // The source is usually the FIRST page (book/1) which has credits.
        const keyBookUrl = inputs.keyBookUrl as string | undefined;
        const firstPage = keyBookUrl ? `${keyBookUrl}/1` : undefined;
        const source = (resolvedConfig.from as string)
          || (resolvedConfig.url as string)
          || firstPage
          || keyPageUrl;
        principal = source;
        signerUrl = source;
      } else {
        // For operations on existing ADI sub-accounts (WriteData, BurnTokens, etc.),
        // the principal is the specific account URL from the config
        principal = (resolvedConfig.account as string)
          || (resolvedConfig.url as string)
          || (resolvedConfig.principal as string)
          || (inputs.tokenAccountUrl as string)
          || adiUrl;
      }
    } else {
      // Lite account operation
      if (['TransferCredits', 'BurnCredits'].includes(node.type)) {
        // Credit operations on lite accounts: credits are on the lite IDENTITY
        // (acc://<hash>), not the lite token account (acc://<hash>/ACME).
        principal = (resolvedConfig.from as string) || keypair.liteIdentity;
        signerUrl = keypair.liteTokenAccount;
      } else {
        principal = (inputs.principal as string) || keypair.liteTokenAccount;
        signerUrl = keypair.liteTokenAccount;
      }
    }

    const txType = this.mapBlockTypeToTxType(node.type as BlockType);

    const result = await this.api.callProxy<{
      success: boolean;
      tx_hash?: string;
      error?: string;
    }>('/api/sign-and-submit', {
      session_id: this.sessionId,
      tx_type: txType,
      principal,
      signer_url: signerUrl,
      fields: resolvedConfig,
      wait: true,
    });

    if (!result.success) {
      throw new Error(result.error || `Failed to submit ${node.type} transaction`);
    }

    return {
      txHash: result.tx_hash,
      ...resolvedConfig,
      ...this.collectPassthrough(inputs),
      keypair,
      signer: keypair,
      principal,
      liteIdentity: keypair.liteIdentity,
      liteTokenAccount: keypair.liteTokenAccount,
    };
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  /** Collect context keys from inputs for passthrough to downstream nodes. */
  private collectPassthrough(inputs: NodeOutputs): Record<string, unknown> {
    const passthrough: Record<string, unknown> = {};
    for (const key of CONTEXT_KEYS) {
      if (inputs[key] !== undefined) passthrough[key] = inputs[key];
    }
    return passthrough;
  }

  /**
   * Recursively resolve template variables in nested objects / arrays.
   */
  private deepResolve(value: unknown, inputs: NodeOutputs): unknown {
    if (typeof value === 'string') return this.resolveValue(value, inputs);
    if (Array.isArray(value)) return value.map((v) => this.deepResolve(v, inputs));
    if (value !== null && typeof value === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        resolved[k] = this.deepResolve(v, inputs);
      }
      return resolved;
    }
    return value;
  }

  /**
   * Resolve variable references in a value
   * Supports: ${nodeId.outputName} and {{variableName}}
   */
  private resolveValue(value: string, inputs: NodeOutputs): string {
    if (typeof value !== 'string') return value;

    let resolved = value.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const inputValue = inputs[path];
      return inputValue !== undefined ? String(inputValue) : `\${${path}}`;
    });

    resolved = resolved.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
      const trimmed = varName.trim();
      // 1. Flow variable lookup (var:name)
      const flowVar = inputs[`var:${trimmed}`];
      if (flowVar !== undefined) return String(flowVar);
      // 2. Node output reference: {{nodeId.outputKey}}
      const dotIndex = trimmed.indexOf('.');
      if (dotIndex !== -1) {
        // Try exact namespaced key first (e.g., "create_sender_account.tokenAccountUrl")
        const exactValue = inputs[trimmed];
        if (exactValue !== undefined) return String(exactValue);
        // Fall back to just the output key part
        const outputKey = trimmed.slice(dotIndex + 1);
        const outputValue = inputs[outputKey];
        if (outputValue !== undefined) return String(outputValue);
      }
      // 3. Direct input lookup
      const directValue = inputs[trimmed];
      if (directValue !== undefined) return String(directValue);
      return `{{${varName}}}`;
    });

    return resolved;
  }

  /**
   * Parse amount string to number (handles decimals)
   */
  private parseAmount(amount: string | number): number {
    if (typeof amount === 'number') return amount;
    const cleaned = amount.replace(/[, ]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      throw new Error(`Invalid amount: ${amount}`);
    }
    return Math.round(num * 1e8);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Map block type to Accumulate transaction type name
   */
  private mapBlockTypeToTxType(blockType: BlockType): string {
    const mapping: Record<string, string> = {
      CreateIdentity: 'CreateIdentity',
      CreateKeyBook: 'CreateKeyBook',
      CreateKeyPage: 'CreateKeyPage',
      CreateTokenAccount: 'CreateTokenAccount',
      CreateDataAccount: 'CreateDataAccount',
      CreateToken: 'CreateToken',
      SendTokens: 'SendTokens',
      IssueTokens: 'IssueTokens',
      BurnTokens: 'BurnTokens',
      AddCredits: 'AddCredits',
      TransferCredits: 'TransferCredits',
      BurnCredits: 'BurnCredits',
      WriteData: 'WriteData',
      WriteDataTo: 'WriteDataTo',
      UpdateKeyPage: 'UpdateKeyPage',
      UpdateKey: 'UpdateKey',
      LockAccount: 'LockAccount',
      UpdateAccountAuth: 'UpdateAccountAuth',
    };

    return mapping[blockType] || blockType;
  }
}
