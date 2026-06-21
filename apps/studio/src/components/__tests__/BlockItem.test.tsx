/**
 * BlockItem Component Tests (P2-3 Part C) — click-to-append must run the same
 * attachment + prerequisite path as drag-drop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockItem } from '../palette/BlockItem';

const mockAddNode = vi.fn(() => 'new-node-id');
const mockAddConnection = vi.fn();
const mockSetDragging = vi.fn();
const mockOpenModal = vi.fn();

// Controllable prerequisite-engine results, set per test.
let attachmentResult: any;
let recipeResult: any[];

vi.mock('../../services/prerequisite-engine', () => ({
  findBestAttachmentNode: () => attachmentResult,
  getPrerequisiteRecipe: () => recipeResult,
}));

vi.mock('../../store', () => ({
  useFlowStore: vi.fn((selector: (s: any) => any) =>
    selector({
      setDragging: mockSetDragging,
      addNode: mockAddNode,
      addConnection: mockAddConnection,
      flow: { nodes: [{ id: 'n1', position: { x: 0, y: 0 } }], connections: [] },
    })
  ),
  useUIStore: vi.fn((selector: (s: any) => any) => selector({ openModal: mockOpenModal })),
}));

// Note: lucide-react, '../ui', and '@accumulate-studio/types' are used REAL — the real
// BLOCK_CATALOG.AddCredits is configurable, which drives the block-config branch below.

const block: any = {
  type: 'AddCredits',
  icon: 'credit-card',
  color: '#3B82F6',
  name: 'Add Credits',
  description: 'Purchase credits with ACME',
};

describe('BlockItem click-to-append', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attachmentResult = { score: 0, attachToNodeId: null, remainingRecipe: [] };
    recipeResult = [];
  });

  it('opens prerequisite-assistant when the placed block has missing prerequisites', () => {
    attachmentResult = { score: 5, attachToNodeId: 'n1', remainingRecipe: ['Faucet', 'GenerateKeys'] };
    render(<BlockItem block={block} />);
    fireEvent.click(screen.getByText('Add Credits'));

    expect(mockAddNode).toHaveBeenCalledTimes(1);
    expect(mockOpenModal).toHaveBeenCalledWith(
      'prerequisite-assistant',
      expect.objectContaining({ targetBlockType: 'AddCredits', targetNodeId: 'new-node-id' })
    );
  });

  it('wires the node and opens block-config when prerequisites are satisfied', () => {
    attachmentResult = { score: 5, attachToNodeId: 'n1', remainingRecipe: [] };
    render(<BlockItem block={block} />);
    fireEvent.click(screen.getByText('Add Credits'));

    expect(mockAddNode).toHaveBeenCalledTimes(1);
    expect(mockAddConnection).toHaveBeenCalledWith('n1', 'output', 'new-node-id', 'input');
    expect(mockOpenModal).toHaveBeenCalledWith(
      'block-config',
      expect.objectContaining({ nodeId: 'new-node-id', blockType: 'AddCredits' })
    );
  });

  it('falls back to the recipe path when there is no attachment', () => {
    attachmentResult = { score: 0, attachToNodeId: null, remainingRecipe: [] };
    recipeResult = ['Faucet'];
    render(<BlockItem block={block} />);
    fireEvent.click(screen.getByText('Add Credits'));

    expect(mockAddNode).toHaveBeenCalledTimes(1);
    expect(mockOpenModal).toHaveBeenCalledWith(
      'prerequisite-assistant',
      expect.objectContaining({ attachToNodeId: null })
    );
  });

  it('adds the node exactly once per click', () => {
    attachmentResult = { score: 0, attachToNodeId: null, remainingRecipe: [] };
    recipeResult = [];
    render(<BlockItem block={block} />);
    fireEvent.click(screen.getByText('Add Credits'));
    expect(mockAddNode).toHaveBeenCalledTimes(1);
  });
});
