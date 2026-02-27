/**
 * Network Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkService } from '../network';

// =============================================================================
// Mock fetch
// =============================================================================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockJsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function mockNetworkStatusResponse(overrides?: Record<string, unknown>) {
  return mockJsonResponse({
    result: {
      majorBlockHeight: 12345,
      majorBlockTime: '2025-01-01T00:00:00Z',
      ...overrides,
    },
  });
}

function mockOracleResponse(price = 500) {
  return mockJsonResponse({
    result: { price },
  });
}

function mockErrorResponse(message = 'Server error', code = -32000) {
  return mockJsonResponse({
    error: { code, message },
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('NetworkService', () => {
  let service: NetworkService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    service = new NetworkService();
  });

  afterEach(() => {
    service.disconnect();
    vi.useRealTimers();
  });

  // =========================================================================
  // Initial state
  // =========================================================================

  describe('initial state', () => {
    it('getStatus returns null', () => {
      expect(service.getStatus()).toBeNull();
    });

    it('getNetworkConfig returns null', () => {
      expect(service.getNetworkConfig()).toBeNull();
    });
  });

  // =========================================================================
  // connect
  // =========================================================================

  describe('connect', () => {
    it('connects successfully', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      const status = await service.connect('kermit');
      expect(status.connected).toBe(true);
      expect(status.networkId).toBe('kermit');
    });

    it('includes lastBlock from response', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse({ majorBlockHeight: 99999 }))
        .mockReturnValueOnce(mockOracleResponse());

      const status = await service.connect('kermit');
      expect(status.lastBlock).toBe(99999);
    });

    it('includes lastBlockTime from response', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse({ majorBlockTime: '2025-06-15T12:00:00Z' }))
        .mockReturnValueOnce(mockOracleResponse());

      const status = await service.connect('kermit');
      expect(status.lastBlockTime).toBe('2025-06-15T12:00:00Z');
    });

    it('fetches oracle price on successful connection', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse(750));

      const status = await service.connect('kermit');
      expect(status.oracle).toBeDefined();
      expect(status.oracle!.price).toBe(750);
    });

    it('handles failed connection (fetch throws)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));

      const status = await service.connect('kermit');
      expect(status.connected).toBe(false);
      expect(status.error).toContain('Network unreachable');
    });

    it('handles failed connection (API returns error)', async () => {
      mockFetch.mockReturnValueOnce(mockErrorResponse('Not found'));

      const status = await service.connect('kermit');
      expect(status.connected).toBe(false);
      expect(status.error).toContain('Not found');
    });

    it('throws for unknown network', async () => {
      await expect(service.connect('unknown' as any)).rejects.toThrow('Unknown network');
    });

    it('sets network config on connect', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      const config = service.getNetworkConfig();
      expect(config).not.toBeNull();
      expect(config!.id).toBe('kermit');
      expect(config!.name).toBe('Kermit (TestNet)');
    });

    it('still connects gracefully when oracle fetch fails', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockRejectedValueOnce(new Error('Oracle unavailable'));

      const status = await service.connect('kermit');
      expect(status.connected).toBe(true);
      expect(status.oracle).toBeUndefined();
    });
  });

  // =========================================================================
  // disconnect
  // =========================================================================

  describe('disconnect', () => {
    it('clears status', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      expect(service.getStatus()).not.toBeNull();

      service.disconnect();
      expect(service.getStatus()).toBeNull();
    });

    it('clears network config', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      service.disconnect();
      expect(service.getNetworkConfig()).toBeNull();
    });

    it('stops status polling', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      const fetchCountAfterConnect = mockFetch.mock.calls.length;

      service.disconnect();
      mockFetch.mockReturnValue(mockNetworkStatusResponse());

      // Advance past the 30s interval
      await vi.advanceTimersByTimeAsync(60000);

      // No new fetch calls should have been made
      expect(mockFetch.mock.calls.length).toBe(fetchCountAfterConnect);
    });
  });

  // =========================================================================
  // getOraclePrice
  // =========================================================================

  describe('getOraclePrice', () => {
    it('returns price from API response', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse(1200))
        .mockReturnValueOnce(mockOracleResponse(1200));

      await service.connect('kermit');
      const oracle = await service.getOraclePrice();
      expect(oracle.price).toBe(1200);
      expect(oracle.timestamp).toBeTruthy();
    });

    it('throws when not connected', async () => {
      await expect(service.getOraclePrice()).rejects.toThrow('Not connected');
    });

    it('throws when API returns error', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');

      mockFetch.mockReturnValueOnce(mockErrorResponse('Oracle error'));
      await expect(service.getOraclePrice()).rejects.toThrow('Oracle error');
    });
  });

  // =========================================================================
  // fetchApi
  // =========================================================================

  describe('fetchApi', () => {
    it('throws when not connected', async () => {
      await expect(service.fetchApi('v2', 'test', {})).rejects.toThrow('Not connected');
    });

    it('makes POST request with JSON-RPC format', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse())
        .mockReturnValueOnce(mockJsonResponse({ result: { data: 'test' } }));

      await service.connect('kermit');
      await service.fetchApi('v2', 'my-method', { foo: 'bar' });

      // The third call should be our fetchApi call
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('my-method');
      expect(body.params).toEqual({ foo: 'bar' });
    });

    it('throws on HTTP error', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse())
        .mockReturnValueOnce(Promise.resolve({ ok: false, status: 500 }));

      await service.connect('kermit');
      await expect(service.fetchApi('v2', 'test', {})).rejects.toThrow('HTTP error: 500');
    });

    it('uses v3 endpoint when version is v3', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse())
        .mockReturnValueOnce(mockJsonResponse({ result: {} }));

      await service.connect('kermit');
      await service.fetchApi('v3', 'test', {});

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[0]).toContain('/v3');
    });
  });

  // =========================================================================
  // onStatusChange
  // =========================================================================

  describe('onStatusChange', () => {
    it('listener receives status on connect', async () => {
      const listener = vi.fn();
      service.onStatusChange(listener);

      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0].connected).toBe(true);
    });

    it('unsubscribe stops receiving updates', async () => {
      const listener = vi.fn();
      const unsubscribe = service.onStatusChange(listener);

      unsubscribe();

      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      expect(listener).not.toHaveBeenCalled();
    });

    it('multiple listeners all receive updates', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      service.onStatusChange(listener1);
      service.onStatusChange(listener2);

      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Status polling
  // =========================================================================

  describe('status polling', () => {
    it('polls every 30 seconds after connect', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      const callsAfterConnect = mockFetch.mock.calls.length;

      // Set up mock for polling calls
      mockFetch.mockReturnValue(mockNetworkStatusResponse());

      // Advance 30 seconds
      await vi.advanceTimersByTimeAsync(30000);
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterConnect);
    });

    it('updates status on successful poll', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse({ majorBlockHeight: 100 }))
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      expect(service.getStatus()!.lastBlock).toBe(100);

      // Mock a poll response with updated block height
      mockFetch.mockReturnValueOnce(
        mockNetworkStatusResponse({ majorBlockHeight: 200 })
      );

      await vi.advanceTimersByTimeAsync(30000);
      expect(service.getStatus()!.lastBlock).toBe(200);
    });

    it('sets connected=false on poll failure', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');
      expect(service.getStatus()!.connected).toBe(true);

      // Mock a failed poll
      mockFetch.mockRejectedValueOnce(new Error('Connection lost'));

      await vi.advanceTimersByTimeAsync(30000);
      expect(service.getStatus()!.connected).toBe(false);
      expect(service.getStatus()!.error).toContain('Connection lost');
    });

    it('notifies listeners on poll updates', async () => {
      mockFetch
        .mockReturnValueOnce(mockNetworkStatusResponse())
        .mockReturnValueOnce(mockOracleResponse());

      await service.connect('kermit');

      const listener = vi.fn();
      service.onStatusChange(listener);

      mockFetch.mockReturnValueOnce(mockNetworkStatusResponse());
      await vi.advanceTimersByTimeAsync(30000);

      expect(listener).toHaveBeenCalled();
    });
  });
});
