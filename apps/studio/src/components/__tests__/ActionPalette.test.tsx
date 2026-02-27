/**
 * ActionPalette Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionPalette } from '../palette/ActionPalette';

// Mock stores
const mockOpenModal = vi.fn();

vi.mock('../../store', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      openModal: mockOpenModal,
    };
    return selector(state);
  }),
  useFlowStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      setDragging: vi.fn(),
      addNode: vi.fn(() => 'new-node-id'),
      addConnection: vi.fn(),
      flow: { nodes: [], connections: [] },
    };
    return selector(state);
  }),
}));

describe('ActionPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Action Palette heading', () => {
    render(<ActionPalette />);
    expect(screen.getByText('Action Palette')).toBeDefined();
  });

  it('renders the search input', () => {
    render(<ActionPalette />);
    expect(screen.getByPlaceholderText('Search blocks...')).toBeDefined();
  });

  it('renders Golden Path Templates button', () => {
    render(<ActionPalette />);
    expect(screen.getByText('Golden Path Templates')).toBeDefined();
  });

  it('opens template modal when Golden Path button is clicked', () => {
    render(<ActionPalette />);
    fireEvent.click(screen.getByText('Golden Path Templates'));
    expect(mockOpenModal).toHaveBeenCalledWith('template-select');
  });

  it('shows category names', () => {
    render(<ActionPalette />);
    expect(screen.getByText('Identity')).toBeDefined();
    expect(screen.getByText('Utility')).toBeDefined();
  });

  it('shows block counts per category', () => {
    render(<ActionPalette />);
    // Categories should show counts in parentheses
    const identityCounts = screen.getAllByText(/\(\d+\)/);
    expect(identityCounts.length).toBeGreaterThan(0);
  });

  it('filters blocks when searching', () => {
    render(<ActionPalette />);
    const searchInput = screen.getByPlaceholderText('Search blocks...');
    fireEvent.change(searchInput, { target: { value: 'faucet' } });
    // Should show search results
    expect(screen.getByText(/result/)).toBeDefined();
  });

  it('shows "No blocks found" for unmatched search', () => {
    render(<ActionPalette />);
    const searchInput = screen.getByPlaceholderText('Search blocks...');
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });
    expect(screen.getByText('No blocks found')).toBeDefined();
  });

  it('shows result count during search', () => {
    render(<ActionPalette />);
    const searchInput = screen.getByPlaceholderText('Search blocks...');
    fireEvent.change(searchInput, { target: { value: 'token' } });
    // Should show "N results" text
    expect(screen.getByText(/result/)).toBeDefined();
  });

  it('clears search results when input is cleared', () => {
    render(<ActionPalette />);
    const searchInput = screen.getByPlaceholderText('Search blocks...');

    // Search
    fireEvent.change(searchInput, { target: { value: 'faucet' } });
    expect(screen.getByText(/result/)).toBeDefined();

    // Clear
    fireEvent.change(searchInput, { target: { value: '' } });
    // Categories should reappear
    expect(screen.getByText('Identity')).toBeDefined();
  });

  it('renders footer hint text', () => {
    render(<ActionPalette />);
    expect(screen.getByText(/Click to append or drag/)).toBeDefined();
  });
});
