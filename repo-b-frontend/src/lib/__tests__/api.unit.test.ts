// src/lib/__tests__/api.unit.test.ts
//
// Unit tests for fetchWithRetry and fetchUser.
// Uses an injected fetchFn parameter to avoid patching globals.

import { fetchWithRetry } from '../api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock Response with the given status code and JSON body. */
function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as unknown as Response;
}

/** A fetch that always rejects (simulates connection refused). */
const networkError = (): Promise<Response> =>
  Promise.reject(new Error('fetch failed'));

/** A fetch that always rejects with AbortError (simulates timeout). */
const abortError = (): Promise<Response> => {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return Promise.reject(err);
};

// ---------------------------------------------------------------------------
// fetchWithRetry — basic success
// ---------------------------------------------------------------------------

describe('fetchWithRetry', () => {
  it('returns the response immediately on a 200', async () => {
    const mockFetch = jest.fn().mockResolvedValue(mockResponse(200, { ok: true }));
    const response = await fetchWithRetry('http://test', 3, 100, 10_000, mockFetch);
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // 5xx — retried
  // ---------------------------------------------------------------------------

  it('retries on 503 up to maxRetries times then throws', async () => {
    const mockFetch = jest.fn().mockResolvedValue(mockResponse(503, {}));
    await expect(
      fetchWithRetry('http://test', 3, 100, 10_000, mockFetch)
    ).rejects.toThrow('Backend API unreachable after 4 attempt(s)');
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('succeeds on the second attempt after a 500', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(mockResponse(500, {}))
      .mockResolvedValue(mockResponse(200, { ok: true }));
    const response = await fetchWithRetry('http://test', 3, 100, 10_000, mockFetch);
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // 4xx — not retried
  // ---------------------------------------------------------------------------

  it('throws immediately on 404 without retrying', async () => {
    const mockFetch = jest.fn().mockResolvedValue(mockResponse(404, {}));
    await expect(
      fetchWithRetry('http://test', 3, 100, 10_000, mockFetch)
    ).rejects.toThrow('Backend API error: 404');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 401 without retrying', async () => {
    const mockFetch = jest.fn().mockResolvedValue(mockResponse(401, {}));
    await expect(
      fetchWithRetry('http://test', 3, 100, 10_000, mockFetch)
    ).rejects.toThrow('Backend API error: 401');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Network errors — retried
  // ---------------------------------------------------------------------------

  it('retries on network error and throws after exhausting retries', async () => {
    const mockFetch = jest.fn().mockImplementation(networkError);
    await expect(
      fetchWithRetry('http://test', 2, 100, 10_000, mockFetch)
    ).rejects.toThrow('Backend API unreachable after 3 attempt(s)');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('recovers after a transient network error', async () => {
    const mockFetch = jest
      .fn()
      .mockImplementationOnce(networkError)
      .mockResolvedValue(mockResponse(200, {}));
    const response = await fetchWithRetry('http://test', 3, 100, 10_000, mockFetch);
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // AbortError (timeout) — treated as retryable
  // ---------------------------------------------------------------------------

  it('retries when the per-request timeout fires (AbortError)', async () => {
    const mockFetch = jest
      .fn()
      .mockImplementationOnce(abortError)
      .mockResolvedValue(mockResponse(200, {}));
    const response = await fetchWithRetry('http://test', 3, 100, 10_000, mockFetch);
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on repeated timeouts', async () => {
    const mockFetch = jest.fn().mockImplementation(abortError);
    await expect(
      fetchWithRetry('http://test', 2, 100, 10_000, mockFetch)
    ).rejects.toThrow('Backend API unreachable after 3 attempt(s)');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  // ---------------------------------------------------------------------------
  // Exponential backoff timing (fake timers needed for these tests)
  // ---------------------------------------------------------------------------

  describe('backoff timing', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

  it('waits baseDelayMs before the first retry', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(mockResponse(503, {}))
      .mockResolvedValue(mockResponse(200, {}));

    const BASE = 200;
    const promise = fetchWithRetry('http://test', 3, BASE, 10_000, mockFetch);

    // First attempt fires immediately — no delay yet
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance by BASE ms — triggers the retry setTimeout
    await jest.advanceTimersByTimeAsync(BASE);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await jest.runAllTimersAsync();
    await promise;
  });

  it('doubles the delay on each subsequent retry', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(mockResponse(503, {}))
      .mockResolvedValueOnce(mockResponse(503, {}))
      .mockResolvedValue(mockResponse(200, {}));

    const BASE = 100;
    const promise = fetchWithRetry('http://test', 3, BASE, 10_000, mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(1); // attempt 1

    // Retry 1 — delay = BASE * 2^0 = 100 ms
    await jest.advanceTimersByTimeAsync(100);
    expect(mockFetch).toHaveBeenCalledTimes(2); // attempt 2

    // Retry 2 — delay = BASE * 2^1 = 200 ms
    await jest.advanceTimersByTimeAsync(200);
    expect(mockFetch).toHaveBeenCalledTimes(3); // attempt 3

    await jest.runAllTimersAsync();
    await promise;
  });

  }); // end backoff timing
});
