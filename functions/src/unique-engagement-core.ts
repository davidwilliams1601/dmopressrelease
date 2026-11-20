/**
 * Unique engagement: each recipient counts once towards a release's (or member
 * email's) opens and clicks, however many times they open or click.
 *
 * The raw `opens` / `clicks` counters keep counting every event, so "opened 3 times"
 * still works. Rates are built from `uniqueOpens` / `uniqueClicks`, so an open rate
 * can never pass 100%.
 *
 * Each recipient's state lives in a marker doc ({release|partnerEmail}/uniqueEngagement/{key}),
 * written only by Cloud Functions and not readable by clients. The key is the send-job
 * recipient row ID when there is one, otherwise a hash of the address, so no raw email
 * is stored.
 */
import { createHash } from 'crypto';

export type EngagedState = { opened?: boolean; clicked?: boolean };

export type UniqueEngagementUpdate = {
  uniqueOpens: 0 | 1;
  uniqueClicks: 0 | 1;
  next: EngagedState;
};

export function hashEmailKey(email: string): string {
  return 'e_' + createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 40);
}

/** Marker key for one recipient. Null when the event can't be tied to anyone. */
export function engagementKey(sendJobRecipientId?: string | null, email?: string | null): string | null {
  if (sendJobRecipientId) return `r_${sendJobRecipientId}`;
  if (email && email.includes('@')) return hashEmailKey(email);
  return null;
}

/**
 * What one open/click event adds to the unique counters. A click counts as an open
 * too, because image-blocking clients often click without registering an open.
 * Returns null for event types that don't affect unique counts, or for repeats.
 */
export function uniqueEngagementUpdate(eventType: string, existing: EngagedState | null): UniqueEngagementUpdate | null {
  const was = existing || {};
  if (eventType === 'open') {
    if (was.opened) return null;
    return { uniqueOpens: 1, uniqueClicks: 0, next: { ...was, opened: true } };
  }
  if (eventType === 'click') {
    if (was.clicked) return null;
    return { uniqueOpens: was.opened ? 0 : 1, uniqueClicks: 1, next: { opened: true, clicked: true } };
  }
  return null;
}

/**
 * Rebuild per-recipient state from history, for the one-off backfill.
 * - rows: send-job recipient rows for the release (first-open / first-click timestamps,
 *   plus the email snapshot on the org's own contacts).
 * - events: stored open/click events. Network contacts' events carry no email, so
 *   they are covered by their rows instead.
 */
export function rebuildUniqueEngagement(
  rows: Array<{ id: string; email?: string | null; opened: boolean; clicked: boolean }>,
  events: Array<{ eventType: string; recipientEmail?: string | null }>
): Map<string, EngagedState> {
  const state = new Map<string, EngagedState>();
  const rowKeyByEmail = new Map<string, string>();
  const apply = (key: string, eventType: string) => {
    const u = uniqueEngagementUpdate(eventType, state.get(key) || null);
    if (u) state.set(key, u.next);
  };
  for (const r of rows) {
    const key = engagementKey(r.id, null)!;
    if (r.email) rowKeyByEmail.set(r.email.trim().toLowerCase(), key);
    if (r.opened) apply(key, 'open');
    if (r.clicked) apply(key, 'click');
  }
  for (const e of events) {
    if (e.eventType !== 'open' && e.eventType !== 'click') continue;
    if (!e.recipientEmail) continue;
    const key = rowKeyByEmail.get(e.recipientEmail.trim().toLowerCase()) || engagementKey(null, e.recipientEmail);
    if (key) apply(key, e.eventType);
  }
  return state;
}

export function countUnique(state: Map<string, EngagedState>): { uniqueOpens: number; uniqueClicks: number } {
  let uniqueOpens = 0;
  let uniqueClicks = 0;
  for (const s of state.values()) {
    if (s.opened) uniqueOpens++;
    if (s.clicked) uniqueClicks++;
  }
  return { uniqueOpens, uniqueClicks };
}

/**
 * Unique opens for display and rates. Releases sent before unique counting existed
 * (and not yet backfilled) fall back to total opens, capped at the number sent.
 */
export function uniqueOpensOf(x: { opens?: number; sends?: number; uniqueOpens?: number }): number {
  if (typeof x.uniqueOpens === 'number') return x.uniqueOpens;
  const opens = x.opens || 0;
  return typeof x.sends === 'number' ? Math.min(opens, x.sends) : opens;
}

export function uniqueClicksOf(x: { opens?: number; clicks?: number; sends?: number; uniqueOpens?: number; uniqueClicks?: number }): number {
  if (typeof x.uniqueClicks === 'number') return x.uniqueClicks;
  return Math.min(x.clicks || 0, uniqueOpensOf(x));
}
