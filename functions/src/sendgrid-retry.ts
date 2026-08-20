import sgMail from '@sendgrid/mail';

/**
 * Determines whether a SendGrid error is transient and worth retrying.
 * Retries on: 5xx server errors, 429 rate limits, network/timeout errors.
 * Does NOT retry on: 4xx client errors (invalid email, auth, bad request).
 */
function isTransientError(error: any): boolean {
  // Network / timeout errors (no HTTP status)
  if (!error.code && !error.statusCode) {
    // Check for common network error codes
    const msg = (error.message || '').toLowerCase();
    if (
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('socket hang up') ||
      msg.includes('network') ||
      msg.includes('timeout')
    ) {
      return true;
    }
  }

  const status = error.code || error.statusCode;
  // 429 = rate limited, 5xx = server error
  if (status === 429 || (status >= 500 && status < 600)) {
    return true;
  }

  return false;
}

/**
 * Send an email via SendGrid with retry + exponential backoff.
 *
 * - Up to `maxRetries` attempts (default 3)
 * - Backoff delays: 1s, 2s, 4s
 * - Only retries transient errors (5xx, 429, network errors)
 * - Throws on permanent failures immediately
 *
 * QA fix (Low): retry/exhaustion logs previously always printed the raw `msg.to`
 * address, which meant Press Pilot network contacts' real emails (not just
 * customer-owned outlet contacts) ended up in ordinary Cloud Function logs on every
 * retry or final failure — outside the documented superadmin-only audit trail for
 * that anonymised data. Callers that are sending to a network contact should now
 * pass a non-identifying `logLabel` (e.g. a sendJobRecipientId) to use in these log
 * lines instead; callers sending to a customer-owned contact can omit it and the
 * real `to` address is used, since that address is already visible to its own org.
 */
export async function sendWithRetry(
  msg: sgMail.MailDataRequired,
  maxRetries = 3,
  logLabel?: string
): Promise<void> {
  const delays = [1000, 2000, 4000]; // exponential backoff
  const displayTarget = logLabel || (msg as any).to;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sgMail.send(msg);
      return; // success
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;

      if (!isTransientError(error) || isLastAttempt) {
        // Permanent error or last attempt — propagate
        if (isLastAttempt && isTransientError(error)) {
          console.error(
            `[sendWithRetry] All ${maxRetries} attempts exhausted for ${displayTarget}. Giving up.`
          );
        }
        throw error;
      }

      // Transient error — wait and retry
      const delay = delays[attempt - 1] || 4000;
      console.warn(
        `[sendWithRetry] Attempt ${attempt}/${maxRetries} failed for ${displayTarget} ` +
        `(${error.code || error.statusCode || 'network error'}). Retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
