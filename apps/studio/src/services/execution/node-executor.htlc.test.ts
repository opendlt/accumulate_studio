/**
 * Hash lock (HTLC) in the Studio executor: GenerateHashLock (client-side crypto), the locked
 * SendTokens, WaitForLockedDeposit and ReleaseLockedOperation, plus the SendTokens `principal` /
 * `signerUrl` regression the flow depends on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FlowNode } from '@accumulate-studio/types';
import { NodeExecutor, createHashLock, bytesToHex, hexToBytes } from './node-executor';
import type { ExecutionContext } from './index';
import type { AccumulateAPI } from '../network/api';
import { GOLDEN_PATH_TEMPLATES } from '../../data/flow-templates';

const PREIMAGE = bytesToHex(Uint8Array.from({ length: 32 }, (_, i) => i));
const sha256 = (hex: string) => createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');

const keypair = {
  publicKey: 'pk',
  publicKeyHash: 'pkh',
  liteIdentity: 'acc://lite-id',
  liteTokenAccount: 'acc://lite-id/ACME',
};

const SENDER = 'acc://htlc-p6.acme/htlc-sender';
const RECEIVER = 'acc://htlc-p6.acme/htlc-receiver';
const BOOK = 'acc://htlc-p6.acme/book/1';
const SEND_TX = `acc://${'cd'.repeat(32)}@${SENDER}`;
const LOCKED_TX = `acc://${'ab'.repeat(32)}@${RECEIVER}`;

/** The request-body fields these tests read back (each call carries a subset). */
interface ProxyBody {
  principal: string;
  signer_url: string;
  recipients: Array<{ url: string; amount: string }>;
  hash?: string;
  hash_algorithm?: string;
  expiration?: number;
}

function node(id: string, type: string, config: Record<string, unknown>): FlowNode {
  return { id, type, label: id, config, position: { x: 0, y: 0 } } as unknown as FlowNode;
}

/** The real node from the shipped hash-lock template, so the test cannot drift from the flow. */
function templateNode(id: string): FlowNode {
  const flow = GOLDEN_PATH_TEMPLATES.find((t) => t.id === 'hash-lock')!.flow;
  return flow.nodes.find((n) => n.id === id)!;
}

describe('createHashLock (browser crypto, no Buffer)', () => {
  it('sha256: hash is SHA-256 of the raw preimage bytes', async () => {
    const lock = await createHashLock({ hashAlgorithm: 'sha256', preimage: PREIMAGE });
    expect(lock.preimage).toBe(PREIMAGE);
    expect(lock.hash).toBe(sha256(PREIMAGE));
    expect(lock.hash).toHaveLength(64);
    expect(lock.hashAlgorithm).toBe('sha256');
  });

  it('sha256d: hash is SHA-256 of the SHA-256 digest', async () => {
    const lock = await createHashLock({ hashAlgorithm: 'sha256d', preimage: PREIMAGE });
    expect(lock.hash).toBe(sha256(sha256(PREIMAGE)));
    expect(lock.hash).not.toBe(sha256(PREIMAGE));
  });

  it('defaults to sha256, 30 minutes and a random 32-byte preimage', async () => {
    const a = await createHashLock({}, 1_700_000_123_456);
    const b = await createHashLock({}, 1_700_000_123_456);
    expect(a.hashAlgorithm).toBe('sha256');
    expect(a.preimage).toMatch(/^[0-9a-f]{64}$/);
    expect(a.preimage).not.toBe(b.preimage);
    expect(a.hash).toBe(sha256(a.preimage));
  });

  it('expiration is whole unix SECONDS, minutes ahead of now', async () => {
    const lock = await createHashLock({ expirationMinutes: 45 }, 1_700_000_123_456);
    expect(lock.expiration).toBe(1_700_000_123 + 45 * 60);
    expect(Number.isInteger(lock.expiration)).toBe(true);
    expect(lock.expirationIso).toBe(new Date(lock.expiration * 1000).toISOString());
  });

  it('treats an empty expirationMinutes as the default 30, like the code generator', async () => {
    for (const empty of ['', '   ']) {
      const lock = await createHashLock({ expirationMinutes: empty }, 1_700_000_123_456);
      expect(lock.expiration).toBe(1_700_000_123 + 30 * 60);
    }
  });

  it('accepts expirationMinutes arriving as a string from the config modal', async () => {
    const lock = await createHashLock({ expirationMinutes: '20' }, 1_700_000_000_000);
    expect(lock.expiration).toBe(1_700_000_000 + 20 * 60);
  });

  it.each([
    [{ hashAlgorithm: 'md5' }, /unsupported hash algorithm/],
    [{ hashAlgorithm: 'hash160' }, /unsupported hash algorithm/],
    [{ expirationMinutes: 14 }, /between 15 and 43200/],
    [{ expirationMinutes: 43201 }, /between 15 and 43200/],
    [{ expirationMinutes: 15.5 }, /whole number/],
    [{ expirationMinutes: 'soon' }, /whole number/],
    [{ preimage: 'zz' }, /Invalid hex/],
    [{ preimage: 'abc' }, /Invalid hex/],
    [{ preimage: '00'.repeat(257) }, /1\.\.256 bytes/],
  ])('rejects %j', async (opts, message) => {
    await expect(createHashLock(opts)).rejects.toThrow(message);
  });

  it('hex helpers round-trip and refuse malformed input', () => {
    expect(bytesToHex(hexToBytes('00ff10'))).toBe('00ff10');
    expect(() => hexToBytes('0g')).toThrow();
    expect(() => hexToBytes('abc')).toThrow();
  });

  it('the executor never calls Buffer.from (it crashes in the browser)', () => {
    const src = readFileSync(resolve(__dirname, 'node-executor.ts'), 'utf8');
    expect(src).not.toMatch(/Buffer\.from\(|new Buffer\(/);
  });
});

describe('NodeExecutor: HTLC blocks', () => {
  let api: { callProxy: ReturnType<typeof vi.fn>; callProxyRead: ReturnType<typeof vi.fn> };
  let executor: NodeExecutor;
  const context = { abortController: new AbortController() } as unknown as ExecutionContext;

  beforeEach(() => {
    api = { callProxy: vi.fn(), callProxyRead: vi.fn() };
    executor = new NodeExecutor(api as unknown as AccumulateAPI, 'sess');
  });

  const lastCall = () => api.callProxy.mock.calls.at(-1)! as [string, ProxyBody];

  describe('CreateTokenAccount (regression)', () => {
    it('emits its OWN tokenAccountUrl even when an upstream account already set one', async () => {
      api.callProxy.mockResolvedValue({ success: true, tx_hash: 'acc://t@x' });
      const out = await executor.execute(
        node('create_receiver_account', 'CreateTokenAccount', { url: RECEIVER, tokenUrl: 'acc://ACME' }),
        { keypair, adiUrl: 'acc://htlc-p6.acme', keyPageUrl: BOOK, tokenAccountUrl: SENDER },
        context
      );
      expect(out.tokenAccountUrl).toBe(RECEIVER); // used to come back as SENDER, so the flow paid itself
    });
  });

  describe('GenerateHashLock', () => {
    it('outputs the lock and keeps the signer flowing downstream', async () => {
      const out = await executor.execute(
        node('create_hash_lock', 'GenerateHashLock', { hashAlgorithm: 'sha256', expirationMinutes: 30 }),
        { keypair, principal: SENDER },
        context
      );
      expect(out.hash).toBe(sha256(out.preimage as string));
      expect(out.hashAlgorithm).toBe('sha256');
      expect(Number.isInteger(out.expiration)).toBe(true);
      expect(typeof out.expirationIso).toBe('string');
      expect(out.keypair).toBe(keypair);
      expect(out.principal).toBe(SENDER);
    });

    it('uses a preimage from a reference', async () => {
      const out = await executor.execute(
        node('lock', 'GenerateHashLock', { preimage: '{{secret.value}}' }),
        { keypair, 'secret.value': PREIMAGE },
        context
      );
      expect(out.preimage).toBe(PREIMAGE);
      expect(out.hash).toBe(sha256(PREIMAGE));
    });
  });

  describe('SendTokens: principal / signerUrl (regression)', () => {
    beforeEach(() => api.callProxy.mockResolvedValue({ success: true, tx_hash: SEND_TX }));

    it('sends FROM config.principal and signs with config.signerUrl', async () => {
      await executor.execute(
        node('s', 'SendTokens', { principal: SENDER, signerUrl: BOOK, to: RECEIVER, amount: '2' }),
        { keypair },
        context
      );
      const [path, body] = lastCall();
      expect(path).toBe('/api/send-tokens');
      expect(body.principal).toBe(SENDER);          // used to fall back to the lite account
      expect(body.signer_url).toBe(BOOK);
      expect(body.recipients).toEqual([{ url: RECEIVER, amount: '200000000' }]);
      expect(body.hash).toBeUndefined();
    });

    it('config.from still wins as before, and the lite account is the default source', async () => {
      await executor.execute(node('s', 'SendTokens', { from: SENDER, to: RECEIVER, amount: '1' }), { keypair }, context);
      expect(lastCall()[1].principal).toBe(SENDER);
      await executor.execute(node('s', 'SendTokens', { to: RECEIVER, amount: '1' }), { keypair }, context);
      expect(lastCall()[1].principal).toBe(keypair.liteTokenAccount);
      expect(lastCall()[1].signer_url).toBe(keypair.liteTokenAccount);
    });

    it('refuses a signerUrl that did not resolve instead of submitting it', async () => {
      await expect(
        executor.execute(
          node('s', 'SendTokens', { principal: SENDER, signerUrl: '{{nobody.here}}', to: RECEIVER, amount: '1' }),
          { keypair },
          context
        )
      ).rejects.toThrow(/did not resolve/);
      expect(api.callProxy).not.toHaveBeenCalled();
    });

    it('exposes txId (the real id) beside txHash', async () => {
      const out = await executor.execute(node('s', 'SendTokens', { to: RECEIVER, amount: '1' }), { keypair }, context);
      expect(out.txId).toBe(SEND_TX);
      expect(out.txHash).toBe(SEND_TX);
    });
  });

  describe('the hash-lock flow\'s own sends (shipped template config)', () => {
    const upstream = {
      keypair,
      'generate_keys.liteTokenAccount': keypair.liteTokenAccount,
      'generate_keys.liteIdentity': keypair.liteIdentity,
      'create_sender_account.tokenAccountUrl': SENDER,
      'create_receiver_account.tokenAccountUrl': RECEIVER,
      'create_identity.adiUrl': 'acc://htlc-p6.acme',
      'var:LOCK_AMOUNT': '1.00000000',
      'create_hash_lock.hash': sha256(PREIMAGE),
      'create_hash_lock.hashAlgorithm': 'sha256',
      'create_hash_lock.expiration': 1_800_000_000,
      'create_hash_lock.preimage': PREIMAGE,
    };
    beforeEach(() => api.callProxy.mockResolvedValue({ success: true, tx_hash: SEND_TX }));

    it('fund_sender: 5 ACME from the lite account, signed by the lite identity', async () => {
      await executor.execute(templateNode('fund_sender'), upstream, context);
      const [, body] = lastCall();
      expect(body.principal).toBe(keypair.liteTokenAccount);
      expect(body.signer_url).toBe(keypair.liteIdentity);
      // 500000000 base units, NOT 5e16: a number in the flow is already base units
      expect(body.recipients).toEqual([{ url: SENDER, amount: '500000000' }]);
      expect(body.hash).toBeUndefined();
    });

    it('locked_send: LOCK_AMOUNT 1.00000000 becomes 100000000 once, with the lock on the request', async () => {
      const out = await executor.execute(templateNode('locked_send'), upstream, context);
      const [path, body] = lastCall();
      expect(path).toBe('/api/send-tokens');
      expect(body.principal).toBe(SENDER);
      expect(body.signer_url).toBe(BOOK);
      expect(body.recipients).toEqual([{ url: RECEIVER, amount: '100000000' }]);
      expect(body.hash_algorithm).toBe('sha256');
      expect(body.hash).toBe(sha256(PREIMAGE));
      expect(body.expiration).toBe(1_800_000_000);
      expect(out.txId).toBe(SEND_TX);
      expect(out.hashLocked).toBe(true);
    });

    it('a locked send with no GenerateHashLock output upstream fails before submitting', async () => {
      const { 'create_hash_lock.hash': _h, ...noHash } = upstream;
      await expect(executor.execute(templateNode('locked_send'), noHash, context)).rejects.toThrow(/hashLockFrom "create_hash_lock"/);
      expect(api.callProxy).not.toHaveBeenCalled();
    });

    it('a locked send takes exactly one recipient', async () => {
      const two = node('locked', 'SendTokens', {
        principal: SENDER,
        recipients: [
          { url: RECEIVER, amount: '1' },
          { url: 'acc://other.acme/x', amount: '1' },
        ],
        hashLockFrom: 'create_hash_lock',
      });
      await expect(executor.execute(two, upstream, context)).rejects.toThrow(/exactly one recipient/);
    });

    it('a proxy rejection of the lock surfaces as the node error', async () => {
      api.callProxy.mockResolvedValue({ success: false, error: 'expiration must be at least 10 minutes away' });
      await expect(executor.execute(templateNode('locked_send'), upstream, context)).rejects.toThrow(/at least 10 minutes/);
    });
  });

  describe('WaitForLockedDeposit', () => {
    const wait = (config: Record<string, unknown>, inputs: Record<string, unknown> = { keypair }) =>
      executor.execute(node('w', 'WaitForLockedDeposit', { delayMs: 1, ...config }), inputs, context);

    const sendRecord = (records: unknown[], total = records.length) => ({
      success: true,
      data: { status: 'delivered', produced: { recordType: 'range', records, total } },
    });
    const deposit = (type: string, status: string) => ({
      success: true,
      data: { status, message: { transaction: { body: { type } } } },
    });

    it('scans produced.records (not total) and returns the delivered locked deposit', async () => {
      api.callProxyRead.mockImplementation(async (_p: string, b: { tx_hash: string }) => {
        if (b.tx_hash === SEND_TX) {
          // total says 2, records holds 1: an unrelated record first, the deposit second
          return sendRecord(
            [
              { recordType: 'txID', value: `acc://${'11'.repeat(32)}@acc://x` },
              { recordType: 'txID', value: LOCKED_TX },
            ],
            5
          );
        }
        return b.tx_hash === LOCKED_TX ? deposit('syntheticLockedDeposit', 'delivered') : deposit('syntheticDepositTokens', 'delivered');
      });
      const out = await wait({ sendTxId: SEND_TX });
      expect(out.lockedTxId).toBe(LOCKED_TX);
      expect(out.sendTxId).toBe(SEND_TX);
    });

    it('treats NotFound and a pending deposit as not ready, then succeeds', async () => {
      let polls = 0;
      api.callProxyRead.mockImplementation(async (_p: string, b: { tx_hash: string }) => {
        if (b.tx_hash === SEND_TX) return sendRecord([{ value: LOCKED_TX }]);
        polls++;
        if (polls === 1) return { success: false, error: 'not found' };
        if (polls === 2) return deposit('syntheticLockedDeposit', 'pending');
        return deposit('syntheticLockedDeposit', 'delivered');
      });
      const out = await wait({ sendTxId: SEND_TX, maxAttempts: 5 });
      expect(out.lockedTxId).toBe(LOCKED_TX);
      expect(out.attempts).toBe(3);
    });

    it('is not ready while the send has no produced records yet', async () => {
      let sends = 0;
      api.callProxyRead.mockImplementation(async (_p: string, b: { tx_hash: string }) => {
        if (b.tx_hash === SEND_TX) return ++sends < 3 ? { success: true, data: { status: 'pending' } } : sendRecord([{ value: LOCKED_TX }]);
        return deposit('syntheticLockedDeposit', 'delivered');
      });
      expect((await wait({ sendTxId: SEND_TX, maxAttempts: 5 })).lockedTxId).toBe(LOCKED_TX);
    });

    it('falls back to the upstream send\'s txId when the reference did not resolve', async () => {
      api.callProxyRead.mockImplementation(async (_p: string, b: { tx_hash: string }) =>
        b.tx_hash === SEND_TX ? sendRecord([{ value: LOCKED_TX }]) : deposit('syntheticLockedDeposit', 'delivered')
      );
      const out = await wait({ sendTxId: '{{locked_send.txId}}' }, { keypair, txId: SEND_TX });
      expect(out.sendTxId).toBe(SEND_TX);
    });

    it('fails with a clear error when no locked deposit ever appears', async () => {
      api.callProxyRead.mockResolvedValue(sendRecord([{ value: `acc://${'11'.repeat(32)}@acc://x` }]));
      await expect(wait({ sendTxId: SEND_TX, maxAttempts: 2 })).rejects.toThrow(/No delivered locked deposit found.*after 2 attempts/);
    });

    it('requires a send txid', async () => {
      await expect(wait({ sendTxId: '{{locked_send.txId}}' })).rejects.toThrow(/requires the txid/);
    });
  });

  describe('ReleaseLockedOperation', () => {
    const releaseInputs = {
      keypair,
      'create_receiver_account.tokenAccountUrl': RECEIVER,
      'create_identity.adiUrl': 'acc://htlc-p6.acme',
      'wait_for_locked_deposit.lockedTxId': LOCKED_TX,
      'create_hash_lock.preimage': PREIMAGE,
    };

    it('submits the release from the RECEIVER, signed by the ADI key page, with the hex preimage', async () => {
      api.callProxy.mockResolvedValue({ success: true, tx_hash: 'acc://rel@x' });
      const out = await executor.execute(templateNode('release_locked'), releaseInputs, context);
      const [path, body] = lastCall();
      expect(path).toBe('/api/sign-and-submit');
      expect(body).toMatchObject({
        tx_type: 'ReleaseLockedOperation',
        principal: RECEIVER,
        signer_url: BOOK,
        fields: { lockedTxID: LOCKED_TX, preimage: PREIMAGE },
        wait: true,
      });
      expect(out.txId).toBe('acc://rel@x');
      expect(out.lockedTxId).toBe(LOCKED_TX);
    });

    it('signs a release into a LITE account with the lite identity, not an upstream ADI key page', async () => {
      api.callProxy.mockResolvedValue({ success: true, tx_hash: 'acc://rel@x' });
      const lite = `acc://${'ab'.repeat(20)}/ACME`;
      await executor.execute(
        node('r', 'ReleaseLockedOperation', { principal: lite, lockedTxId: LOCKED_TX, preimage: PREIMAGE }),
        { keypair, keyPageUrl: BOOK },
        context
      );
      expect(lastCall()[1]).toMatchObject({ principal: lite, signer_url: keypair.liteTokenAccount });
    });

    it('signs a release into an ADI account with the upstream key page when no signerUrl is set', async () => {
      api.callProxy.mockResolvedValue({ success: true, tx_hash: 'acc://rel@x' });
      await executor.execute(
        node('r', 'ReleaseLockedOperation', { principal: RECEIVER, lockedTxId: LOCKED_TX, preimage: PREIMAGE }),
        { keypair, keyPageUrl: BOOK },
        context
      );
      expect(lastCall()[1]).toMatchObject({ principal: RECEIVER, signer_url: BOOK });
    });

    it('a release that fails at execute (wrong preimage) fails the node with the node\'s message', async () => {
      api.callProxy.mockResolvedValue({ success: false, error: 'Transaction failed: preimage does not match hash (unauthenticated, code 401)' });
      await expect(executor.execute(templateNode('release_locked'), releaseInputs, context)).rejects.toThrow(
        /preimage does not match hash/
      );
    });

    it('defaults to the upstream lockedTxId, preimage and the locked send\'s recipient', async () => {
      api.callProxy.mockResolvedValue({ success: true, tx_hash: 'acc://rel@x' });
      await executor.execute(
        node('r', 'ReleaseLockedOperation', { signerUrl: BOOK }),
        { keypair, lockedTxId: LOCKED_TX, preimage: PREIMAGE, recipients: [{ url: RECEIVER, amount: '1' }] },
        context
      );
      expect(lastCall()[1]).toMatchObject({ principal: RECEIVER, fields: { lockedTxID: LOCKED_TX, preimage: PREIMAGE } });
    });

    it.each([
      ['an unresolved reference', { lockedTxId: '{{nobody.id}}' }, /requires lockedTxId|did not resolve/],
      ['a non-hex preimage', { preimage: 'not hex' }, /Invalid hex/],
      ['an odd-length preimage', { preimage: 'abc' }, /Invalid hex/],
      ['an oversized preimage', { preimage: '00'.repeat(257) }, /1\.\.256 bytes/],
    ])('refuses %s before spending a transaction', async (_label, override, message) => {
      const n = node('r', 'ReleaseLockedOperation', {
        principal: RECEIVER,
        signerUrl: BOOK,
        lockedTxId: LOCKED_TX,
        preimage: PREIMAGE,
        ...override,
      });
      await expect(executor.execute(n, { keypair }, context)).rejects.toThrow(message);
      expect(api.callProxy).not.toHaveBeenCalled();
    });
  });
});
