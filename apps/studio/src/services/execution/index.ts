/**
 * Execution Engine - Run flows on Accumulate network
 */

import type {
  Flow,
  FlowNode,
  NodeExecutionState,
  AccountStateDiff,
} from '@accumulate-studio/types';
import { topologicalSort } from '@accumulate-studio/types';
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
          // Infer synthetic type from parent transaction type
          // V2: type at top level; V3: nested under message.transaction.body.type
          const msg = txData.message as Record<string, unknown> | undefined;
          const txType = (txData.type as string)
            || (msg?.transaction as Record<string, unknown>)?.body
              && ((msg?.transaction as Record<string, unknown>)?.body as Record<string, unknown>)?.type as string
            || (msg?.type as string)
            || '';
          const syntheticType = txType === 'sendTokens' ? 'SyntheticDepositTokens'
            : txType === 'addCredits' ? 'SyntheticDepositCredits'
            : txType === 'createIdentity' ? 'SyntheticCreateIdentity'
            : txType === 'writeData' ? 'SyntheticWriteData'
            : 'SyntheticDepositTokens';

          // V2 has origin at top level; V3 nests it under message.transaction.header.principal
          const origin = (txData.origin as string)
            || (msg?.transaction as Record<string, unknown>)?.header
              && ((msg?.transaction as Record<string, unknown>)?.header as Record<string, unknown>)?.principal as string
            || '';

          const mapped = producedList.map((txid: string) => {
            const hashMatch = txid.match(/acc:\/\/([a-f0-9]+)@/);
            const destMatch = txid.match(/@(.+)/);
            return {
              type: syntheticType,
              hash: hashMatch?.[1] || txid,
              txid,
              source: origin,
              destination: destMatch ? `acc://${destMatch[1]}` : '',
              status: 'delivered' as const,
            };
          });
          mergeOutput('synthetics', mapped);
        }

        // Build receipt from transaction data if available
        // V2: status is an object; V3: status is an enum string with separate fields
        const rawStatus = txData.status;
        const isDelivered = rawStatus === 'delivered'
          || (typeof rawStatus === 'object' && rawStatus !== null
            && ((rawStatus as Record<string, unknown>).delivered || (rawStatus as Record<string, unknown>).code === 'delivered'));
        const statusObj = typeof rawStatus === 'object' && rawStatus !== null
          ? rawStatus as Record<string, unknown>
          : null;
        if (rawStatus) {
          const receipt: Record<string, unknown> = {
            txHash,
            localBlock: statusObj?.blockHeight || txData.blockHeight || txData.received,
            localTimestamp: statusObj?.timestamp || txData.timestamp || txData.lastBlockTime || new Date().toISOString(),
            proof: statusObj?.proof || [],
            verified: isDelivered,
          };
          if (statusObj?.majorBlock) {
            receipt.majorBlock = statusObj.majorBlock;
            receipt.majorTimestamp = statusObj.majorTimestamp;
          }
          useFlowStore.getState().updateNodeExecution(nodeId, {
            receipt,
          });
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
