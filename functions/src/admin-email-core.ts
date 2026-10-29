/**
 * Pure logic for super-admin emails to customer organisations: who gets the email,
 * and what it looks like. Kept free of firebase imports so it can be unit-tested.
 *
 * Two kinds of email, because they carry different obligations:
 *   - 'service': things a customer needs to know to use the account they pay for
 *     (billing, security, planned downtime, changes to terms). Always delivered.
 *   - 'product': product news, tips and invitations. Respects each user's
 *     "Product updates from Press Pilot" preference and carries a manage link.
 *
 * Partners (member businesses) are never recipients. They are the org's
 * relationship, not ours.
 */

import { escapeHtml } from './html-utils';
import { linkifyHtml } from './email-template';

export type AdminEmailCategory = 'service' | 'product';
export type AdminEmailRoleScope = 'admins' | 'team';

export type AdminEmailAudience = {
  /** Explicit org selection. When non-empty, tier/vertical filters are ignored. */
  orgIds?: string[];
  tiers?: string[];
  verticals?: string[];
  includeDemo?: boolean;
  roleScope: AdminEmailRoleScope;
};

export type AudienceOrg = {
  id: string;
  name?: string;
  tier?: string | null;
  vertical?: string | null;
  isDemo?: boolean;
};

export type AudienceUser = {
  id: string;
  orgId: string;
  name?: string;
  email?: string;
  role?: string;
  notificationPrefs?: { platformUpdates?: boolean } | null;
};

export type AudienceRecipient = {
  userId: string;
  orgId: string;
  orgName: string;
  name: string;
  email: string;
  role: string;
};

export type AudienceResult = {
  recipients: AudienceRecipient[];
  orgs: Array<{ id: string; name: string; recipientCount: number }>;
  skipped: { optedOut: number; noEmail: number; duplicate: number; orgsWithNoRecipients: number };
};

export const MAX_ADMIN_EMAIL_RECIPIENTS = 1000;
export const MAX_SUBJECT_LENGTH = 150;
export const MAX_BODY_LENGTH = 20000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string | null | undefined): boolean {
  return !!email && EMAIL_RE.test(email.trim());
}

/** Orgs the audience selects, before looking at users. */
export function selectOrgs(orgs: AudienceOrg[], audience: AdminEmailAudience): AudienceOrg[] {
  const explicit = (audience.orgIds || []).filter(Boolean);
  if (explicit.length > 0) {
    // An explicit pick is deliberate, so demo orgs are allowed if chosen by name.
    const wanted = new Set(explicit);
    return orgs.filter((o) => wanted.has(o.id));
  }
  const tiers = new Set((audience.tiers || []).filter(Boolean));
  // Orgs created before verticals existed have no field and are treated as DMOs elsewhere.
  const verticals = new Set((audience.verticals || []).filter(Boolean));
  return orgs.filter((o) => {
    if (o.isDemo === true && !audience.includeDemo) return false;
    if (tiers.size > 0 && !tiers.has(o.tier || '')) return false;
    if (verticals.size > 0 && !verticals.has(o.vertical || 'dmo')) return false;
    return true;
  });
}

/**
 * Resolve the final recipient list. Each person gets one email even if they sit in
 * several selected orgs (first org wins, ordered by org name for stability).
 */
export function buildAudience(
  orgs: AudienceOrg[],
  users: AudienceUser[],
  audience: AdminEmailAudience,
  category: AdminEmailCategory
): AudienceResult {
  const selected = selectOrgs(orgs, audience).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const roles = audience.roleScope === 'admins' ? new Set(['Admin']) : new Set(['Admin', 'User']);
  const usersByOrg = new Map<string, AudienceUser[]>();
  for (const u of users) {
    const list = usersByOrg.get(u.orgId) || [];
    list.push(u);
    usersByOrg.set(u.orgId, list);
  }

  const seen = new Set<string>();
  const recipients: AudienceRecipient[] = [];
  const orgSummaries: AudienceResult['orgs'] = [];
  const skipped = { optedOut: 0, noEmail: 0, duplicate: 0, orgsWithNoRecipients: 0 };

  for (const org of selected) {
    let count = 0;
    const orgUsers = (usersByOrg.get(org.id) || []).filter((u) => roles.has(u.role || ''));
    for (const u of orgUsers) {
      const email = (u.email || '').trim().toLowerCase();
      if (!isValidEmail(email)) {
        skipped.noEmail++;
        continue;
      }
      if (category === 'product' && u.notificationPrefs?.platformUpdates === false) {
        skipped.optedOut++;
        continue;
      }
      if (seen.has(email)) {
        skipped.duplicate++;
        continue;
      }
      seen.add(email);
      recipients.push({
        userId: u.id,
        orgId: org.id,
        orgName: org.name || org.id,
        name: (u.name || '').trim(),
        email,
        role: u.role || '',
      });
      count++;
    }
    if (count === 0) skipped.orgsWithNoRecipients++;
    orgSummaries.push({ id: org.id, name: org.name || org.id, recipientCount: count });
  }

  return { recipients, orgs: orgSummaries, skipped };
}

export function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || '';
}

/** Replace {{first_name}}, {{name}} and {{org_name}}. Unknown tags are left as written. */
export function applyMergeTags(
  template: string,
  r: { name: string; orgName: string },
  escape: (s: string) => string = (s) => s
): string {
  return template.replace(/\{\{\s*(first_name|name|org_name)\s*\}\}/gi, (_m, tag: string) => {
    const key = tag.toLowerCase();
    if (key === 'first_name') return escape(firstName(r.name) || 'there');
    if (key === 'name') return escape(r.name || 'there');
    return escape(r.orgName);
  });
}

/** Plain-text body to email HTML: blank lines become paragraphs, single newlines <br>, URLs links. */
export function bodyToHtml(body: string, linkColor: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const html = linkifyHtml(escapeHtml(para), linkColor).replace(/\n/g, '<br>');
      return `<p style="margin:0 0 16px;line-height:1.6;">${html}</p>`;
    })
    .join('\n');
}

export function validateComposition(input: {
  subject?: unknown;
  body?: unknown;
  category?: unknown;
  replyTo?: unknown;
  roleScope?: unknown;
}): string[] {
  const errors: string[] = [];
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!subject) errors.push('Add a subject.');
  if (subject.length > MAX_SUBJECT_LENGTH) errors.push(`Keep the subject under ${MAX_SUBJECT_LENGTH} characters.`);
  if (/[\r\n]/.test(subject)) errors.push('The subject must be a single line.');
  if (!body) errors.push('Add a message.');
  if (body.length > MAX_BODY_LENGTH) errors.push('The message is too long.');
  if (input.category !== 'service' && input.category !== 'product') errors.push('Choose an email type.');
  if (input.roleScope !== 'admins' && input.roleScope !== 'team') errors.push('Choose who in each organisation receives it.');
  if (input.replyTo != null && input.replyTo !== '' && !isValidEmail(String(input.replyTo))) {
    errors.push('The reply-to address is not a valid email.');
  }
  return errors;
}
