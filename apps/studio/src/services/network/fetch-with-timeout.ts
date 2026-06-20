/**
 * fetch() with a per-request timeout, caller-abort linkage, and optional
 * bounded retry/backoff for IDEMPOTENT reads. Writes must never retry.
 */

export interface FetchTimeoutOptions {
  /** Caller-supplied abort signal (e.g. execution abortController.signal). */
  signal?: AbortSignal;
  /** Per-request timeout in ms. Default 60_000. */
  timeoutMs?: number;
  /** Bounded retries for IDEMPOTENT requests only. Default 0. */
  retries?: number;
  /** Base backoff in ms (doubled each retry). Default 500. */
  backoffMs?: number;
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * True only when the CALLER's signal aborted, which must NOT be retried.
 * A timeout-triggered abort also surfaces as an AbortError from fetch, so we
 * cannot key off the error alone — we must check the caller's own signal.
 */
function isUserAbort(callerSignal: AbortSignal | undefined): boolean {
  return !!callerSignal?.aborted;
}

/**
 * fetch() with a per-request timeout, caller-abort linkage, and optional
 * bounded retry/backoff. RETRIES MUST ONLY BE USED FOR IDEMPOTENT READS.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  opts: FetchTimeoutOptions = {},
): Promise<Response> {
  const { signal: callerSignal, timeoutMs = 60_000, retries = 0, backoffMs = 500 } = opts;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const timeoutCtrl = new AbortController();
    const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

    // Compose caller signal + timeout signal into one.
    const onCallerAbort = () => timeoutCtrl.abort();
    if (callerSignal) {
      if (callerSignal.aborted) timeoutCtrl.abort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const res = await fetch(url, { ...init, signal: timeoutCtrl.signal });
      return res;
    } catch (err) {
      // User/caller aborted -> never retry, propagate a clean abort error.
      if (isUserAbort(callerSignal)) {
        throw new DOMException('Aborted', 'AbortError');
      }
      // Timeout fired (our controller, not the caller's).
      const timedOut = timeoutCtrl.signal.aborted && !callerSignal?.aborted;
      const canRetry = attempt < retries;
      if (!canRetry) {
        throw timedOut ? new TimeoutError(timeoutMs) : err;
      }
      // Backoff, but remain abortable during the wait.
      await abortableDelay(backoffMs * 2 ** attempt, callerSignal);
      attempt += 1;
    } finally {
      clearTimeout(timer);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }
}

/** A setTimeout that rejects immediately if the signal aborts. */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
