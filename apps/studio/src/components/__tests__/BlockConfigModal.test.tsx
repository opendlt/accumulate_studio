/**
 * BlockConfigModal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockConfigModal } from '../modals/BlockConfigModal';

// Mock functions hoisted above vi.mock calls
const mockUpdateNodeConfig = vi.fn();
const mockOnClose = vi.fn();

// Default modal data for CreateIdentity
let mockModalData: { nodeId: string; blockType: string } | null = {
  nodeId: 'node-1',
  blockType: 'CreateIdentity',
};

// Default node config
let mockNodeConfig: Record<string, unknown> = { url: 'acc://test' };

// Mock stores
vi.mock('../../store', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      modalData: mockModalData,
    };
    return selector(state);
  }),
  useFlowStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      updateNodeConfig: mockUpdateNodeConfig,
      flow: {
        nodes: [
          {
            id: 'node-1',
            type: 'CreateIdentity',
            position: { x: 0, y: 0 },
            config: mockNodeConfig,
          },
        ],
      },
    };
    return selector(state);
  }),
}));

// Mock @accumulate-studio/types with block catalog
vi.mock('@accumulate-studio/types', () => ({
  BLOCK_CATALOG: {
    CreateIdentity: {
      name: 'Create Identity',
      description: 'Create an ADI on the Accumulate network',
      color: '#6366f1',
      icon: 'user-plus',
      category: 'identity',
      configSchema: {
        properties: {
          url: { type: 'string', description: 'The ADI URL to create' },
          keyBookUrl: { type: 'string', description: 'Key book URL' },
          publicKeyHash: {
            type: 'string',
            description: 'Public key hash (auto-resolved from upstream)',
          },
        },
        required: ['url'],
      },
      inputs: [{ id: 'input', type: 'any' }],
      outputs: [{ id: 'output', type: 'any' }],
    },
    GenerateKeys: {
      name: 'Generate Keys',
      description: 'Generate an ed25519 keypair',
      color: '#10b981',
      icon: 'key',
      category: 'utility',
      configSchema: { properties: {}, required: [] },
      inputs: [],
      outputs: [{ id: 'output', type: 'any' }],
    },
  },
}));

describe('BlockConfigModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModalData = { nodeId: 'node-1', blockType: 'CreateIdentity' };
    mockNodeConfig = { url: 'acc://test' };
  });

  it('renders block name in the dialog title', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('Create Identity')).toBeDefined();
  });

  it('renders block description', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    expect(
      screen.getByText('Create an ADI on the Accumulate network')
    ).toBeDefined();
  });

  it('renders form fields for each config schema property', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    // CreateIdentity has url, keyBookUrl, publicKeyHash
    expect(screen.getByText('Url')).toBeDefined();
    expect(screen.getByText('Key Book Url')).toBeDefined();
    expect(screen.getByText('Public Key Hash')).toBeDefined();
  });

  it('shows field descriptions as helper text', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('The ADI URL to create')).toBeDefined();
    expect(screen.getByText('Key book URL')).toBeDefined();
  });

  it('shows required asterisk on required fields only', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    // Radix Dialog renders via portal, so query from document
    const labels = document.querySelectorAll('label');
    const urlLabel = Array.from(labels).find(
      (l) => l.textContent?.includes('Url') && !l.textContent?.includes('Key Book')
    );
    expect(urlLabel).not.toBeUndefined();
    // The required asterisk is a <span> with text "*"
    const asterisk = urlLabel!.querySelector('span');
    expect(asterisk).not.toBeNull();
    expect(asterisk!.textContent).toBe('*');

    // keyBookUrl is NOT required, should not have asterisk
    const keyBookLabel = Array.from(labels).find((l) =>
      l.textContent?.includes('Key Book Url')
    );
    expect(keyBookLabel).not.toBeUndefined();
    const keyBookAsterisk = keyBookLabel!.querySelector('span');
    expect(keyBookAsterisk).toBeNull();
  });

  it('shows auto-resolution hint when schema has auto-resolved fields', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    // publicKeyHash description contains "auto-resolved"
    expect(
      screen.getByText(
        /Fields left empty will be auto-resolved from upstream blocks/
      )
    ).toBeDefined();
  });

  it('populates inputs with existing node config values', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    // The node has config: { url: 'acc://test' }
    const urlInput = screen.getByDisplayValue('acc://test');
    expect(urlInput).toBeDefined();
  });

  it('calls updateNodeConfig with node id and config on Save', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);

    // Click Save Configuration without modifying fields
    fireEvent.click(screen.getByText('Save Configuration'));

    expect(mockUpdateNodeConfig).toHaveBeenCalledTimes(1);
    // Should be called with the node id and the current config
    expect(mockUpdateNodeConfig).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({ url: 'acc://test' })
    );
  });

  it('renders correct input types for different schema property types', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);

    // url and keyBookUrl have descriptions containing 'URL' -> UrlField renders type="url"
    const urlInputs = document.querySelectorAll('input[type="url"]');
    expect(urlInputs.length).toBe(2);

    // publicKeyHash has no 'url' in description -> TextField renders type="text"
    const textInput = screen.getByPlaceholderText(
      'Public key hash (auto-resolved from upstream)'
    ) as HTMLInputElement;
    expect(textInput.type).toBe('text');
  });

  it('calls onClose after save', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Save Configuration'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is clicked without saving', () => {
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockUpdateNodeConfig).not.toHaveBeenCalled();
  });

  it('shows "no configurable parameters" for blocks with empty schema', () => {
    mockModalData = { nodeId: 'node-1', blockType: 'GenerateKeys' };
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    expect(
      screen.getByText('This block has no configurable parameters.')
    ).toBeDefined();
  });

  it('does not render dialog content when modalData is null', () => {
    mockModalData = null;
    const { container } = render(
      <BlockConfigModal isOpen={true} onClose={mockOnClose} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.queryByText('Create Identity')).toBeNull();
  });

  it('does not show auto-resolution hint for blocks without auto-resolved fields', () => {
    mockModalData = { nodeId: 'node-1', blockType: 'GenerateKeys' };
    render(<BlockConfigModal isOpen={true} onClose={mockOnClose} />);
    expect(
      screen.queryByText(
        /Fields left empty will be auto-resolved from upstream blocks/
      )
    ).toBeNull();
  });
});
