import { describe, it, expect } from 'vitest';
import { sanitizeFlow } from '../flow-store';

describe('sanitizeFlow', () => {
  it('returns a valid flow unchanged in shape', () => {
    const good = {
      version: '1.0',
      name: 'My Flow',
      nodes: [
        { id: 'a', type: 'GenerateKeys', position: { x: 0, y: 0 }, config: {} },
      ],
      connections: [],
      variables: [],
      assertions: [],
    };
    const out = sanitizeFlow(good);
    expect(out.name).toBe('My Flow');
    expect(out.nodes).toHaveLength(1);
  });

  it('falls back to empty flow for null / non-object', () => {
    expect(sanitizeFlow(null).nodes).toEqual([]);
    expect(sanitizeFlow('garbage').nodes).toEqual([]);
    expect(sanitizeFlow(42).nodes).toEqual([]);
  });

  it('falls back when nodes is not an array', () => {
    expect(sanitizeFlow({ name: 'x', nodes: 'nope', connections: [] }).nodes).toEqual([]);
  });

  it('falls back when connections is not an array', () => {
    expect(sanitizeFlow({ name: 'x', nodes: [], connections: 'nope' }).nodes).toEqual([]);
  });

  it('falls back when name is missing', () => {
    const out = sanitizeFlow({ nodes: [], connections: [] });
    expect(out.name).toBe('Untitled Flow');
  });

  it('coerces missing variables/assertions to []', () => {
    const out = sanitizeFlow({ name: 'x', nodes: [], connections: [] });
    expect(out.variables).toEqual([]);
    expect(out.assertions).toEqual([]);
  });

  it('preserves a valid empty flow', () => {
    const out = sanitizeFlow({ name: 'Empty', nodes: [], connections: [], variables: [] });
    expect(out.name).toBe('Empty');
    expect(out.nodes).toEqual([]);
  });

  it('drops a flow with dangling connection references (validateFlow fails)', () => {
    const bad = {
      name: 'x',
      nodes: [{ id: 'a', type: 'GenerateKeys', position: { x: 0, y: 0 }, config: {} }],
      connections: [
        { id: 'c1', sourceNodeId: 'a', sourcePortId: 'output', targetNodeId: 'ZZZ', targetPortId: 'input' },
      ],
    };
    // discarded → empty
    expect(sanitizeFlow(bad).nodes).toEqual([]);
  });

  it('always stamps a 1.0 content version', () => {
    expect(sanitizeFlow({ name: 'x', nodes: [], connections: [] }).version).toBe('1.0');
  });
});
