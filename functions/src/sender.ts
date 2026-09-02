import * as functions from 'firebase-functions';

/**
 * Shared SendGrid sender-identity helpers.
 *
 * IMPORTANT: Press Pilot sends all mail through a single SendGrid-authenticated
 * domain. Per-org sending domains are NOT yet supported, so the `from.email`
 * MUST always be the platform's verified sender — putting a customer's own
 * address in `from` fails SendGrid sender verification and, where it does get
 * through, fails DMARC at the recipient.
 *
 * Org identity is expressed two ways instead:
 *   - `from.name` is set to the org name, so mail clients show "Visit Kent"
 *   - `replyTo` is set to the org's press contact, so replies reach the org
 *     rather than landing in the Press Pilot inbox
 *
 * Always build outbound `from`/`replyTo` with `orgSender()` so these two stay
 * in lockstep. See WHITELABEL_PLAN.md for the migration to per-org domains.
 */

export function getSendGridKey(): string | null {
  return functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY || null;
}

export function getFromEmail(): string | null {
  return functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL || null;
}

type OrgSenderLike = {
  name?: string | null;
  pressContact?: { name?: string | null; email?: string | null } | null;
};

export type SenderFields = {
  from: { email: string; name: string };
  replyTo?: { email: string; name: string };
};

/**
 * Build the `from` (and, where available, `replyTo`) fields for an org's
 * outbound mail.
 *
 * @param org         Org document (needs `name` and optionally `pressContact`)
 * @param fromEmail   The platform's verified SendGrid sender
 * @param options.replyToOverride
 *                    Use this address for `replyTo` instead of the org's press
 *                    contact — e.g. inbound journalist enquiries forwarded to
 *                    the org, where the org should reply to the journalist.
 * @param options.fallbackName
 *                    Display name if the org has none set.
 */
export function orgSender(
  org: OrgSenderLike | null | undefined,
  fromEmail: string,
  options?: {
    replyToOverride?: { email?: string | null; name?: string | null } | null;
    fallbackName?: string;
  }
): SenderFields {
  const orgName = org?.name || options?.fallbackName || 'Press Pilot';

  const override = options?.replyToOverride;
  const replyToEmail = override ? override.email : org?.pressContact?.email;
  const replyToName = override
    ? override.name || orgName
    : org?.pressContact?.name || orgName;

  return {
    from: { email: fromEmail, name: orgName },
    ...(replyToEmail ? { replyTo: { email: replyToEmail, name: replyToName } } : {}),
  };
}
