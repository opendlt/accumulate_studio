/**
 * ExecuteConfirmModal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ExecuteConfirmModal } from '../modals/ExecuteConfirmModal';

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let mockFlowState = {
  flow: {
    nodes: [
      { id: '1', type: 'GenerateKeys', position: { x: 0, y: 0 }, config: {} },
      { id: '2', type: 'Faucet', position: { x: 0, y: 100 }, config: {} },
      { id: '3', type: 'CreateIdentity', position: { x: 0, y: 200 }, config: {} },
    ],
    connections: [],
    variables: [],
    assertions: [],
    name: 'Test Flow',
    version: '1.0',
  },
};

let mockSelectedNetwork = 'kermit';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../store', () => ({
  useFlowStore: vi.fn((selector: (s: any) => any) => selector(mockFlowState)),
  useUIStore: vi.fn((selector: (s: any) => any) => {
    const state = { selectedNetwork: mockSelectedNetwork };
    return selector(state);
  }),
}));

vi.mock('@accumulate-studio/types', () => ({
  NETWORKS: {
    kermit: { id: 'kermit', name: 'Kermit (TestNet)', description: 'Test', faucetAvailable: true },
    mainnet: { id: 'mainnet', name: 'MainNet', description: 'Production', faucetAvailable: false },
    testnet: { id: 'testnet', name: 'TestNet', description: 'Test', faucetAvailable: true },
    local: { id: 'local', name: 'Local DevNet', description: 'Local', readOnly: true },
  },
  BLOCK_CATALOG: {
    GenerateKeys: { name: 'Generate Keys', category: 'utility' },
    Faucet: { name: 'Faucet', category: 'utility' },
    CreateIdentity: { name: 'Create Identity', category: 'identity' },
  },
  isTransactionBlock: (type: string) =>
    ['CreateIdentity', 'SendTokens', 'AddCredits', 'CreateTokenAccount'].includes(type),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = () => ({
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExecuteConfirmModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset to default state before each test
    mockFlowState = {
      flow: {
        nodes: [
          { id: '1', type: 'GenerateKeys', position: { x: 0, y: 0 }, config: {} },
          { id: '2', type: 'Faucet', position: { x: 0, y: 100 }, config: {} },
          { id: '3', type: 'CreateIdentity', position: { x: 0, y: 200 }, config: {} },
        ],
        connections: [],
        variables: [],
        assertions: [],
        name: 'Test Flow',
        version: '1.0',
      },
    };
    mockSelectedNetwork = 'kermit';
  });

  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------

  it('renders title, description, and summary when open with blocks', () => {
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    // Title is rendered in a heading element
    expect(screen.getByRole('heading', { name: 'Execute Flow' })).toBeDefined();
    expect(screen.getByText('Review and confirm execution')).toBeDefined();
    expect(screen.getByText('Total Blocks')).toBeDefined();
    expect(screen.getByText('Transactions')).toBeDefined();
    expect(screen.getByText('Estimated Credits')).toBeDefined();
  });

  it('renders nothing visible when isOpen is false', () => {
    const props = defaultProps();
    const { container } = render(<ExecuteConfirmModal {...props} isOpen={false} />);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Network info & faucet badge
  // -------------------------------------------------------------------------

  it('shows current network name and faucet badge for kermit', () => {
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    expect(screen.getByText('Kermit (TestNet)')).toBeDefined();
    expect(screen.getByText('Faucet')).toBeDefined();
  });

  it('does not show faucet badge for mainnet', () => {
    mockSelectedNetwork = 'mainnet';
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    expect(screen.getByText('MainNet')).toBeDefined();
    expect(screen.queryByText('Faucet')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // MainNet warning
  // -------------------------------------------------------------------------

  it('shows mainnet warning panel when network is mainnet', () => {
    mockSelectedNetwork = 'mainnet';
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    expect(screen.getByText('MainNet Warning')).toBeDefined();
    expect(
      screen.getByText(
        'You are about to execute on the MainNet. This will use real ACME tokens and credits. Transactions cannot be reversed.'
      )
    ).toBeDefined();
  });

  it('does not show mainnet warning on testnet', () => {
    mockSelectedNetwork = 'testnet';
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    expect(screen.queryByText('MainNet Warning')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Empty flow warning
  // -------------------------------------------------------------------------

  it('shows empty flow warning and disables execute when there are no blocks', () => {
    mockFlowState = {
      flow: {
        nodes: [],
        connections: [],
        variables: [],
        assertions: [],
        name: 'Empty Flow',
        version: '1.0',
      },
    };
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    expect(
      screen.getByText('This flow has no blocks. Add blocks to the canvas before executing.')
    ).toBeDefined();

    // The "Execute Flow" button in the footer should be disabled
    const executeButton = screen.getByRole('button', { name: /Execute Flow/ });
    expect(executeButton.hasAttribute('disabled')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Only utility blocks (no transactions)
  // -------------------------------------------------------------------------

  it('shows "no transactions" message when flow has only utility blocks', () => {
    mockFlowState = {
      flow: {
        nodes: [
          { id: '1', type: 'GenerateKeys', position: { x: 0, y: 0 }, config: {} },
          { id: '2', type: 'Faucet', position: { x: 0, y: 100 }, config: {} },
        ],
        connections: [],
        variables: [],
        assertions: [],
        name: 'Utility Only',
        version: '1.0',
      },
    };
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    expect(
      screen.getByText(
        "This flow contains only utility blocks and won't submit any transactions."
      )
    ).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Button states
  // -------------------------------------------------------------------------

  it('shows "Execute on MainNet" with destructive variant on mainnet', () => {
    mockSelectedNetwork = 'mainnet';
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    const btn = screen.getByText('Execute on MainNet').closest('button');
    expect(btn).toBeDefined();
    // Destructive variant applies a red background class
    expect(btn?.className).toContain('bg-red-600');
  });

  it('disables execute button on read-only network', () => {
    mockSelectedNetwork = 'local';
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    const executeButton = screen.getByRole('button', { name: /Execute Flow/ });
    expect(executeButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Read-Only')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // User interactions
  // -------------------------------------------------------------------------

  it('calls onConfirm and onClose when execute button is clicked', () => {
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Execute Flow/ }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel button is clicked', () => {
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Credit estimation
  // -------------------------------------------------------------------------

  it('displays correct estimated credits based on transaction blocks', () => {
    // Default flow has one CreateIdentity block (cost 2500) and two utility blocks (cost 0)
    const props = defaultProps();
    render(<ExecuteConfirmModal {...props} />);

    // estimatedCredits = 2500, displayed as "~2,500"
    expect(screen.getByText('~2,500')).toBeDefined();
    // 3 total blocks, 1 transaction
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });
});
