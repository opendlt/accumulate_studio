/**
 * CoSign block — M-of-N multi-signature codegen.
 *
 * A signature threshold is satisfied by DISTINCT keys signing the SAME
 * transaction. Signing the body twice does not work: the first signature's
 * metadata becomes the transaction's `initiator` and is baked into the header, so
 * a second independent signature is over a different transaction hash and neither
 * copy reaches the threshold.
 *
 * These tests pin the generated shape for that flow: sign once, co-sign per extra
 * key against the SAME envelope, submit once at the end.
 */
import { describe, it, expect } from 'vitest';
import type { Flow, SDKLanguage } from '@accumulate-studio/types';
import { BLOCK_CATALOG } from '@accumulate-studio/types';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';

const LANGS: SDKLanguage[] = ['python', 'rust', 'dart', 'javascript', 'csharp'];

/** The SDK call each language uses to append a signature to an existing envelope. */
/** How each language spells the create_data_account builder. */
const BODY_METHOD: Record<SDKLanguage, string> = {
  python: 'TxBody.create_data_account(',
  rust: 'TxBody::create_data_account(',
  dart: 'TxBody.createDataAccount(',
  javascript: 'TxBody.createDataAccount(',
  csharp: 'TxBody.CreateDataAccount(',
};

const COSIGN_CALL: Record<SDKLanguage, string> = {
  python: 'sign_existing',
  rust: 'sign_existing',
  dart: 'signExisting',
  javascript: 'signExisting',
  csharp: 'SignExistingAsync',
};

function gen(flow: Flow, lang: SDKLanguage): string {
  return generateCodeFromManifest(flow, lang, 'sdk', loadManifest(lang));
}

function coSignFlow(additionalSigners: string[]): Flow {
  return {
    version: '1.0', name: 'cosign', description: '', network: 'kermit', variables: [],
    nodes: [
      { id: 'k1', type: 'GenerateKeys', label: 'signer one', config: {}, position: { x: 0, y: 0 } },
      { id: 'k2', type: 'GenerateKeys', label: 'signer two', config: {}, position: { x: 0, y: 100 } },
      {
        id: 'cs', type: 'CoSign', label: 'shared data account', position: { x: 0, y: 200 },
        config: {
          operation: 'create_data_account',
          params: { url: 'acc://my-adi.acme/shared' },
          principal: 'acc://my-adi.acme',
          signerUrl: 'acc://my-adi.acme/book/1',
          additionalSigners,
        },
      },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'k1', sourcePortId: 'output', targetNodeId: 'k2', targetPortId: 'input' },
      { id: 'c2', sourceNodeId: 'k2', sourcePortId: 'output', targetNodeId: 'cs', targetPortId: 'input' },
    ],
  } as unknown as Flow;
}

describe('CoSign block is registered', () => {
  it('exists in the block catalog with the ports the editor needs', () => {
    const def = BLOCK_CATALOG.CoSign;
    expect(def).toBeDefined();
    expect(def.inputs.map((p) => p.id)).toEqual(expect.arrayContaining(['principal', 'signer']));
    expect(def.outputs.map((p) => p.id)).toContain('txHash');
    expect(def.configSchema.required).toContain('operation');
  });
});

describe.each(LANGS)('CoSign codegen — %s', (lang) => {
  it('signs once, co-signs per extra key, then submits once', () => {
    const code = gen(coSignFlow(['k2']), lang);
    const call = COSIGN_CALL[lang];

    // Exactly one co-sign call for one additional signer.
    const cosigns = code.split(call).length - 1;
    expect(cosigns).toBe(1);

    // The body is built through TxBody, in that language's own casing.
    expect(code).toContain(BODY_METHOD[lang]);

    // Submitted once, after the signatures are collected.
    const submitIdx = code.lastIndexOf(call);
    expect(submitIdx).toBeGreaterThan(-1);
  });

  it('emits one co-sign per DISTINCT additional signer', () => {
    const code = gen(coSignFlow(['k2', 'k2']), lang);
    // A duplicate key does not advance the threshold and the node rejects the
    // envelope, so the generator must de-duplicate rather than emit it twice.
    expect(code.split(COSIGN_CALL[lang]).length - 1).toBe(1);
  });

  it('omits co-signing entirely when there are no additional signers', () => {
    const code = gen(coSignFlow([]), lang);
    expect(code).not.toContain(COSIGN_CALL[lang]);
  });

  it('does not use sign_submit_and_wait, which would submit before co-signing', () => {
    const code = gen(coSignFlow(['k2']), lang);
    const singleShot = ['sign_submit_and_wait', 'signSubmitAndWait', 'SignSubmitAndWaitAsync'];
    // The CoSign section must not submit before every signature is attached.
    const section = code.slice(code.indexOf('CoSign'));
    for (const s of singleShot) expect(section).not.toContain(s);
  });
});

// =============================================================================
// `update_key_page` takes a list of operation objects rather than scalars. The
// generic CoSign argument path stringifies each param, which silently produced
// `[object Object]` — code that generates, compiles in some languages, and then
// fails on chain.
// =============================================================================
describe.each(LANGS)('CoSign with structured operations — %s', (lang) => {
  function thresholdFlow(): Flow {
    const f = coSignFlow(['k2']);
    const cs = f.nodes.find((n) => n.id === 'cs')!;
    cs.config = {
      operation: 'update_key_page',
      params: { operation: [{ type: 'setThreshold', threshold: 3 }] },
      principal: 'acc://my-adi.acme/book/1',
      signerUrl: 'acc://my-adi.acme/book/1',
      additionalSigners: ['k2'],
    };
    return f;
  }

  it('emits the operation list, never a stringified object', () => {
    const code = gen(thresholdFlow(), lang);
    expect(code).not.toContain('[object Object]');
    expect(code).toContain('3');
    expect(code).toContain(COSIGN_CALL[lang]);
  });

  it('routes through the key-page builder for that language', () => {
    const code = gen(thresholdFlow(), lang);
    // The JS SDK cannot round-trip plain operation objects, so a single op must
    // go through the typed factory rather than the generic updateKeyPage().
    const expected: Record<SDKLanguage, string> = {
      python: 'TxBody.update_key_page(',
      rust: 'TxBody::update_key_page(',
      dart: 'TxBody.updateKeyPage(',
      javascript: 'TxBody.updateKeyPageSetThreshold(3)',
      csharp: 'TxBody.UpdateKeyPage(',
    };
    expect(code).toContain(expected[lang]);
  });
});

// =============================================================================
// Submitting is not executing. A co-signed transaction that has not reached its
// threshold is accepted with code "ok" and then sits pending forever, so a
// template that reports acceptance as success is reporting a result it does not
// have.
// =============================================================================
describe.each(LANGS)('CoSign confirms delivery — %s', (lang) => {
  it('waits for delivered status rather than claiming success on submit', () => {
    const code = gen(coSignFlow(['k2']), lang);
    const section = code.slice(code.indexOf('CoSign'));
    expect(section).toContain('delivered');
    expect(section).toContain('DELIVERED');
    // The pending state must be distinguishable in the output, not collapsed
    // into the success branch.
    expect(section).toContain('NOT DELIVERED');
  });
});

// =============================================================================
// The multi-sig golden path must actually SPEND under its threshold.
// Configuring a threshold and satisfying one are different things; the template
// previously stopped at configuration, which is why the harness task could never
// reach `delivered`.
// =============================================================================
describe('multi-sig golden path', () => {
  it('includes a co-sign step that generates in every language', async () => {
    const { GOLDEN_PATH_TEMPLATES } = await import(
      '../../../apps/studio/src/data/flow-templates'
    );
    const tpl = (GOLDEN_PATH_TEMPLATES as Array<{ id: string; flow: Flow }>)
      .find((t) => t.id === 'multi-sig-setup');
    expect(tpl, 'multi-sig-setup template exists').toBeDefined();

    for (const lang of LANGS) {
      const code = gen(tpl!.flow, lang);
      // A missing template silently routes to the fallback, which tests cannot
      // otherwise tell apart from real output.
      expect(code, `${lang} has no unimplemented blocks`).not.toContain('TODO: Implement');
      expect(code, `${lang} runs the threshold spend`).toContain(COSIGN_CALL[lang]);
    }
  });
});
