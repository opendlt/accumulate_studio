import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, abortableDelay, TimeoutError } from '../fetch-with-timeout';

const realFetch = global.fetch;

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('fetchWithTimeout', () => {
  it('rejects with TimeoutError when the fetch never resolves', async () => {
    // fetch that only settles when its own signal aborts (as the browser does).
    global.fetch = vi.fn((_url, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
    ) as unknown as typeof fetch;

    await expect(
      fetchWithTimeout('http://x', {}, { timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('rejects with AbortError (not TimeoutError) and does NOT retry on caller abort', async () => {
    const calls = { n: 0 };
    global.fetch = vi.fn((_url, init?: RequestInit) => {
      calls.n += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    }) as unknown as typeof fetch;

    const caller = new AbortController();
    const p = fetchWithTimeout(
      'http://x',
      {},
      { signal: caller.signal, timeoutMs: 10_000, retries: 3 },
    );
    setTimeout(() => caller.abort(), 20);

    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls.n).toBe(1); // no retry after a user abort
  });

  it('retries idempotent reads: fail twice, then succeed', async () => {
    let n = 0;
    global.fetch = vi.fn(async () => {
      n += 1;
      if (n < 3) throw new TypeError('network blip');
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const res = await fetchWithTimeout(
      'http://x',
      {},
      { retries: 2, backoffMs: 1 },
    );
    expect(res.status).toBe(200);
    expect(n).toBe(3);
  });

  it('gives up after exhausting retries', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('always fails');
    }) as unknown as typeof fetch;

    await expect(
      fetchWithTimeout('http://x', {}, { retries: 2, backoffMs: 1 }),
    ).rejects.toThrow(/always fails/);
  });
});

describe('abortableDelay', () => {
  it('resolves after ms', async () => {
    const start = Date.now();
    await abortableDelay(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(20);
  });

  it('rejects immediately if the signal is already aborted', async () => {
    const c = new AbortController();
    c.abort();
    await expect(abortableDelay(1000, c.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects promptly if the signal aborts during the wait', async () => {
    const c = new AbortController();
    const p = abortableDelay(5000, c.signal);
    setTimeout(() => c.abort(), 20);
    const start = Date.now();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
