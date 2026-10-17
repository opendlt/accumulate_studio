/**
 * The shipped `hash-lock` template, run end to end through the REAL ExecutionEngine and the REAL
 * NodeExecutor against a stateful fake of the proxy + chain. What it proves: every reference in the
 * flow resolves ({{locked_send.txId}}, {{wait_for_locked_deposit.lockedTxId}}, hashLockFrom ...),
 * the amounts reach the proxy in the right base units, the lock travels on the send, the deposit is
 * found among `produced`, the release reveals the generated preimage, and a wrong preimage fails the
 * flow at the release node. The chain's rules are copied from the Kermit observations in
 * docs/hash-lock-example/STATUS.md; the live run is the proof against the real network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { Flow, FlowExecutionState } from '@accumulate-studio/types';

// ── Mocks (before imports) ───────────────────────────────────────────────────

type NodeState = { status: string; outputs?: Record<string, unknown>; error?: { message: string } };
const mockStore = {
  startExecution: vi.fn(),
  addExecutionLog: vi.fn(),
  completeExecution: vi.fn(),
  updateNodeExecution: vi.fn((id: string, patch: Partial<NodeState>) => {
    mockStore.execution.nodeStates[id] = { ...(mockStore.execution.nodeStates[id] ?? {}), ...patch } as NodeState;
  }),
  execution: { nodeStates: {} as Record<string, NodeState> },
};

vi.mock('../../store/flow-store', () => ({
  useFlowStore: { getState: vi.fn(() => mockStore) },
}));

let chain: FakeChain;
vi.mock('../network', () => ({
  networkService: {
    getNetworkConfig: vi.fn(() => ({
      id: 'kermit',
      name: 'Kermit',
      description: 'Kermit test network',
      v2Endpoint: 'x',
      v3Endpoint: 'x',
      proxyEndpoint: 'http://localhost:8000',
      faucetAvailable: true,
    })),
  },
  AccumulateAPI: vi.fn().mockImplementation(() => chain.api()),
}));

import { ExecutionEngine } from '../execution';
import { GOLDEN_PATH_TEMPLATES } from '../../data/flow-templates';
import { runAssertions } from '../assertion-runner';

// ── A stateful fake of the proxy and the chain ───────────────────────────────

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest();
const hash160 = (b: Buffer) => createHash('ripemd160').update(sha256(b)).digest();
const hex = (n: number, c = 'a') => c.repeat(n);
const ADI = 'acc://htlc-test.acme';
const LITE_ID = `acc://${hex(48, 'b')}`;
const LTA = `${LITE_ID}/ACME`;

/** The fields of a proxy request body that the fake chain reads (each call uses a subset). */
interface Req {
  times: number;
  url: string;
  principal: string;
  tx_type: string;
  recipients: Array<{ url: string; amount: string }>;
  hash: string;
  hash_algorithm: string;
  expiration: number;
  fields: { lockedTxID: string; preimage: string };
  tx_hash: string;
}
type Body = Req;

interface Lock {
  sendTx: string;
  depositTx: string;
  recipient: string;
  amount: bigint;
  algorithm: string;
  hash: string;
  expiration: number;
  releaseTx?: string;
}

class FakeChain {
  balances = new Map<string, bigint>();
  accounts = new Set<string>([LTA, LITE_ID]);
  locks: Lock[] = [];
  calls: Array<{ path: string; body: Body }> = [];
  depositQueries = 0;
  private seq = 0;

  private txid(account: string) {
    return `acc://${(++this.seq).toString(16).padStart(64, '0')}@${account}`;
  }
  private bal(account: string) {
    return this.balances.get(account) ?? 0n;
  }
  private credit(account: string, amount: bigint) {
    this.balances.set(account, this.bal(account) + amount);
  }

  api() {
    return {
      setAbortSignal: vi.fn(),
      setSessionToken: vi.fn(),
      callProxyGet: vi.fn(async () => ({ network: 'kermit', allowed: ['kermit'] })),
      // the assertion runner reads balances through callProxy
      callProxy: vi.fn(async (path: string, body: Body) =>
        path === '/api/query' ? this.read(path, body) : this.write(path, body)
      ),
      callProxyRead: vi.fn(async (path: string, body: Body) => this.read(path, body)),
    };
  }

  private write(path: string, body: Body) {
    this.calls.push({ path, body });
    switch (path) {
      case '/api/generate-keys':
        return {
          algorithm: 'ed25519',
          public_key: hex(64, 'c'),
          public_key_hash: hex(64, 'd'),
          lite_identity: LITE_ID,
          lite_token_account: LTA,
          token: 'tok',
        };
      case '/api/faucet':
        this.credit(LTA, BigInt(body.times) * 1_000_000_000n); // 10 ACME per call
        return { success: true, tx_hash: this.txid(LTA) };
      case '/api/add-credits':
      case '/api/create-identity':
        return { success: true, tx_hash: this.txid(LTA) };
      case '/api/create-token-account':
        this.accounts.add(body.url);
        return { success: true, tx_hash: this.txid(ADI) };
      case '/api/send-tokens':
        return this.sendTokens(body);
      case '/api/sign-and-submit':
        return this.signAndSubmit(body);
      case '/api/logout':
        return { success: true };
      default:
        throw new Error(`fake chain: unexpected proxy write ${path}`);
    }
  }

  private sendTokens(body: Body) {
    const total = (body.recipients as Array<{ amount: string }>).reduce((s, r) => s + BigInt(r.amount), 0n);
    if (this.bal(body.principal) < total) {
      return { success: false, error: `insufficient balance: have ${this.bal(body.principal)}, need ${total}` };
    }
    const sendTx = this.txid(body.principal);
    if (body.hash !== undefined) {
      // the node's own checks on a hash lock
      // the hash length must match the algorithm: 32 bytes for sha256 and sha256d, 20 for hash160
      const hashLength = body.hash_algorithm === 'hash160' ? 40 : 64;
      if (!['sha256', 'sha256d', 'hash160'].includes(body.hash_algorithm) || !new RegExp(`^[0-9a-f]{${hashLength}}$`).test(body.hash)) {
        return { success: false, error: 'invalid hash lock' };
      }
      const ahead = body.expiration - Date.now() / 1000;
      if (!Number.isInteger(body.expiration) || ahead < 600 || ahead > 30 * 86400) {
        return { success: false, error: 'expiration must be between 10 minutes and 30 days away' };
      }
      this.balances.set(body.principal, this.bal(body.principal) - total); // sender debited now
      this.locks.push({
        sendTx,
        depositTx: this.txid(body.recipients[0].url),
        recipient: body.recipients[0].url,
        amount: total,
        algorithm: body.hash_algorithm,
        hash: body.hash,
        expiration: body.expiration,
      });
    } else {
      this.balances.set(body.principal, this.bal(body.principal) - total);
      for (const r of body.recipients) this.credit(r.url, BigInt(r.amount));
    }
    return { success: true, tx_hash: sendTx };
  }

  private signAndSubmit(body: Body) {
    if (body.tx_type !== 'ReleaseLockedOperation') return { success: true, tx_hash: this.txid(body.principal) };
    const lock = this.locks.find((l) => l.depositTx === body.fields.lockedTxID);
    if (!lock) return { success: false, error: 'Transaction failed: locked deposit not found (not found, code 404)' };
    if (body.principal !== lock.recipient) {
      return { success: false, error: 'Transaction failed: principal is not the recipient (unauthenticated, code 401)' };
    }
    const preimage = Buffer.from(body.fields.preimage, 'hex');
    const digest = lock.algorithm === 'sha256d' ? sha256(sha256(preimage)) : lock.algorithm === 'hash160' ? hash160(preimage) : sha256(preimage);
    if (digest.toString('hex') !== lock.hash) {
      return { success: false, error: 'Transaction failed: preimage does not match hash (unauthenticated, code 401)' };
    }
    if (lock.releaseTx) return { success: false, error: 'Transaction failed: already released (code 400)' };
    lock.releaseTx = this.txid(body.principal);
    this.credit(lock.recipient, lock.amount);
    return { success: true, tx_hash: lock.releaseTx };
  }

  private read(path: string, body: Body) {
    if (path === '/api/query') {
      if (!this.accounts.has(body.url) && !body.url.startsWith(ADI)) return { success: false, error: 'not found' };
      return { success: true, data: { balance: String(this.bal(body.url)), creditBalance: 100_000 } };
    }
    if (path !== '/api/query-tx') return { success: false, error: `unexpected read ${path}` };

    const bySend = this.locks.find((l) => l.sendTx === body.tx_hash);
    if (bySend) {
      // total (2) exceeds the records returned (1), as observed on Kermit
      return {
        success: true,
        data: { status: 'delivered', produced: { recordType: 'range', records: [{ recordType: 'txID', value: bySend.depositTx }], total: 2 } },
      };
    }
    const byDeposit = this.locks.find((l) => l.depositTx === body.tx_hash);
    if (byDeposit) {
      if (++this.depositQueries === 1) return { success: false, error: 'not found' }; // not routed yet
      return {
        success: true,
        data: {
          status: 'delivered',
          result: byDeposit.releaseTx ? { type: 'syntheticLockedDeposit', releaseTxID: byDeposit.releaseTx } : { type: 'syntheticLockedDeposit' },
          message: { transaction: { body: { type: 'syntheticLockedDeposit' } } },
        },
      };
    }
    return { success: true, data: { status: 'delivered' } };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const RUN_VARIABLES = { ADI_NAME: 'htlc-test' }; // what the Execute dialog hands the engine

function hashLockFlow(patch?: (flow: Flow) => void): Flow {
  const flow = structuredClone(GOLDEN_PATH_TEMPLATES.find((t) => t.id === 'hash-lock')!.flow);
  // keep the polling cadence out of the test's wall clock; the logic under test is unchanged
  for (const n of flow.nodes) if ('delayMs' in n.config) n.config.delayMs = 1;
  patch?.(flow);
  return flow;
}

const assertionState = () => ({ nodeStates: mockStore.execution.nodeStates, variables: {} }) as unknown as FlowExecutionState;

const sendCalls = () => chain.calls.filter((c) => c.path === '/api/send-tokens');

describe('hash-lock template through the real engine', () => {
  beforeEach(() => {
    chain = new FakeChain();
    mockStore.execution = { nodeStates: {} };
    vi.clearAllMocks();
  });

  it('runs all 17 nodes: locks, finds the deposit, releases, credits the receiver exactly the lock amount', async () => {
    const engine = new ExecutionEngine();
    await engine.executeFlow(hashLockFlow(), RUN_VARIABLES);

    expect(engine.getStatus()).toBe('completed');
    const states = mockStore.execution.nodeStates;
    expect(Object.keys(states)).toHaveLength(17);
    expect(Object.values(states).every((s) => s.status === 'success')).toBe(true);

    // amounts: 5 ACME to fund the sender (a base-unit number), LOCK_AMOUNT 1.00000000 -> 1e8, once
    const [fund, locked] = sendCalls();
    expect(fund.body).toMatchObject({
      principal: LTA,
      signer_url: LITE_ID,
      recipients: [{ url: `${ADI}/htlc-sender`, amount: '500000000' }],
    });
    expect(fund.body.hash).toBeUndefined();
    expect(locked.body).toMatchObject({
      principal: `${ADI}/htlc-sender`,
      signer_url: `${ADI}/book/1`,
      recipients: [{ url: `${ADI}/htlc-receiver`, amount: '100000000' }],
      hash_algorithm: 'sha256',
    });
    expect(locked.body.hash).toMatch(/^[0-9a-f]{64}$/);

    // the lock on the send is the hash of the preimage the release reveals
    const release = chain.calls.find((c) => c.body.tx_type === 'ReleaseLockedOperation')!;
    expect(createHash('sha256').update(Buffer.from(release.body.fields.preimage, 'hex')).digest('hex')).toBe(locked.body.hash);
    expect(release.body).toMatchObject({ principal: `${ADI}/htlc-receiver`, signer_url: `${ADI}/book/1`, wait: true });

    // the release targets the DEPOSIT (found among `produced`), not the send
    const lock = chain.locks[0];
    expect(release.body.fields.lockedTxID).toBe(lock.depositTx);
    expect(release.body.fields.lockedTxID).not.toBe(lock.sendTx);
    expect(chain.depositQueries).toBeGreaterThanOrEqual(2); // the first answer was NotFound

    // the node outputs other nodes reference
    expect(engine.getNodeOutputs('locked_send')!.txId).toBe(lock.sendTx);
    expect(engine.getNodeOutputs('wait_for_locked_deposit')!.lockedTxId).toBe(lock.depositTx);
    expect(lock.releaseTx).toBeDefined();

    // balances: receiver got exactly the lock amount, sender is down by exactly that
    expect(chain.balances.get(`${ADI}/htlc-receiver`)).toBe(100_000_000n);
    expect(chain.balances.get(`${ADI}/htlc-sender`)).toBe(400_000_000n);
  });

  it('the flow own assertions all pass after a good run', async () => {
    const flow = hashLockFlow();
    const engine = new ExecutionEngine();
    await engine.executeFlow(flow, RUN_VARIABLES);

    const results = await runAssertions(flow.assertions!, assertionState(), engine.getApi()!, flow.nodes);
    expect(results.map((r) => `${r.status}: ${r.message}`)).toEqual(results.map((r) => `pass: ${r.message}`));
    expect(results).toHaveLength(7);
  });

  it('without an ADI_NAME the flow does not start: nothing is sent to the network', async () => {
    const engine = new ExecutionEngine();
    await expect(engine.executeFlow(hashLockFlow())).rejects.toThrow(/ADI_NAME \(Required\)/);
    expect(chain.calls).toHaveLength(0);
    expect(mockStore.startExecution).not.toHaveBeenCalled();
  });

  it('hash160 works the same way: a 20-byte lock the node judges as RIPEMD160(SHA256(preimage))', async () => {
    const engine = new ExecutionEngine();
    await engine.executeFlow(
      hashLockFlow((f) => {
        f.nodes.find((n) => n.id === 'create_hash_lock')!.config.hashAlgorithm = 'hash160';
      }),
      RUN_VARIABLES
    );
    expect(engine.getStatus()).toBe('completed');
    expect(chain.locks[0].algorithm).toBe('hash160');
    expect(chain.locks[0].hash).toHaveLength(40);
    expect(chain.balances.get(`${ADI}/htlc-receiver`)).toBe(100_000_000n);
  });

  it('sha256d works the same way', async () => {
    const engine = new ExecutionEngine();
    await engine.executeFlow(
      hashLockFlow((f) => {
        f.nodes.find((n) => n.id === 'create_hash_lock')!.config.hashAlgorithm = 'sha256d';
      }),
      RUN_VARIABLES
    );
    expect(engine.getStatus()).toBe('completed');
    expect(chain.locks[0].algorithm).toBe('sha256d');
    expect(chain.balances.get(`${ADI}/htlc-receiver`)).toBe(100_000_000n);
  });

  it('a wrong preimage fails the flow at the release node with the node\'s error and credits nobody', async () => {
    const engine = new ExecutionEngine();
    const flow = hashLockFlow((f) => {
      f.nodes.find((n) => n.id === 'release_locked')!.config.preimage = 'ff'.repeat(32);
    });
    await expect(engine.executeFlow(flow, RUN_VARIABLES)).rejects.toThrow(/preimage does not match hash/);

    expect(engine.getStatus()).toBe('failed');
    const states = mockStore.execution.nodeStates;
    expect(states.release_locked.status).toBe('error');
    expect(states.release_locked.error?.message).toMatch(/preimage does not match hash/);
    expect(states.wait_for_receiver_balance).toBeUndefined();            // never reached
    expect(chain.balances.get(`${ADI}/htlc-receiver`) ?? 0n).toBe(0n);   // the lock stayed locked
    expect(chain.locks[0].releaseTx).toBeUndefined();

    // the same assertions must NOT pass: the release failed and the receiver is still empty
    const results = await runAssertions(flow.assertions!, assertionState(), engine.getApi()!, flow.nodes);
    const byStatus = (s: string) => results.filter((r) => r.status === s).map((r) => r.assertion.sourceStep ?? r.assertion.type);
    expect(byStatus('fail')).toEqual(expect.arrayContaining(['release_locked', 'balance.gte']));
  });

  it('a lock the node would refuse is stopped at GenerateHashLock, before the locked send', async () => {
    const engine = new ExecutionEngine();
    await expect(
      engine.executeFlow(
        hashLockFlow((f) => {
          f.nodes.find((n) => n.id === 'create_hash_lock')!.config.expirationMinutes = 5;
        }),
        RUN_VARIABLES
      )
    ).rejects.toThrow(/expirationMinutes must be/);

    expect(mockStore.execution.nodeStates.create_hash_lock.status).toBe('error');
    expect(sendCalls()).toHaveLength(1); // only the funding send went out
  });
});
