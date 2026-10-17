import { describe, it, expect } from 'vitest';
import type { FlowVariable } from '@accumulate-studio/types';
import {
  initialVariableValues,
  validateVariableValue,
  variableErrors,
  resolveRunVariables,
} from '../flow-variables';
import { GOLDEN_PATH_TEMPLATES } from '../../data/flow-templates';

const v = (over: Partial<FlowVariable> & { name: string }): FlowVariable => ({ type: 'string', ...over });

describe('initialVariableValues', () => {
  it('uses each default as text and leaves variables without one empty', () => {
    expect(
      initialVariableValues([
        v({ name: 'ADI_NAME', required: true }),
        v({ name: 'LOCK_AMOUNT', type: 'decimal', default: '1.00000000' }),
        v({ name: 'COUNT', type: 'int', default: 3 }),
      ])
    ).toEqual({ ADI_NAME: '', LOCK_AMOUNT: '1.00000000', COUNT: '3' });
  });
});

describe('validateVariableValue', () => {
  it('a required variable cannot be empty or blank; an optional one can', () => {
    expect(validateVariableValue(v({ name: 'A', required: true }), '')).toBe('Required');
    expect(validateVariableValue(v({ name: 'A', required: true }), '   ')).toBe('Required');
    expect(validateVariableValue(v({ name: 'A', required: true }), undefined)).toBe('Required');
    expect(validateVariableValue(v({ name: 'A' }), '')).toBeNull();
  });

  it.each([
    ['string', 'my-htlc-adi', true],
    ['string', 'Hello from Accumulate Studio', true], // free text, e.g. the data-writing template's content
    ['decimal', '1', true],
    ['decimal', '1.5', true],
    ['decimal', '0.00000001', true],
    ['decimal', '1.000000001', false], // 9 places: ACME has 8, it would be rounded silently
    ['decimal', '-1', false],
    ['decimal', '1,5', false],
    ['decimal', 'abc', false],
    ['int', '42', true],
    ['int', '4.2', false],
    ['url', 'acc://my-adi.acme/tokens', true],
    ['url', 'https://example.com', false],
    ['bool', 'true', true],
    ['bool', 'yes', false],
    ['bytes', 'deadBEEF', true],
    ['bytes', 'abc', false],
    ['object', '{"a":1}', true],
    ['object', '{a:1}', false],
  ] as const)('%s %j -> valid=%s', (type, value, valid) => {
    const result = validateVariableValue(v({ name: 'X', type, required: true }), value);
    expect(result === null).toBe(valid);
  });

  it('accepts surrounding whitespace (it is trimmed before use)', () => {
    expect(validateVariableValue(v({ name: 'X' }), '  my-adi  ')).toBeNull();
  });
});

describe('variableErrors', () => {
  it('names every variable that cannot run', () => {
    const vars = [v({ name: 'ADI_NAME', required: true }), v({ name: 'AMOUNT', type: 'decimal' })];
    expect(variableErrors(vars, { ADI_NAME: '', AMOUNT: 'x' })).toEqual({
      ADI_NAME: 'Required',
      AMOUNT: expect.stringContaining('decimal'),
    });
    expect(variableErrors(vars, { ADI_NAME: 'ok', AMOUNT: '2' })).toEqual({});
  });
});

describe('resolveRunVariables', () => {
  const vars = [
    v({ name: 'ADI_NAME', required: true }),
    v({ name: 'LOCK_AMOUNT', type: 'decimal', default: '1.00000000' }),
  ];

  it('overlays what was entered (trimmed) on the defaults and leaves the declarations alone', () => {
    const declared = structuredClone(vars);
    expect(resolveRunVariables(vars, { ADI_NAME: '  htlc-1 ' })).toEqual({
      ADI_NAME: 'htlc-1',
      LOCK_AMOUNT: '1.00000000',
    });
    expect(resolveRunVariables(vars, { ADI_NAME: 'a', LOCK_AMOUNT: '2.5' }).LOCK_AMOUNT).toBe('2.5');
    expect(vars).toEqual(declared); // the flow's own defaults are never rewritten
  });

  it('an emptied optional variable keeps its default instead of blanking it', () => {
    expect(resolveRunVariables(vars, { ADI_NAME: 'a', LOCK_AMOUNT: '' }).LOCK_AMOUNT).toBe('1.00000000');
    expect(resolveRunVariables(vars, { ADI_NAME: 'a', LOCK_AMOUNT: '   ' }).LOCK_AMOUNT).toBe('1.00000000');
  });

  it('an empty optional variable with no default stays an empty value', () => {
    const memo = [v({ name: 'MEMO' })];
    expect(resolveRunVariables(memo, { MEMO: '' })).toEqual({ MEMO: '' });
    expect(resolveRunVariables(memo)).toEqual({});
  });

  it('ignores names the flow does not declare', () => {
    expect(resolveRunVariables(vars, { ADI_NAME: 'a', NOPE: 'x' })).not.toHaveProperty('NOPE');
  });

  it('throws naming the missing required variable, before any value is used', () => {
    expect(() => resolveRunVariables(vars)).toThrow(/ADI_NAME \(Required\)/);
    expect(() => resolveRunVariables(vars, { ADI_NAME: '   ' })).toThrow(/ADI_NAME/);
  });

  it('throws on a malformed value and names every offender', () => {
    const two = [...vars, v({ name: 'COUNT', type: 'int', required: true })];
    expect(() => resolveRunVariables(two, { ADI_NAME: '', LOCK_AMOUNT: '1.5.5', COUNT: '1' })).toThrow(
      /ADI_NAME.*LOCK_AMOUNT/
    );
  });

  it('keeps an explicit empty default as a value (a template may rely on it)', () => {
    expect(resolveRunVariables([v({ name: 'MEMO', default: '' })])).toEqual({ MEMO: '' });
  });
});

describe('every shipped template', () => {
  it.each(GOLDEN_PATH_TEMPLATES.map((t) => [t.id, t.flow.variables] as const))(
    '%s: runs once its required variables are supplied, and not before',
    (_id, variables) => {
      const required = variables.filter((x) => x.required && x.default === undefined);
      const provided = Object.fromEntries(required.map((x) => [x.name, x.type === 'decimal' ? '1' : 'htlc-test']));

      // all defaults are valid under the new rules and the entries make the flow runnable
      expect(() => resolveRunVariables(variables, provided)).not.toThrow();
      if (required.length > 0) {
        expect(() => resolveRunVariables(variables)).toThrow(required[0].name);
      }
    }
  );

  it('the hash-lock flow needs exactly ADI_NAME, and LOCK_AMOUNT defaults to 1 ACME', () => {
    const flow = GOLDEN_PATH_TEMPLATES.find((t) => t.id === 'hash-lock')!.flow;
    expect(variableErrors(flow.variables, initialVariableValues(flow.variables))).toEqual({ ADI_NAME: 'Required' });
    expect(resolveRunVariables(flow.variables, { ADI_NAME: 'htlc-p6-1' })).toMatchObject({
      ADI_NAME: 'htlc-p6-1',
      LOCK_AMOUNT: '1.00000000',
    });
  });
});
