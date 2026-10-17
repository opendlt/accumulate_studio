/**
 * HTLC (hash-lock) code generation contract.
 *
 * The three HTLC blocks (GenerateHashLock, WaitForLockedDeposit, ReleaseLockedOperation) and the
 * hash-locked SendTokens variant must generate, for every language: no template leftovers, the
 * SDK calls proven by the reference programs, and a non-zero exit on failure. The compile and
 * mock-execution checks live in the *-validation suites; this file pins the generator's contract.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { Flow, FlowNode, SDKLanguage } from '@accumulate-studio/types';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';
import { generateAssertions } from '../src/assertions-generator';
import { PROJECT_GENERATORS } from '../src/project-scaffolds';

const LANGUAGES: SDKLanguage[] = ['python', 'javascript', 'rust', 'dart', 'csharp'];

const book = '{{create_identity.adiUrl}}/book/1';

function node(id: string, type: string, label: string, config: Record<string, unknown>, i: number): FlowNode {
  return { id, type, label, config, position: { x: 100, y: 100 + i * 160 } } as FlowNode;
}

/** The hash-lock flow shape from the runbook (D-1): one ADI, a sender and a receiver account. */
function htlcFlow(opts: { lock?: Record<string, unknown>; release?: Record<string, unknown> } = {}): Flow {
  const nodes = [
    node('generate_keys', 'GenerateKeys', 'Generate Keys', { algorithm: 'Ed25519' }, 0),
    node('faucet', 'Faucet', 'Request Tokens', { times: 3 }, 1),
    node('wait_for_balance', 'WaitForBalance', 'Wait for ACME', { minBalance: '15.00000000' }, 2),
    node('add_credits', 'AddCredits', 'Add Credits', { amount: '5.00000000' }, 3),
    node('wait_for_credits', 'WaitForCredits', 'Wait for Credits', { minCredits: 1000 }, 4),
    node('create_identity', 'CreateIdentity', 'Create ADI', { url: 'acc://{{ADI_NAME}}.acme' }, 5),
    node('add_adi_credits', 'AddCredits', 'Credit Key Page', { recipient: book, amount: '5.00000000' }, 6),
    node('wait_for_adi_credits', 'WaitForCredits', 'Wait for Key Page Credits', { account: book, minCredits: 1000 }, 7),
    node('create_sender_account', 'CreateTokenAccount', 'Create Sender Account', { url: 'acc://{{ADI_NAME}}.acme/htlc-sender', tokenUrl: 'acc://ACME', principal: '{{create_identity.adiUrl}}', signerUrl: book }, 8),
    node('create_receiver_account', 'CreateTokenAccount', 'Create Receiver Account', { url: 'acc://{{ADI_NAME}}.acme/htlc-receiver', tokenUrl: 'acc://ACME', principal: '{{create_identity.adiUrl}}', signerUrl: book }, 9),
    node('fund_sender', 'SendTokens', 'Fund Sender Account', { principal: '{{generate_keys.liteTokenAccount}}', signerUrl: '{{generate_keys.liteIdentity}}', to: '{{create_sender_account.tokenAccountUrl}}', amount: '500000000' }, 10),
    node('create_hash_lock', 'GenerateHashLock', 'Create Hash Lock', { hashAlgorithm: 'sha256', expirationMinutes: 30, ...opts.lock }, 11),
    node('locked_send', 'SendTokens', 'Locked Send', { principal: '{{create_sender_account.tokenAccountUrl}}', signerUrl: book, recipients: [{ url: '{{create_receiver_account.tokenAccountUrl}}', amount: '{{LOCK_AMOUNT}}' }], hashLockFrom: 'create_hash_lock' }, 12),
    node('wait_for_locked_deposit', 'WaitForLockedDeposit', 'Wait for Locked Deposit', { sendTxId: '{{locked_send.txId}}', maxAttempts: 60, delayMs: 2000 }, 13),
    node('release_locked', 'ReleaseLockedOperation', 'Release Locked Deposit', { principal: '{{create_receiver_account.tokenAccountUrl}}', signerUrl: book, lockedTxId: '{{wait_for_locked_deposit.lockedTxId}}', preimage: '{{create_hash_lock.preimage}}', ...opts.release }, 14),
  ];
  return {
    version: '1.0',
    name: 'Hash Lock Test',
    description: 'HTLC contract test',
    network: 'kermit',
    variables: [
      { name: 'ADI_NAME', type: 'string', description: 'ADI name', required: true },
      { name: 'LOCK_AMOUNT', type: 'decimal', description: 'Amount to lock', default: '1.00000000' },
    ],
    nodes,
    connections: nodes.slice(1).map((n, i) => ({
      id: `c${i}`, sourceNodeId: nodes[i].id, sourcePortId: 'output', targetNodeId: n.id, targetPortId: 'input',
    })),
    assertions: [],
  } as Flow;
}

function generate(flow: Flow, lang: SDKLanguage): string {
  return generateCodeFromManifest(flow, lang, 'sdk', loadManifest(lang));
}

/** Per-language SDK calls the reference programs proved against Kermit, and the failing exit. */
const CONTRACT: Record<string, { calls: string[]; exit: string }> = {
  python: {
    calls: [
      'from accumulate_client.tx.header import HashLockOptions',
      '.validate_for_submit()',
      'hash_lock=create_hash_lock_lock',
      'TxBody.release_locked_operation(wait_for_locked_deposit_locked_txid',
    ],
    exit: 'sys.exit(1)',
  },
  javascript: {
    calls: [
      'core.HashAlgorithm.SHA256',
      'helpers.validateHashLockForSubmit(',
      '{ hashLock: createHashLockLock }',
      'TxBody.releaseLockedOperation(waitForLockedDepositLockedTxId',
      'client.v3.call("query"',
    ],
    exit: 'process.exitCode = 1',
  },
  dart: {
    calls: [
      'HashAlgorithm.SHA256',
      '.validateForSubmit()',
      'hashLock: createHashLockLock',
      'TxBody.releaseLockedOperation(',
      'confirmDelivered(',
    ],
    exit: 'exit(1)',
  },
  rust: {
    calls: [
      'HashAlgorithm::Sha256',
      '.validate_for_submit(',
      'sign_submit_and_wait_with_options(',
      'hash_lock: Some(create_hash_lock_lock.clone())',
      'TxBody::release_locked_operation(&wait_for_locked_deposit_locked_txid',
    ],
    exit: 'std::process::exit(1)',
  },
  csharp: {
    calls: [
      'HashLockAlgorithm.SHA256',
      '.ValidateForSubmit()',
      'TxBody.HashLock(createHashLockHashAlgorithm, createHashLockHash',
      'headerOptions: createHashLockLock',
      'TxBody.ReleaseLockedOperation(waitForLockedDepositLockedTxId',
    ],
    exit: 'Environment.Exit(1)',
  },
};

/** What a HASH160 (RIPEMD160(SHA256(preimage)), 20 bytes) program must contain, per language. */
const HASH160: Record<string, string[]> = {
  python: ['def ripemd160(data)', '_ripemd160_pure', 'ripemd160(hashlib.sha256(', '"hash160"'],
  javascript: ['createHash("ripemd160")', 'core.HashAlgorithm.HASH160', ', 20, 20)', '"hash160"'],
  dart: ["import 'package:pointycastle/digests/ripemd160.dart';", 'RIPEMD160Digest().process', 'HashAlgorithm.HASH160', "'hash160'"],
  rust: ['use ripemd::Ripemd160;', 'Ripemd160::digest(Sha256::digest(', 'HashAlgorithm::Hash160', '"hash160"'],
  csharp: ['using Org.BouncyCastle.Crypto.Digests;', 'static byte[] Ripemd160Hash(byte[] data)', 'Ripemd160Hash(SHA256.HashData(', 'HashLockAlgorithm.HASH160', '"hash160"'],
};

describe('HTLC code generation', () => {
  for (const lang of LANGUAGES) {
    describe(lang, () => {
      const code = generate(htlcFlow(), lang);

      it('leaves no template residue', () => {
        expect(code).not.toMatch(/\{\{|\[object Object\]|\bundefined\b/);
        expect(code).not.toMatch(/TODO:\s*Implement/);
      });

      it('uses the SDK calls proven by the reference program', () => {
        for (const call of CONTRACT[lang].calls) expect(code).toContain(call);
      });

      it('exits non-zero when a step fails', () => {
        expect(code).toContain(CONTRACT[lang].exit);
      });

      it('releases the locked DEPOSIT, found after the send, not the send txid', () => {
        const send = code.indexOf('hash-locked');
        const wait = code.search(/syntheticLockedDeposit/);
        const release = code.indexOf(CONTRACT[lang].calls.find((c) => /elease/.test(c))!);
        expect(send).toBeGreaterThan(-1);
        expect(wait).toBeGreaterThan(send);
        expect(release).toBeGreaterThan(wait);
        expect(code).toContain('produced');
      });

      it('lets a sha256d lock hash twice', () => {
        const d = generate(htlcFlow({ lock: { hashAlgorithm: 'sha256d' } }), lang);
        expect(d).toMatch(/SHA256D|Sha256D|sha256d/);
        expect(d).not.toMatch(/\{\{|\[object Object\]|\bundefined\b/);
      });

      it('lets a hash160 lock hash RIPEMD-160 over SHA-256 and brings what it needs', () => {
        const h = generate(htlcFlow({ lock: { hashAlgorithm: 'hash160' } }), lang);
        expect(h).not.toMatch(/\{\{|\[object Object\]|undefined/);
        for (const needle of HASH160[lang]) expect(h, `${lang}: ${needle}`).toContain(needle);
        // a flow that does not use HASH160 carries none of it
        expect(code, `${lang}: sha256 flow`).not.toMatch(/ripemd|pointycastle|bouncycastle/i);
      });

      it('uses an explicit preimage and rejects bad ones', () => {
        const hex = 'ab'.repeat(32);
        expect(generate(htlcFlow({ lock: { preimage: hex } }), lang)).toContain(hex);
        expect(() => generate(htlcFlow({ lock: { preimage: 'zz' } }), lang)).toThrow(/preimage must be 1 to 256 bytes of hex/);
      });
    });
  }

  it('does not touch flows without a hash lock', () => {
    const plain: Flow = {
      version: '1.0', name: 'Plain', network: 'kermit', variables: [], assertions: [],
      nodes: [node('generate_keys', 'GenerateKeys', 'Generate Keys', {}, 0), node('faucet', 'Faucet', 'Faucet', {}, 1)],
      connections: [{ id: 'c0', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' }],
    } as Flow;
    for (const lang of LANGUAGES) {
      const code = generate(plain, lang);
      expect(code).not.toMatch(/HashLock|hash_lock|hashLock|syntheticLockedDeposit/);
    }
  });

  describe('fails loudly on a flow that cannot work', () => {
    it('rejects an unsupported algorithm', () => {
      expect(() => generate(htlcFlow({ lock: { hashAlgorithm: 'md5' } }), 'python')).toThrow(/unsupported hashAlgorithm.*sha256, sha256d or hash160/);
    });

    it('rejects an expiration the node would refuse', () => {
      expect(() => generate(htlcFlow({ lock: { expirationMinutes: 5 } }), 'python')).toThrow(/15 to 43200/);
      expect(() => generate(htlcFlow({ lock: { expirationMinutes: 50000 } }), 'python')).toThrow(/15 to 43200/);
    });

    it('rejects a hashLockFrom that is not a GenerateHashLock', () => {
      const flow = htlcFlow();
      (flow.nodes.find((n) => n.id === 'locked_send')!.config as Record<string, unknown>).hashLockFrom = 'faucet';
      expect(() => generate(flow, 'python')).toThrow(/must be the id of a GenerateHashLock/);
    });

    it('rejects a multi-recipient locked send', () => {
      const flow = htlcFlow();
      (flow.nodes.find((n) => n.id === 'locked_send')!.config as Record<string, unknown>).recipients = [
        { url: 'acc://a.acme/x', amount: '1' }, { url: 'acc://b.acme/y', amount: '1' },
      ];
      expect(() => generate(flow, 'python')).toThrow(/supports one recipient/);
    });

    it('rejects a release with nothing to release', () => {
      const flow: Flow = {
        version: '1.0', name: 'Lonely release', network: 'kermit', variables: [], assertions: [],
        nodes: [node('generate_keys', 'GenerateKeys', 'Generate Keys', {}, 0), node('release', 'ReleaseLockedOperation', 'Release', {}, 1)],
        connections: [{ id: 'c0', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'release', targetPortId: 'input' }],
      } as Flow;
      expect(() => generate(flow, 'python')).toThrow(/ReleaseLockedOperation .*set lockedTxId/);
    });
  });

  it('CLI mode emits no commands for a hash-lock flow', () => {
    const cli = generateCodeFromManifest(htlcFlow(), 'python', 'cli', null);
    expect(cli).toContain('SDK-only');
    expect(cli).not.toContain('accumulate tx create');
    expect(cli).toContain('exit 1');
  });

  it('adds the RIPEMD-160 dependency to HASH160 projects, and only those', () => {
    const file = (flow: Flow, lang: SDKLanguage, re: RegExp) => PROJECT_GENERATORS[lang](flow).find((f) => re.test(f.path))!.content;
    const h = htlcFlow({ lock: { hashAlgorithm: 'hash160' } });
    const plain = htlcFlow();
    expect(file(h, 'rust', /Cargo\.toml$/)).toContain('ripemd = "0.1"');
    expect(file(plain, 'rust', /Cargo\.toml$/)).not.toContain('ripemd');
    expect(file(h, 'dart', /pubspec\.yaml$/)).toContain('pointycastle: ^3.9.1');
    expect(file(plain, 'dart', /pubspec\.yaml$/)).not.toContain('pointycastle');
    expect(file(h, 'csharp', /\.csproj$/)).toContain('BouncyCastle.Cryptography');
    expect(file(plain, 'csharp', /\.csproj$/)).not.toContain('BouncyCastle');
    // Python and JavaScript need no extra package (hashlib / node:crypto, with a pure-Python fallback)
    expect(file(h, 'python', /pyproject\.toml$/)).not.toMatch(/ripemd|pycryptodome/i);
    expect(file(h, 'javascript', /package\.json$/)).not.toMatch(/ripemd/i);
  });

  const HAVE_PYTHON = spawnSync('python', ['--version']).status === 0;
  it('python: the generated RIPEMD-160 still works when hashlib has none (OpenSSL 3 builds)', () => {
    if (!HAVE_PYTHON) {
      expect(process.env.REQUIRE_TOOLCHAINS === '1', 'REQUIRE_TOOLCHAINS=1 but python is not on PATH').toBe(false);
      return;
    }
    const code = generate(htlcFlow({ lock: { hashAlgorithm: 'hash160' } }), 'python');
    const start = code.indexOf('# RIPEMD-160 (used by the HASH160 lock)');
    const end = code.indexOf('def main():');
    expect(start).toBeGreaterThan(-1);
    const script = [
      'import hashlib',
      '_orig = hashlib.new',
      'def _without_ripemd(name, data=b""):',
      '    if name == "ripemd160":',
      '        raise ValueError("unsupported hash type ripemd160")',
      '    return _orig(name, data)',
      'hashlib.new = _without_ripemd',
      code.slice(start, end),
      'print(ripemd160(b"abc").hex())',
      'print(ripemd160(bytes(range(200))).hex())',
    ].join('\n');
    const run = spawnSync('python', ['-c', script], { encoding: 'utf-8' });
    expect(run.status, run.stderr).toBe(0);
    const want = [Buffer.from('abc'), Buffer.from(Array.from({ length: 200 }, (_, i) => i))].map((b) => createHash('ripemd160').update(b).digest('hex'));
    expect(run.stdout.trim().split(/\r?\n/)).toEqual(want);
  });

  it('adds the random-bytes crate to Rust projects that use a lock, and only those', () => {
    const cargo = (flow: Flow) => PROJECT_GENERATORS.rust(flow).find((f) => f.path === 'Cargo.toml')!.content;
    expect(cargo(htlcFlow())).toContain('getrandom = "0.2"');
    const plain = htlcFlow();
    const gone = ['create_hash_lock', 'locked_send', 'wait_for_locked_deposit', 'release_locked'];
    plain.nodes = plain.nodes.filter((n) => !gone.includes(n.id));
    plain.connections = plain.connections.filter((c) => !gone.includes(c.sourceNodeId) && !gone.includes(c.targetNodeId));
    expect(cargo(plain)).not.toContain('getrandom');
  });

  it('credits the receiver on the release, not on the locked send', () => {
    const { assertions, expectedState } = generateAssertions(htlcFlow());
    const receiverDeltas = assertions.filter((a) => a.type === 'balance.delta' && String(a.account).includes('create_receiver_account'));
    // One delta in total (the locked amount, once), and its message says it happens on release.
    expect(receiverDeltas).toHaveLength(1);
    expect(receiverDeltas[0].message).toMatch(/when the lock is released/);
    expect(expectedState.balanceDeltas['{{create_receiver_account.tokenAccountUrl}}']).toBe('{{LOCK_AMOUNT}}');

    // Without the release the locked send alone credits nobody.
    const noRelease = htlcFlow();
    noRelease.nodes = noRelease.nodes.filter((n) => n.id !== 'release_locked');
    expect(generateAssertions(noRelease).assertions.filter((a) => a.type === 'balance.delta' && String(a.account).includes('create_receiver_account'))).toHaveLength(0);

    // Control: the same send without a lock does credit the recipient immediately.
    const unlocked = htlcFlow();
    delete (unlocked.nodes.find((n) => n.id === 'locked_send')!.config as Record<string, unknown>).hashLockFrom;
    const control = generateAssertions(unlocked).assertions.filter((a) => a.type === 'balance.delta' && String(a.account).includes('create_receiver_account'));
    expect(control).toHaveLength(1);
  });

  it('a release preimage that is neither hex nor a reference is refused instead of emitted as an identifier', () => {
    for (const bad of ['my-secret', 'Secret1', 'not hex at all']) {
      for (const lang of LANGUAGES) {
        expect(() => generate(htlcFlow({ release: { preimage: bad } }), lang), `${lang}: ${bad}`).toThrow(/preimage must be hex/);
      }
    }
  });

  it('a release preimage may still be a hex literal or a reference', () => {
    const hex = 'ab'.repeat(32);
    for (const lang of LANGUAGES) {
      expect(generate(htlcFlow({ release: { preimage: hex } }), lang), lang).toContain(hex);
      expect(() => generate(htlcFlow({ release: { preimage: '{{create_hash_lock.preimage}}' } }), lang), lang).not.toThrow();
    }
  });
});
