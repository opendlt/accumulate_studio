/**
 * TemplateThumbnail Tests (P3-2) — verifies the mini-graph mounts the real
 * flow shape (one node per template node, plus a ReactFlow root). jsdom/happy-dom
 * do not compute real layout (ResizeObserver is stubbed), so we assert on
 * structure/presence, not pixel positions.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TemplateThumbnail } from '../modals/TemplateThumbnail';
import type { Flow } from '@accumulate-studio/types';

const threeNodeFlow: Flow = {
  version: '1.0',
  name: 'Test Flow',
  variables: [],
  nodes: [
    { id: 'a', type: 'GenerateKeys', config: {}, position: { x: 0, y: 0 } },
    { id: 'b', type: 'Faucet', config: {}, position: { x: 200, y: 0 } },
    { id: 'c', type: 'WaitForBalance', config: {}, position: { x: 400, y: 0 } },
  ],
  connections: [
    { id: 'e1', sourceNodeId: 'a', sourcePortId: 'output', targetNodeId: 'b', targetPortId: 'input' },
    { id: 'e2', sourceNodeId: 'b', sourcePortId: 'output', targetNodeId: 'c', targetPortId: 'input' },
  ],
};

describe('TemplateThumbnail', () => {
  it('mounts a ReactFlow root without throwing', () => {
    const { container } = render(<TemplateThumbnail flow={threeNodeFlow} />);
    expect(container.querySelector('.react-flow')).not.toBeNull();
  });

  it('renders one node per flow node', () => {
    const { container } = render(<TemplateThumbnail flow={threeNodeFlow} />);
    const renderedNodes = container.querySelectorAll('.react-flow__node');
    expect(renderedNodes.length).toBe(threeNodeFlow.nodes.length);
  });

  it('is purely decorative (pointer-events disabled)', () => {
    const { container } = render(<TemplateThumbnail flow={threeNodeFlow} />);
    const root = container.querySelector('.react-flow') as HTMLElement;
    expect(root.className).toContain('pointer-events-none');
  });
});
