// src/lib/api.ts
import { UserSchema } from '../schemas';
import type { User } from '../types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Fetches a URL with exponential backoff retries on network errors or 5xx responses.
 * 4xx responses are not retried — they indicate a caller error.
 * Each individual request is bounded by `timeoutMs`; a timeout is treated as a
 * retryable network failure.
 *
 * @param url         The URL to fetch.
 * @param maxRetries  Maximum number of retry attempts after the first failure.
 * @param baseDelayMs Base delay in milliseconds; doubled on each subsequent retry.
 * @param timeoutMs   Per-request timeout in milliseconds (default: 10 000).
 * @param fetchFn     Fetch implementation to use (default: globalThis.fetch). Injected
 *                    in unit tests to avoid patching globals.
 */
export async function fetchWithRetry(
  url: string,
  maxRetries: number,
  baseDelayMs: number,
  timeoutMs = 10_000,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, baseDelayMs * Math.pow(2, attempt - 1)),
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(url, { signal: controller.signal });

      // 4xx — caller error, do not retry
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }

      // 5xx — server error, retry if attempts remain
      if (!response.ok) {
        lastError = new Error(`Backend API error: ${response.status} ${response.statusText}`);
        continue;
      }

      return response;
    } catch (err) {
      // AbortError means the per-request timeout fired — treat as retryable network failure
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
        continue;
      }
      // Network-level failure (DNS, connection refused, etc.) — retry
      if (err instanceof Error && err.message.startsWith('Backend API error: 4')) {
        throw err; // 4xx rethrown immediately — no retry
      }
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `Backend API unreachable after ${maxRetries + 1} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * Fetches the current user from the backend API.
 * Retries up to 3 times with exponential backoff on transient failures.
 * Validates the response against the Zod schema for runtime type safety.
 */
export async function fetchUser(): Promise<User> {
  const response = await fetchWithRetry(`${BACKEND_URL}/api/user`, 3, 500);

  const data = await response.json();

  // Runtime validation — catches contract mismatches that TypeScript can't detect at runtime
  const validated = UserSchema.parse(data);

  // Cast to our TypeScript interface type
  // (structurally identical to UserFromSchema, but we use the explicit interface for clarity)
  return validated as User;
}
