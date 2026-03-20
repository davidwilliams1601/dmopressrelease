/**
 * Retry-with-backoff wrapper for Gemini AI calls.
 * Retries on rate limit (429) and server errors (5xx).
 * Returns a fallback value on final failure instead of throwing.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  fallback: T,
  label: string,
  maxRetries: number = 3,
): Promise<T> {
  const backoffMs = [2000, 4000, 8000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.status ?? err?.code ?? err?.httpStatusCode;
      const isRateLimit = status === 429;
      const isServerError =
        typeof status === 'number' && status >= 500 && status < 600;
      const isRetryable = isRateLimit || isServerError;

      if (isRetryable && attempt < maxRetries) {
        const delay = backoffMs[attempt] ?? 8000;
        console.warn(
          `[${label}] Attempt ${attempt + 1}/${maxRetries + 1} failed (status ${status}). ` +
          `Retrying in ${delay}ms...`,
        );
        await sleep(delay);
        continue;
      }

      // Final failure — log and return fallback
      console.error(
        `[${label}] All ${maxRetries + 1} attempts failed. Returning fallback value.`,
        err,
      );
      return fallback;
    }
  }

  // Shouldn't reach here, but satisfy TS
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
