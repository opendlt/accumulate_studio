/**
 * NetworkStatusIndicator Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NetworkStatusIndicator } from '../layout/NetworkStatusIndicator';

// Mock network service
const mockGetStatus = vi.fn();
const mockOnStatusChange = vi.fn();
const mockConnect = vi.fn();

vi.mock('../../services/network', () => ({
  networkService: {
    getStatus: () => mockGetStatus(),
    onStatusChange: (cb: (s: any) => void) => {
      mockOnStatusChange(cb);
      return vi.fn(); // unsubscribe
    },
    connect: (...args: any[]) => mockConnect(...args),
  },
}));

// Mock UI store
vi.mock('../../store', () => ({
  useUIStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      selectedNetwork: 'kermit',
    };
    return selector(state);
  }),
}));

describe('NetworkStatusIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
  });

  it('shows connected state', () => {
    mockGetStatus.mockReturnValue({
      connected: true,
      blockHeight: 12345,
      oraclePrice: 500,
    });

    render(<NetworkStatusIndicator />);
    // Should have the green dot (connected indicator visible)
    const button = screen.getByTitle('Connected to Kermit (TestNet)');
    expect(button).toBeDefined();
  });

  it('shows disconnected state', () => {
    mockGetStatus.mockReturnValue({
      connected: false,
      error: 'Connection timeout',
    });

    render(<NetworkStatusIndicator />);
    const button = screen.getByTitle('Disconnected from Kermit (TestNet)');
    expect(button).toBeDefined();
  });

  it('expands to show details on click', () => {
    mockGetStatus.mockReturnValue({
      connected: true,
      blockHeight: 12345,
      oraclePrice: 500,
    });

    render(<NetworkStatusIndicator />);
    fireEvent.click(screen.getByTitle('Connected to Kermit (TestNet)'));

    // Should show block height and oracle price
    expect(screen.getByText('Block Height')).toBeDefined();
    expect(screen.getByText('12,345')).toBeDefined();
    expect(screen.getByText('Oracle Price')).toBeDefined();
    expect(screen.getByText('$5.00')).toBeDefined();
  });

  it('shows faucet availability', () => {
    mockGetStatus.mockReturnValue({ connected: true });

    render(<NetworkStatusIndicator />);
    fireEvent.click(screen.getByTitle('Connected to Kermit (TestNet)'));

    expect(screen.getByText('Faucet')).toBeDefined();
    expect(screen.getByText('Available')).toBeDefined();
  });

  it('shows error message when disconnected', () => {
    mockGetStatus.mockReturnValue({
      connected: false,
      error: 'Network unreachable',
    });

    render(<NetworkStatusIndicator />);
    fireEvent.click(screen.getByTitle('Disconnected from Kermit (TestNet)'));

    expect(screen.getByText('Network unreachable')).toBeDefined();
  });

  it('shows Reconnect button when disconnected', () => {
    mockGetStatus.mockReturnValue({
      connected: false,
      error: 'Connection failed',
    });

    render(<NetworkStatusIndicator />);
    fireEvent.click(screen.getByTitle('Disconnected from Kermit (TestNet)'));

    expect(screen.getByText('Reconnect')).toBeDefined();
  });

  it('calls connect when Reconnect is clicked', () => {
    mockGetStatus.mockReturnValue({
      connected: false,
      error: 'Connection failed',
    });

    render(<NetworkStatusIndicator />);
    fireEvent.click(screen.getByTitle('Disconnected from Kermit (TestNet)'));
    fireEvent.click(screen.getByText('Reconnect'));

    expect(mockConnect).toHaveBeenCalledWith('kermit');
  });

  it('subscribes to status changes on mount', () => {
    mockGetStatus.mockReturnValue({ connected: true });

    render(<NetworkStatusIndicator />);
    expect(mockOnStatusChange).toHaveBeenCalledTimes(1);
  });

  it('shows Connected badge in dropdown', () => {
    mockGetStatus.mockReturnValue({ connected: true });

    render(<NetworkStatusIndicator />);
    fireEvent.click(screen.getByTitle('Connected to Kermit (TestNet)'));

    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('shows Disconnected badge in dropdown', () => {
    mockGetStatus.mockReturnValue({ connected: false });

    render(<NetworkStatusIndicator />);
    fireEvent.click(screen.getByTitle('Disconnected from Kermit (TestNet)'));

    expect(screen.getByText('Disconnected')).toBeDefined();
  });
});
