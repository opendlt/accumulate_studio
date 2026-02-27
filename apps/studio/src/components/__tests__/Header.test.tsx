/**
 * Header Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../layout/Header';

// ---------------------------------------------------------------------------
// Mock helpers – extracted so individual tests can override default store state
// ---------------------------------------------------------------------------

const mockSetFlowName = vi.fn();
const mockLoadFlow = vi.fn();
const mockNewFlow = vi.fn();
const mockClearCanvas = vi.fn();
const mockUndo = vi.fn();
const mockRedo = vi.fn();
const mockSetTheme = vi.fn();
const mockSetSelectedNetwork = vi.fn();
const mockOpenModal = vi.fn();

let flowStoreState: Record<string, any> = {};
let uiStoreState: Record<string, any> = {};

vi.mock('../../store', () => ({
  useFlowStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      flow: { name: 'My Flow', nodes: [], connections: [], version: '1.0' },
      setFlowName: mockSetFlowName,
      loadFlow: mockLoadFlow,
      newFlow: mockNewFlow,
      clearCanvas: mockClearCanvas,
      undo: mockUndo,
      redo: mockRedo,
      past: [],
      future: [],
      validationResult: null,
      ...flowStoreState,
    };
    return selector(state);
  }),
  useUIStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      theme: 'system' as const,
      setTheme: mockSetTheme,
      selectedNetwork: 'kermit',
      setSelectedNetwork: mockSetSelectedNetwork,
      openModal: mockOpenModal,
      ...uiStoreState,
    };
    return selector(state);
  }),
}));

vi.mock('../../store/flow-store', () => ({
  selectCanUndo: (state: any) => state.past.length > 0,
  selectCanRedo: (state: any) => state.future.length > 0,
  selectFlowValidationSeverity: (state: any) =>
    state.validationResult?.severity ?? 'valid',
  selectTotalCreditCost: (state: any) =>
    state.validationResult?.totalCreditCost ?? 0,
}));

vi.mock('@accumulate-studio/types', () => ({
  NETWORKS: {
    mainnet: {
      id: 'mainnet',
      name: 'MainNet',
      description: 'Production network',
      faucetAvailable: false,
    },
    testnet: {
      id: 'testnet',
      name: 'TestNet',
      description: 'Public test network',
      faucetAvailable: true,
    },
    devnet: {
      id: 'devnet',
      name: 'DevNet',
      description: 'Development network',
      faucetAvailable: true,
    },
    kermit: {
      id: 'kermit',
      name: 'Kermit (TestNet)',
      description: 'Kermit test network',
      faucetAvailable: true,
    },
    local: {
      id: 'local',
      name: 'Local DevNet',
      description: 'Local development node',
      faucetAvailable: true,
    },
  },
  validateFlow: vi.fn(() => ({ valid: true, errors: [] })),
}));

vi.mock('../layout/NetworkStatusIndicator', () => ({
  NetworkStatusIndicator: () => <div data-testid="network-status-indicator" />,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flowStoreState = {};
    uiStoreState = {};
  });

  // -----------------------------------------------------------------------
  // 1. Branding
  // -----------------------------------------------------------------------
  it('renders the Accumulate Studio branding text', () => {
    render(<Header />);
    expect(screen.getByText('Accumulate Studio')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 2. Editable flow name – display
  // -----------------------------------------------------------------------
  it('displays the flow name from the store', () => {
    render(<Header />);
    expect(screen.getByText('My Flow')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 3. Editable flow name – clicking reveals input
  // -----------------------------------------------------------------------
  it('shows an input field when the flow name is clicked', () => {
    render(<Header />);
    fireEvent.click(screen.getByText('My Flow'));
    const input = screen.getByDisplayValue('My Flow');
    expect(input).toBeDefined();
    expect(input.tagName).toBe('INPUT');
  });

  // -----------------------------------------------------------------------
  // 4. New Flow button present
  // -----------------------------------------------------------------------
  it('renders the New Flow button', () => {
    render(<Header />);
    expect(screen.getByTitle('New Flow')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 5. New Flow – calls newFlow() directly when canvas is empty
  // -----------------------------------------------------------------------
  it('calls newFlow immediately when there are no nodes on the canvas', () => {
    render(<Header />);
    fireEvent.click(screen.getByTitle('New Flow'));
    expect(mockNewFlow).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 6. Clear Canvas – disabled when no nodes
  // -----------------------------------------------------------------------
  it('disables the Clear Canvas button when there are no nodes', () => {
    render(<Header />);
    const clearBtn = screen.getByTitle('Clear Canvas');
    expect(clearBtn.hasAttribute('disabled')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 7. Clear Canvas – enabled when nodes exist
  // -----------------------------------------------------------------------
  it('enables the Clear Canvas button when nodes exist', () => {
    flowStoreState = {
      flow: { name: 'Flow', nodes: [{ id: 'n1' }], connections: [], version: '1.0' },
    };
    render(<Header />);
    const clearBtn = screen.getByTitle('Clear Canvas');
    expect(clearBtn.hasAttribute('disabled')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 8. Undo – disabled when past is empty
  // -----------------------------------------------------------------------
  it('disables the Undo button when there is no history', () => {
    render(<Header />);
    const undoBtn = screen.getByTitle('Undo (Ctrl+Z)');
    expect(undoBtn.hasAttribute('disabled')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 9. Redo – disabled when future is empty
  // -----------------------------------------------------------------------
  it('disables the Redo button when there is no redo history', () => {
    render(<Header />);
    const redoBtn = screen.getByTitle('Redo (Ctrl+Shift+Z)');
    expect(redoBtn.hasAttribute('disabled')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 10. Undo – enabled and clickable when past has entries
  // -----------------------------------------------------------------------
  it('enables and calls undo when past history exists', () => {
    flowStoreState = { past: [{ name: 'old' }] };
    render(<Header />);
    const undoBtn = screen.getByTitle('Undo (Ctrl+Z)');
    expect(undoBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(undoBtn);
    expect(mockUndo).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 11. Redo – enabled and clickable when future has entries
  // -----------------------------------------------------------------------
  it('enables and calls redo when future history exists', () => {
    flowStoreState = { future: [{ name: 'future' }] };
    render(<Header />);
    const redoBtn = screen.getByTitle('Redo (Ctrl+Shift+Z)');
    expect(redoBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(redoBtn);
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 12. Network selector – shows current network name
  // -----------------------------------------------------------------------
  it('displays the currently selected network name', () => {
    render(<Header />);
    expect(screen.getByText('Kermit (TestNet)')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 13. Network selector – opens dropdown and shows all networks
  // -----------------------------------------------------------------------
  it('opens the network dropdown showing all network options', () => {
    render(<Header />);
    // The button and dropdown item both show "Kermit (TestNet)"
    const allKermit = screen.getAllByText('Kermit (TestNet)');
    fireEvent.click(allKermit[0]);
    expect(screen.getByText('MainNet')).toBeDefined();
    expect(screen.getByText('Local DevNet')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 14. Network selector – mainnet shows "REAL TOKENS" badge
  // -----------------------------------------------------------------------
  it('shows a REAL TOKENS badge next to MainNet in the dropdown', () => {
    render(<Header />);
    // Open the dropdown first
    fireEvent.click(screen.getByText('Kermit (TestNet)'));
    expect(screen.getByText('REAL TOKENS')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 15. Theme toggle – opens dropdown with Light / Dark / System
  // -----------------------------------------------------------------------
  it('opens the theme dropdown with Light, Dark, and System options', () => {
    render(<Header />);
    fireEvent.click(screen.getByTitle('Theme'));
    expect(screen.getByText('Light')).toBeDefined();
    expect(screen.getByText('Dark')).toBeDefined();
    expect(screen.getByText('System')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 16. Save Flow – disabled when no nodes
  // -----------------------------------------------------------------------
  it('disables the Save Flow button when there are no nodes', () => {
    render(<Header />);
    const saveBtn = screen.getByTitle('Save Flow (JSON)');
    expect(saveBtn.hasAttribute('disabled')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 17. Import Flow button and hidden file input
  // -----------------------------------------------------------------------
  it('renders the Import Flow button with a hidden file input', () => {
    render(<Header />);
    expect(screen.getByTitle('Import Flow (JSON)')).toBeDefined();
    const fileInput = screen.getByLabelText('Import flow file');
    expect(fileInput).toBeDefined();
    expect(fileInput.getAttribute('type')).toBe('file');
    expect(fileInput.className).toContain('hidden');
  });

  // -----------------------------------------------------------------------
  // 18. Export button
  // -----------------------------------------------------------------------
  it('renders the Export button and calls onExport when clicked', () => {
    const onExport = vi.fn();
    render(<Header onExport={onExport} />);
    fireEvent.click(screen.getByText('Export'));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 19. Execute button – disabled when no nodes
  // -----------------------------------------------------------------------
  it('disables the Execute button when there are no nodes', () => {
    render(<Header />);
    const executeBtn = screen.getByText('Execute').closest('button')!;
    expect(executeBtn.hasAttribute('disabled')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 20. Execute button – calls onExecute when nodes exist
  // -----------------------------------------------------------------------
  it('calls onExecute when clicked with nodes on the canvas', () => {
    flowStoreState = {
      flow: { name: 'Flow', nodes: [{ id: 'n1' }], connections: [], version: '1.0' },
    };
    const onExecute = vi.fn();
    render(<Header onExecute={onExecute} />);
    const executeBtn = screen.getByText('Execute').closest('button')!;
    expect(executeBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(executeBtn);
    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 21. Execute button – shows "Executing..." while running
  // -----------------------------------------------------------------------
  it('shows "Executing..." text and is disabled while executing', () => {
    flowStoreState = {
      flow: { name: 'Flow', nodes: [{ id: 'n1' }], connections: [], version: '1.0' },
    };
    render(<Header isExecuting />);
    expect(screen.getByText('Executing...')).toBeDefined();
    const executeBtn = screen.getByText('Executing...').closest('button')!;
    expect(executeBtn.hasAttribute('disabled')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 22. Validation indicator – not shown when no nodes
  // -----------------------------------------------------------------------
  it('does not render the validation dot when there are no nodes', () => {
    render(<Header />);
    expect(screen.queryByText('All prerequisites met')).toBeNull();
    // The dot is purely class-based; we verify indirectly: when no nodes
    // the entire container is not rendered, so bg-green-500 is absent
    const container = document.querySelector('.bg-green-500.rounded-full');
    expect(container).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 23. Validation indicator – green dot for valid flow with nodes
  // -----------------------------------------------------------------------
  it('renders a green validation dot when flow is valid and has nodes', () => {
    flowStoreState = {
      flow: { name: 'Flow', nodes: [{ id: 'n1' }], connections: [], version: '1.0' },
      validationResult: { severity: 'valid', totalCreditCost: 0 },
    };
    render(<Header />);
    const dot = document.querySelector('.bg-green-500.rounded-full');
    expect(dot).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 24. Validation indicator – red dot for error
  // -----------------------------------------------------------------------
  it('renders a red validation dot when flow has errors', () => {
    flowStoreState = {
      flow: { name: 'Flow', nodes: [{ id: 'n1' }], connections: [], version: '1.0' },
      validationResult: { severity: 'error', totalCreditCost: 0 },
    };
    render(<Header />);
    const dot = document.querySelector('.bg-red-500.rounded-full');
    expect(dot).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 25. Validation indicator – yellow dot for warning
  // -----------------------------------------------------------------------
  it('renders a yellow validation dot when flow has warnings', () => {
    flowStoreState = {
      flow: { name: 'Flow', nodes: [{ id: 'n1' }], connections: [], version: '1.0' },
      validationResult: { severity: 'warning', totalCreditCost: 100 },
    };
    render(<Header />);
    const dot = document.querySelector('.bg-yellow-500.rounded-full');
    expect(dot).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 26. NetworkStatusIndicator is rendered
  // -----------------------------------------------------------------------
  it('renders the NetworkStatusIndicator component', () => {
    render(<Header />);
    expect(screen.getByTestId('network-status-indicator')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 27. Execute defaults to openModal when no onExecute prop
  // -----------------------------------------------------------------------
  it('opens the execute-confirm modal when no onExecute prop is provided', () => {
    flowStoreState = {
      flow: { name: 'Flow', nodes: [{ id: 'n1' }], connections: [], version: '1.0' },
    };
    render(<Header />);
    fireEvent.click(screen.getByText('Execute'));
    expect(mockOpenModal).toHaveBeenCalledWith('execute-confirm');
  });
});
