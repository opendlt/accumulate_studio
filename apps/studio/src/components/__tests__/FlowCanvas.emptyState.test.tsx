import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

const mockOpenModal = vi.fn();

// Stable references: the selector must return the SAME state object across
// renders, otherwise `flow` changes every render and FlowCanvas's node-sync
// effect loops forever (OOMs the test worker). Mutate mockFlow.nodes in place
// before rendering to change the scenario.
const mockFlow: { nodes: unknown[]; connections: unknown[] } = { nodes: [], connections: [] };
const mockState = {
  flow: mockFlow,
  addNode: vi.fn(),
  updateNode: vi.fn(),
  removeNodes: vi.fn(),
  addConnection: vi.fn(),
  removeConnections: vi.fn(),
  selectNode: vi.fn(),
  clearSelection: vi.fn(),
  isDragging: false,
  draggedBlockType: null,
  setDragging: vi.fn(),
};

vi.mock('../../store', () => ({
  useFlowStore: vi.fn((selector: (s: any) => any) => selector(mockState)),
  useUIStore: vi.fn((selector: (s: any) => any) => selector({ openModal: mockOpenModal })),
}));

// Keep the test focused on the overlay, not the node renderer.
vi.mock('../flow-builder/BlockNode', () => ({
  BlockNode: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFlow.nodes = [];
  // React Flow requires ResizeObserver, which happy-dom does not provide.
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

import { FlowCanvas } from '../flow-builder/FlowCanvas';

const renderCanvas = () =>
  render(
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );

describe('FlowCanvas empty state', () => {
  it('shows the empty-state CTA when there are no nodes', () => {
    renderCanvas();
    expect(screen.getByText('Start building your flow')).toBeDefined();
    expect(screen.getByText('Browse Templates')).toBeDefined();
  });

  it('opens the template modal when Browse Templates is clicked', () => {
    renderCanvas();
    fireEvent.click(screen.getByText('Browse Templates'));
    expect(mockOpenModal).toHaveBeenCalledWith('template-select');
  });

  it('hides the empty state once a node exists', () => {
    mockFlow.nodes = [{ id: 'n1', type: 'CreateIdentity', position: { x: 0, y: 0 }, config: {} }];
    renderCanvas();
    expect(screen.queryByText('Start building your flow')).toBeNull();
  });
});
