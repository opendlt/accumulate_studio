/**
 * Execution Engine - Run flows on Accumulate network
 */

import type {
  Flow,
  FlowNode,
  NodeExecutionState,
  AccountStateDiff,
  SyntheticMessageType,
} from '@accumulate-studio/types';
import { topologicalSort } from '@accumulate-studio/types';
import { parseReceipt, verifyReceipt } from '@accumulate-studio/verification';
import { useFlowStore } from '../../store/flow-store';
import { networkService, AccumulateAPI } from '../network';
import { NodeExecutor, type NodeOutputs } from './node-executor';

// =============================================================================
// Execution Types
// =============================================================================

export type ExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface ExecutionContext {
  flow: Flow;
  nodeOutputs: Map<string, NodeOutputs>;
  variables: Map<string, unknown>;
  api: AccumulateAPI;
  abortController: AbortController;
  sessionId: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse a transaction status (V2 object form or V3 string form) into a concrete
 * synthetic status. Never fabricates 'delivered' — unknown shapes degrade to
 * 'unknown' (a non-green, honest state).
 */
export function parseSyntheticStatus(raw: unknown): 'pending' | 'delivered' | 'failed' | 'unknown' {
  if (typeof raw === 'string') {
    const l = raw.toLowerCase();
    if (l === 'delivered' || l === 'confirmed') return 'delivered';
    if (l === 'failed' || l === 'error') return 'failed';
    if (l === 'pending') return 'pending';
    return 'unknown';
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (o.failed) return 'failed';
    if (o.delivered || o.code === 'delivered' || o.code === 'ok') return 'delivered';
    if (o.pending) return 'pending';
  }
  return 'unknown';
}

// =============================================================================
// Execution Engine
// =============================================================================

export class ExecutionEngine {
  private status: ExecutionStatus = 'idle';
  private context: ExecutionContext | null = null;
  private pausePromise: { resolve: () => void } | null = null;
  private nodeExecutor: NodeExecutor | null = null;
  private executionPromise: Promise<void> | null = null;
  private pendingEnrichments: { nodeId: string; txHash: string; inputs: NodeOutputs }[] = [];

  /**
   * Execute an entire flow
   */
  async executeFlow(flow: Flow): Promise<void> {
    if (this.status === 'running') {
      throw new Error('Execution already in progress');
    }

    const networkConfig = networkService.getNetworkConfig();
    if (!networkConfig) {
      throw new Error('Not connected to any network');
    }

    // Generate a session ID for SDK proxy keypair management
    const sessionId = crypto.randomUUID();

    // Initialize execution context
    const api = new AccumulateAPI(networkConfig);
    this.context = {
      flow,
      nodeOutputs: new Map(),
      variables: new Map(),
      api,
      abortController: new AbortController(),
      sessionId,
    };

    // Initialize flow variables with defaults
    for (const variable of flow.variables) {
      if (variable.default !== undefined) {
        this.context.variables.set(variable.name, variable.default);
      }
    }

    this.nodeExecutor = new NodeExecutor(api, sessionId);
    this.status = 'running';

    // Update store
    const store = useFlowStore.getState();

    // Consistency gate: the proxy must be able to serve the UI-selected network,
    // otherwise submissions and verification would target different chains.
    try {
      const health = await api.callProxyGet<{ network?: string; allowed?: string[] }>('/api/health');
      const allowed = health.allowed ?? (health.network ? [health.network] : []);
      if (networkConfig.id && allowed.length > 0 && !allowed.includes(networkConfig.id)) {
        this.status = 'idle';
        store.addExecutionLog({
          level: 'error',
          message:
            `Network mismatch: UI is on "${networkConfig.id}" but the proxy only serves ` +
            `[${allowed.join(', ')}]. Submissions and verification would target different ` +
            `chains. Aborting — switch networks or reconfigure the proxy (ALLOWED_NETWORKS).`,
        });
        throw new Error(`Network mismatch (UI=${networkConfig.id}, proxy serves ${allowed.join(', ')})`);
      }
    } catch (err) {
      // If this is our own mismatch abort, rethrow. Otherwise the health endpoint
      // was unreachable — warn but let execution proceed (the proxy still gates
      // each request via the network allowlist).
      if (err instanceof Error && err.message.startsWith('Network mismatch')) {
        throw err;
      }
      store.addExecutionLog({
        level: 'warn',
        message: `Proxy health check failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    store.startExecution();
    store.addExecutionLog({
      level: 'info',
      message: `Starting flow execution: ${flow.name}`,
    });

    // Execute nodes in topological order
    this.executionPromise = this.runExecution();

    try {
      await this.executionPromise;

      // Run deferred enrichment (receipts, state diffs) now that all nodes
      // have completed and accounts have had time to settle.
      if (this.pendingEnrichments.length > 0 && this.context) {
        const api = this.context.api;
        await Promise.all(
          this.pendingEnrichments.map((e) =>
            this.enrichNodeData(e.nodeId, e.txHash, e.inputs, api).catch((err) => {
              store.addExecutionLog({
                level: 'warn',
                nodeId: e.nodeId,
                message: `Post-tx enrichment error: ${err instanceof Error ? err.message : String(err)}`,
              });
            })
          )
        );
        this.pendingEnrichments = [];
      }

      if (this.status === 'running') {
        this.status = 'completed';
        store.completeExecution('completed');
        store.addExecutionLog({
          level: 'info',
          message: 'Flow execution completed successfully',
        });
      }
    } catch (error) {
      if (this.status !== 'paused') {
        this.status = 'failed';
        store.completeExecution('failed');
        store.addExecutionLog({
          level: 'error',
          message: error instanceof Error ? error.message : 'Flow execution failed',
        });
      }
      throw error;
    } finally {
      // Evict the session's signing key from the proxy as soon as the run ends
      // (completed or failed). Pause does not settle executionPromise, so this
      // does not fire mid-pause.
      await this.logoutSession();
    }
  }

  /**
   * Execute a single node by ID
   */
  async executeNode(nodeId: string): Promise<NodeOutputs> {
    if (!this.context || !this.nodeExecutor) {
      throw new Error('No execution context - call executeFlow first');
    }

    const node = this.context.flow.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const store = useFlowStore.getState();

    // Update node status to running
    store.updateNodeExecution(nodeId, {
      nodeId,
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    try {
      // Gather inputs from connected nodes
      const inputs = this.gatherNodeInputs(node);

      // Execute the node
      const outputs = await this.nodeExecutor.execute(node, inputs, this.context);

      // Store outputs for dependent nodes
      this.context.nodeOutputs.set(nodeId, outputs);

      // Update node status to success
      store.updateNodeExecution(nodeId, {
        status: 'success',
        completedAt: new Date().toISOString(),
        outputs: outputs as Record<string, unknown>,
        txHash: outputs.txHash as string | undefined,
      });

      store.addExecutionLog({
        level: 'info',
        nodeId,
        message: `Node "${node.label || node.type}" completed successfully`,
        data: outputs,
      });

      // Queue enrichment for after the full flow completes (accounts need
      // time to settle — e.g. faucet synthetic deposits).
      const txHash = outputs.txHash as string | undefined;
      if (txHash) {
        this.pendingEnrichments.push({ nodeId, txHash, inputs: { ...inputs } });
      } else {
        store.addExecutionLog({
          level: 'debug',
          nodeId,
          message: 'No txHash returned — skipping enrichment',
        });
      }

      return outputs;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      store.updateNodeExecution(nodeId, {
        status: 'error',
        completedAt: new Date().toISOString(),
        error: {
          code: 'EXECUTION_ERROR',
          message: errorMessage,
        },
      });

      store.addExecutionLog({
        level: 'error',
        nodeId,
        message: `Node "${node.label || node.type}" failed: ${errorMessage}`,
      });

      throw error;
    }
  }

  /**
   * Pause running execution
   */
  pauseExecution(): void {
    if (this.status !== 'running') {
      throw new Error('No execution running to pause');
    }

    this.status = 'paused';

    const store = useFlowStore.getState();
    store.addExecutionLog({
      level: 'info',
      message: 'Execution paused',
    });
  }

  /**
   * Resume paused execution
   */
  resumeExecution(): void {
    if (this.status !== 'paused') {
      throw new Error('No paused execution to resume');
    }

    this.status = 'running';

    if (this.pausePromise) {
      this.pausePromise.resolve();
      this.pausePromise = null;
    }

    const store = useFlowStore.getState();
    store.addExecutionLog({
      level: 'info',
      message: 'Execution resumed',
    });
  }

  /**
   * Stop execution completely
   */
  stopExecution(): void {
    if (this.status === 'idle') {
      return;
    }

    // Abort any pending requests
    if (this.context) {
      this.context.abortController.abort();
    }

    // Best-effort: evict the session key before we tear down the context.
    void this.logoutSession();

    // Resume if paused so the execution can exit
    if (this.pausePromise) {
      this.pausePromise.resolve();
      this.pausePromise = null;
    }

    this.status = 'failed';

    const store = useFlowStore.getState();
    store.completeExecution('failed');
    store.addExecutionLog({
      level: 'warn',
      message: 'Execution stopped by user',
    });

    this.cleanup();
  }

  /**
   * Get current execution status
   */
  getStatus(): ExecutionStatus {
    return this.status;
  }

  /**
   * Get an AccumulateAPI bound to the same network as the last/active run, for
   * post-execution reads (assertions). Reuses the run's context API when present
   * so reads go through the proxy on the same chain that performed submission;
   * falls back to a fresh API on the currently-selected network.
   */
  getApi(): AccumulateAPI {
    if (this.context?.api) return this.context.api;
    const cfg = networkService.getNetworkConfig();
    if (!cfg) throw new Error('Not connected to any network');
    return new AccumulateAPI(cfg);
  }

  /**
   * Get node outputs from current execution
   */
  getNodeOutputs(nodeId: string): NodeOutputs | undefined {
    return this.context?.nodeOutputs.get(nodeId);
  }

  /**
   * Get all node outputs
   */
  getAllNodeOutputs(): Map<string, NodeOutputs> {
    return this.context?.nodeOutputs ?? new Map();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private async runExecution(): Promise<void> {
    if (!this.context) return;

    // Get nodes in execution order
    const sortedNodes = topologicalSort(this.context.flow);
    const store = useFlowStore.getState();

    for (const node of sortedNodes) {
      // Check for abort
      if (this.context.abortController.signal.aborted) {
        throw new Error('Execution aborted');
      }

      // Check for pause
      if (this.status === 'paused') {
        await this.waitForResume();
        if (this.status !== 'running') {
          throw new Error('Execution stopped');
        }
      }

      // Skip comment nodes
      if (node.type === 'Comment') {
        store.updateNodeExecution(node.id, {
          nodeId: node.id,
          status: 'skipped',
        });
        continue;
      }

      // Check if node dependencies are satisfied
      const dependenciesMet = this.checkDependencies(node);
      if (!dependenciesMet) {
        store.updateNodeExecution(node.id, {
          nodeId: node.id,
          status: 'skipped',
          error: {
            code: 'DEPENDENCIES_NOT_MET',
            message: 'Node dependencies not satisfied',
          },
        });
        continue;
      }

      // Execute the node
      await this.executeNode(node.id);
    }
  }

  private waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      this.pausePromise = { resolve };
    });
  }

  private gatherNodeInputs(node: FlowNode): NodeOutputs {
    if (!this.context) return {};

    const inputs: NodeOutputs = {};

    // Find all connections where this node is the target
    const incomingConnections = this.context.flow.connections.filter(
      (conn) => conn.targetNodeId === node.id
    );

    for (const conn of incomingConnections) {
      const sourceOutputs = this.context.nodeOutputs.get(conn.sourceNodeId);
      if (sourceOutputs) {
        // Try specific port mapping first
        const value = sourceOutputs[conn.sourcePortId];
        if (value !== undefined) {
          inputs[conn.targetPortId] = value;
        }

        // For generic connections (output→input), spread all upstream outputs
        // so downstream nodes can access any output by name
        if (conn.sourcePortId === 'output' || !sourceOutputs[conn.sourcePortId]) {
          for (const [key, val] of Object.entries(sourceOutputs)) {
            if (inputs[key] === undefined) {
              inputs[key] = val;
            }
          }
        }
      }
    }

    // Add namespaced outputs from ALL completed nodes so any node can
    // reference a specific upstream node's output via {{nodeId.outputKey}}
    for (const [nodeId, outputs] of this.context.nodeOutputs) {
      for (const [key, val] of Object.entries(outputs)) {
        const namespacedKey = `${nodeId}.${key}`;
        if (inputs[namespacedKey] === undefined) {
          inputs[namespacedKey] = val;
        }
      }
    }

    // Also include flow variables
    for (const [name, value] of this.context.variables) {
      inputs[`var:${name}`] = value;
    }

    return inputs;
  }

  private checkDependencies(node: FlowNode): boolean {
    if (!this.context) return false;

    // Find nodes that this node depends on
    const dependencies = this.context.flow.connections
      .filter((conn) => conn.targetNodeId === node.id)
      .map((conn) => conn.sourceNodeId);

    // Check if all dependencies completed successfully
    const store = useFlowStore.getState();
    for (const depId of dependencies) {
      const state = store.execution?.nodeStates[depId];
      if (!state || state.status !== 'success') {
        return false;
      }
    }

    return true;
  }

  /**
   * Fetch tx details, account state, and receipt for a completed transaction node.
   * Uses the SDK proxy (same network as submissions) instead of direct V2 queries.
   */
  private async enrichNodeData(
    nodeId: string,
    txHash: string,
    inputs: NodeOutputs,
    api: AccumulateAPI
  ): Promise<void> {
    const log = (level: 'info' | 'warn' | 'debug', message: string) => {
      useFlowStore.getState().addExecutionLog({ level, nodeId, message });
    };

    // Helper: merge a key into the node's outputs using fresh state
    const mergeOutput = (key: string, value: unknown) => {
      const fresh = useFlowStore.getState().execution?.nodeStates[nodeId];
      if (fresh) {
        useFlowStore.getState().updateNodeExecution(nodeId, {
          outputs: { ...fresh.outputs, [key]: value },
        });
      }
    };

    // 1) Query transaction details via proxy (same network as submission)
    try {
      const txResult = await api.callProxy<{
        success: boolean;
        data?: Record<string, unknown>;
        error?: string;
      }>('/api/query-tx', { tx_hash: txHash });

      log('info', `Tx query result: success=${txResult.success}, hasData=${!!txResult.data}, keys=${txResult.data ? Object.keys(txResult.data).join(',') : 'none'}`);
      if (txResult.success && txResult.data) {
        const txData = txResult.data;

        // --- Extract produced txid strings from V2 or V3 formats ---
        // V2: produced is a flat array of strings
        // V3: produced is a RecordRange object { records: [{ value: "acc://..." }], total: N }
        const rawProduced = txData.produced || txData.syntheticTxids || txData.synthetics;
        let producedList: string[] = [];
        if (Array.isArray(rawProduced)) {
          // V2 style: flat array of strings (or objects with value/txid)
          producedList = rawProduced.map((s: unknown) =>
            typeof s === 'string' ? s
              : (s as Record<string, unknown>)?.value as string
              || (s as Record<string, unknown>)?.txid as string
              || String(s)
          );
        } else if (rawProduced && typeof rawProduced === 'object') {
          // V3 style: RecordRange { records: [TxIDRecord], total: N }
          const records = (rawProduced as Record<string, unknown>).records;
          if (Array.isArray(records)) {
            producedList = records.map((r: unknown) =>
              typeof r === 'string' ? r
                : (r as Record<string, unknown>)?.value as string
                || (r as Record<string, unknown>)?.txid as string
                || String(r)
            );
          }
        }
        log('info', `Produced (${producedList.length}): ${JSON.stringify(producedList).slice(0, 300)}`);

        if (producedList.length > 0) {
          const msg = txData.message as Record<string, unknown> | undefined;
          const txn = msg?.transaction as Record<string, unknown> | undefined;
          const body = txn?.body as Record<string, unknown> | undefined;
          const header = txn?.header as Record<string, unknown> | undefined;

          // Parent tx type (V2 top-level OR V3 nested) — parenthesized, no precedence bug.
          const parentTxType =
            (txData.type as string | undefined)
            ?? (body?.type as string | undefined)
            ?? (msg?.type as string | undefined)
            ?? '';

          const parentOrigin =
            (txData.origin as string | undefined)
            ?? (header?.principal as string | undefined)
            ?? '';

          // Fallback type label derived from the PARENT — used only when the
          // synthetic's own body type is not (yet) returned by the query.
          const fallbackType: SyntheticMessageType =
            parentTxType === 'sendTokens' ? 'SyntheticDepositTokens'
            : parentTxType === 'addCredits' ? 'SyntheticDepositCredits'
            : parentTxType === 'createIdentity' ? 'SyntheticCreateIdentity'
            : parentTxType === 'writeData' ? 'SyntheticWriteData'
            : 'SyntheticSequenced';

          const KNOWN_SYNTHETIC: SyntheticMessageType[] = [
            'SyntheticCreateIdentity', 'SyntheticWriteData', 'SyntheticDepositTokens',
            'SyntheticDepositCredits', 'SyntheticBurnTokens', 'SyntheticMirror',
            'SyntheticSequenced', 'SyntheticAnchor',
          ];

          // Query each produced synthetic for its REAL status/type/destination.
          const mapped = await Promise.all(producedList.map(async (txid: string) => {
            const hashMatch = txid.match(/acc:\/\/([a-f0-9]+)@/);
            const destMatch = txid.match(/@(.+)/);
            const hash = hashMatch?.[1] || txid;

            // Last-resort fallbacks (string scraping) — overridden by the query below.
            let type: SyntheticMessageType = fallbackType;
            let source = parentOrigin;
            let destination = destMatch ? `acc://${destMatch[1]}` : '';
            let status: 'pending' | 'delivered' | 'failed' | 'unknown' = 'unknown';

            try {
              const synRes = await api.callProxy<{
                success: boolean;
                data?: Record<string, unknown>;
                error?: string;
              }>('/api/query-tx', { tx_hash: txid });

              if (synRes.success && synRes.data) {
                const sd = synRes.data;
                const sMsg = sd.message as Record<string, unknown> | undefined;
                const sTxn = sMsg?.transaction as Record<string, unknown> | undefined;
                const sBody = sTxn?.body as Record<string, unknown> | undefined;
                const sHeader = sTxn?.header as Record<string, unknown> | undefined;

                // Real synthetic body type, if the network returns it.
                const sType =
                  (sd.type as string | undefined)
                  ?? (sBody?.type as string | undefined)
                  ?? (sMsg?.type as string | undefined);
                if (sType) {
                  const norm = sType.charAt(0).toUpperCase() + sType.slice(1);
                  if (KNOWN_SYNTHETIC.includes(norm as SyntheticMessageType)) {
                    type = norm as SyntheticMessageType;
                  }
                }

                // Real source/destination from the synthetic's header.
                const sPrincipal = sHeader?.principal as string | undefined;
                if (sPrincipal) destination = sPrincipal;
                const sSource = (sBody?.source as string | undefined) ?? (sd.origin as string | undefined);
                if (sSource) source = sSource;

                // Real status — never hardcoded.
                status = parseSyntheticStatus(sd.status);
              }
            } catch (e) {
              log('debug', `Synthetic query failed for ${txid}: ${e instanceof Error ? e.message : String(e)}`);
              status = 'unknown';
            }

            return { type, hash, txid, source, destination, status };
          }));

          mergeOutput('synthetics', mapped);
        }

        // Build receipt with REAL Merkle verification. `verified` is set ONLY by
        // recomputing the SHA-256 root from the proof and matching the anchor —
        // never from delivery status.
        const rawStatus = txData.status;
        const statusObj = typeof rawStatus === 'object' && rawStatus !== null
          ? rawStatus as Record<string, unknown>
          : null;

        if (rawStatus) {
          // The Merkle proof lives on the principal account's chain (V3), fetched
          // via /api/query-receipt (chain entry + receipt), not on the tx message.
          const receiptAccount =
            (inputs.principal as string | undefined)
            || (inputs.liteTokenAccount as string | undefined)
            || (inputs.liteTokenAccountUrl as string | undefined);

          let proofEntries: { hash: string; right: boolean }[] = [];
          let anchor: string | undefined;
          let leaf = txHash;

          if (receiptAccount) {
            try {
              const rcptRes = await api.callProxy<{
                success: boolean;
                data?: Record<string, unknown>;
                error?: string;
              }>('/api/query-receipt', { account: receiptAccount, tx_hash: txHash });

              const rcpt = rcptRes.success
                ? (rcptRes.data?.receipt as Record<string, unknown> | undefined)
                : undefined;
              if (rcpt) {
                const rawEntries = (rcpt.entries as unknown[] | undefined) ?? [];
                proofEntries = rawEntries
                  .map((e) => {
                    const o = e as Record<string, unknown>;
                    return { hash: String(o.hash ?? ''), right: o.right === true };
                  })
                  .filter((e) => e.hash.length > 0);
                anchor = rcpt.anchor as string | undefined;
                leaf = (rcpt.start as string | undefined) || txHash;
              }
            } catch (e) {
              log('debug', `Receipt query failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          let verified = false;
          let verificationState: 'verified' | 'pending-anchor' | 'failed' = 'pending-anchor';
          if (proofEntries.length > 0 && anchor) {
            try {
              const parsed = parseReceipt({
                txHash: leaf,
                localBlock: (statusObj?.blockHeight ?? txData.blockHeight ?? txData.received ?? 0) as number,
                localTimestamp: (statusObj?.timestamp ?? txData.timestamp ?? new Date().toISOString()) as string,
                majorBlock: statusObj?.majorBlock as number | undefined,
                majorTimestamp: statusObj?.majorTimestamp as string | undefined,
                proof: proofEntries,
                anchorChain: { start: '', end: '', anchor },
              });
              const result = verifyReceipt(parsed);
              verified = result.valid;
              verificationState = result.valid ? 'verified' : 'failed';
              log(verified ? 'info' : 'warn',
                `Receipt verification: ${verified ? 'VERIFIED (Merkle root matches anchor)' : `FAILED (${result.error ?? 'root mismatch'})`}`);
            } catch (e) {
              verificationState = 'failed';
              log('warn', `Receipt verification threw: ${e instanceof Error ? e.message : String(e)}`);
            }
          } else {
            log('debug', 'Receipt has no proof/anchor yet — awaiting major-block anchoring');
          }

          const receipt: Record<string, unknown> = {
            txHash,
            localBlock: statusObj?.blockHeight || txData.blockHeight || txData.received,
            localTimestamp: statusObj?.timestamp || txData.timestamp || txData.lastBlockTime || new Date().toISOString(),
            proof: proofEntries,
            anchorChain: anchor ? { start: leaf, end: leaf, anchor } : undefined,
            verified,
            verificationState,
          };
          if (statusObj?.majorBlock) {
            receipt.majorBlock = statusObj.majorBlock;
            receipt.majorTimestamp = statusObj.majorTimestamp;
          }
          useFlowStore.getState().updateNodeExecution(nodeId, { receipt });
        }
      } else {
        log('debug', `Tx query: ${txResult.error || 'no data returned'}`);
      }
    } catch (err) {
      log('debug', `Tx query failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2) Query principal account state via proxy for state diff
    const principal = (inputs.principal as string) || (inputs.liteTokenAccount as string);
    if (principal) {
      try {
        const queryResult = await api.callProxy<{
          success: boolean;
          data?: Record<string, unknown>;
          error?: string;
        }>('/api/query', { url: principal });

        if (queryResult.success && queryResult.data) {
          const raw = queryResult.data;
          // Proxy normalizes nested data, but handle both formats defensively
          const acct = (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data))
            ? { ...raw, ...raw.data }
            : raw;
          const diff: AccountStateDiff = {
            url: principal,
            accountType: (acct.type as string) || 'unknown',
            before: null,
            after: acct,
            changes: [],
          };

          if (acct.balance !== undefined) {
            diff.changes.push({ path: 'balance', type: 'changed', after: acct.balance });
          }
          if (acct.creditBalance !== undefined || acct.credits !== undefined) {
            diff.changes.push({ path: 'creditBalance', type: 'changed', after: acct.creditBalance ?? acct.credits });
          }
          if (acct.tokenUrl) {
            diff.changes.push({ path: 'tokenUrl', type: 'added', after: acct.tokenUrl });
          }
          if (acct.url) {
            diff.changes.push({ path: 'url', type: 'added', after: acct.url });
          }

          mergeOutput('stateDiff', diff);
        } else {
          log('debug', `Account query: ${queryResult.error || 'no data returned'}`);
        }
      } catch (err) {
        log('debug', `Account query failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Best-effort logout: tell the proxy to evict this session's signing key.
   * Safe to call multiple times; no-ops once the context has been cleaned up.
   */
  private async logoutSession(): Promise<void> {
    if (!this.context) return;
    const { api, sessionId } = this.context;
    try {
      await api.callProxy('/api/logout', { session_id: sessionId });
    } catch {
      /* best-effort — the proxy evicts on TTL even if this fails */
    }
  }

  private cleanup(): void {
    this.context = null;
    this.nodeExecutor = null;
    this.pausePromise = null;
    this.executionPromise = null;
    this.pendingEnrichments = [];
    this.status = 'idle';
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const executionEngine = new ExecutionEngine();

// =============================================================================
// Re-exports
// =============================================================================

export { NodeExecutor, type NodeOutputs } from './node-executor';
