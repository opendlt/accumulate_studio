/**
 * P2-1 Code-generation correctness cluster — regression tests for Bugs 1, 3, 4, 5
 * and the engine-level compile-error surfacing of Bug 2.
 */
import { describe, it, expect } from 'vitest';
import type { Flow, FlowAssertion, SDKLanguage } from '@accumulate-studio/types';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';
import { createTemplateEngine } from '../src/template-engine';
import { validateAssertions } from '../src/assertions-generator';

const LANGS: SDKLanguage[] = ['python', 'rust', 'dart', 'javascript', 'csharp'];

function gen(flow: Flow, lang: SDKLanguage): string {
  return generateCodeFromManifest(flow, lang, 'sdk', loadManifest(lang));
}

// =============================================================================
// BUG 1 — Multi-recipient SendTokens must quote literals but NOT variable refs
// =============================================================================
describe('Bug 1 — multi-recipient SendTokens quoting', () => {
  function multiRecipientFlow(): Flow {
    return {
      version: '1.0', name: 'multi', description: '', network: 'devnet', variables: [],
      nodes: [
        { id: 'sender', type: 'GenerateKeys', label: 'sender', config: {}, position: { x: 0, y: 0 } },
        { id: 'recip', type: 'GenerateKeys', label: 'recip', config: {}, position: { x: 0, y: 100 } },
        { id: 'faucet', type: 'Faucet', label: 'faucet', config: { account: '{{sender.liteTokenAccount}}' }, position: { x: 0, y: 200 } },
        { id: 'send', type: 'SendTokens', label: 'send', config: {
            principal: '{{sender.liteTokenAccount}}',
            recipients: [
              { url: '{{recip.liteTokenAccount}}', amount: '5' },   // variable reference
              { url: 'acc://literal-dest.acme/ACME', amount: '10' }, // literal
            ],
          }, position: { x: 0, y: 300 } },
      ],
      connections: [
        { id: 'c1', sourceNodeId: 'sender', sourcePortId: 'output', targetNodeId: 'recip', targetPortId: 'input' },
        { id: 'c2', sourceNodeId: 'recip', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
        { id: 'c3', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'send', targetPortId: 'input' },
      ],
    };
  }

  // Per-language: the resolved ref expression and the quote char used for literals.
  const expected: Record<SDKLanguage, { refExpr: string; q: string }> = {
    python: { refExpr: 'str(recip_lta)', q: '"' },
    rust: { refExpr: '&recip_lta', q: '"' },
    dart: { refExpr: 'recipLta.toString()', q: "'" },
    javascript: { refExpr: 'recipLta', q: '"' },
    typescript: { refExpr: 'recipLta', q: '"' },
    csharp: { refExpr: 'recipLta.String()', q: '"' },
  };

  for (const lang of LANGS) {
    it(`${lang}: ref recipient unquoted, literal recipient quoted`, () => {
      const code = gen(multiRecipientFlow(), lang);
      const { refExpr, q } = expected[lang];

      expect(code).not.toContain('{{'); // everything resolved
      // The variable reference is emitted as a bare expression, never as a string literal.
      expect(code).toContain(refExpr);
      for (const quoted of [`"recip_lta"`, `'recip_lta'`, `"recipLta"`, `'recipLta'`]) {
        expect(code).not.toContain(quoted);
      }
      // The literal URL stays quoted.
      expect(code).toContain(`${q}acc://literal-dest.acme/ACME${q}`);
    });
  }
});

// =============================================================================
// BUG 3 — Comment block handles multiline text (one prefixed line per source line)
// =============================================================================
describe('Bug 3 — multiline Comment', () => {
  function commentFlow(): Flow {
    return {
      version: '1.0', name: 'cmt', description: '', network: 'devnet', variables: [],
      nodes: [
        { id: 'gen', type: 'GenerateKeys', label: 'gen', config: {}, position: { x: 0, y: 0 } },
        { id: 'note', type: 'Comment', label: 'note', config: { text: 'alpha\nbeta\ngamma' }, position: { x: 0, y: 100 } },
      ],
      connections: [
        { id: 'c1', sourceNodeId: 'gen', sourcePortId: 'output', targetNodeId: 'note', targetPortId: 'input' },
      ],
    };
  }

  // marker + indentation per language
  const commentLine: Record<SDKLanguage, (s: string) => string> = {
    python: (s) => `        # ${s}`,
    rust: (s) => `    // ${s}`,
    dart: (s) => `  // ${s}`,
    javascript: (s) => `    // ${s}`,
    typescript: (s) => `    // ${s}`,
    csharp: (s) => `        // ${s}`,
  };

  for (const lang of LANGS) {
    it(`${lang}: each comment line is individually prefixed`, () => {
      const code = gen(commentFlow(), lang);
      const lines = code.split('\n');
      for (const word of ['alpha', 'beta', 'gamma']) {
        expect(lines).toContain(commentLine[lang](word));
        // No unprefixed leak: the word never appears as the start of a line.
        expect(lines.some((l) => l === word || l.startsWith(`${word}`))).toBe(false);
      }
    });
  }
});

// =============================================================================
// BUG 4 — Hyphenated block IDs resolve in references
// =============================================================================
describe('Bug 4 — hyphenated block id references resolve', () => {
  function hyphenFlow(): Flow {
    return {
      version: '1.0', name: 'hyph', description: '', network: 'devnet', variables: [],
      nodes: [
        { id: 'gen', type: 'GenerateKeys', label: 'gen', config: {}, position: { x: 0, y: 0 } },
        { id: 'faucet', type: 'Faucet', label: 'faucet', config: { account: '{{gen.liteTokenAccount}}' }, position: { x: 0, y: 100 } },
        { id: 'add', type: 'AddCredits', label: 'add', config: { amount: '2000000' }, position: { x: 0, y: 200 } },
        { id: 'my-adi-1', type: 'CreateIdentity', label: 'my-adi-1', config: { url: 'acc://myadi.acme' }, position: { x: 0, y: 300 } },
        { id: 'data', type: 'CreateDataAccount', label: 'data', config: { url: '{{my-adi-1.adiUrl}}/data' }, position: { x: 0, y: 400 } },
      ],
      connections: [
        { id: 'c1', sourceNodeId: 'gen', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
        { id: 'c2', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'add', targetPortId: 'input' },
        { id: 'c3', sourceNodeId: 'add', sourcePortId: 'output', targetNodeId: 'my-adi-1', targetPortId: 'input' },
        { id: 'c4', sourceNodeId: 'my-adi-1', sourcePortId: 'output', targetNodeId: 'data', targetPortId: 'input' },
      ],
    };
  }

  for (const lang of LANGS) {
    it(`${lang}: {{my-adi-1.adiUrl}} resolves (no leaked handlebars)`, () => {
      const code = gen(hyphenFlow(), lang);
      expect(code).not.toContain('{{'); // hyphenated ref resolved, nothing leaked
      // The hyphen is normalized to underscore for the variable name.
      const varToken = lang === 'python' || lang === 'rust' ? 'my_adi_1' : 'myAdi_1';
      expect(code).toContain(varToken);
    });
  }
});

// =============================================================================
// BUG 5 — balance.delta validator must not report a pass it never checked
// =============================================================================
describe('Bug 5 — balance.delta does not falsely pass', () => {
  it('returns passed=false with an explicit error', () => {
    const assertion = { type: 'balance.delta', account: 'acc://test/ACME', delta: '10' } as unknown as FlowAssertion;
    const [result] = validateAssertions([assertion], {}, {});
    expect(result.passed).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// =============================================================================
// BUG 2 — template compile failures are surfaced on the engine
// =============================================================================
describe('Bug 2 — compile errors surfaced', () => {
  it('records a compile failure instead of swallowing it', () => {
    const engine = createTemplateEngine('python', { _preamble: 'ok', send_tokens: '{{#if' });
    expect(engine.compileErrors.length).toBeGreaterThan(0);
    expect(engine.compileErrors.some((e) => e.template === 'send_tokens')).toBe(true);
  });

  it('does not report errors for well-formed templates', () => {
    const engine = createTemplateEngine('python', { _preamble: 'ok', faucet: 'fund {{varName}}' });
    expect(engine.compileErrors.length).toBe(0);
  });
});
