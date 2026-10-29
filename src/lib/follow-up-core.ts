/**
 * Follow-up intelligence: the pure half.
 *
 * After a release goes out, the useful question is not "how many opened" but "who is
 * worth a second, personal touch, and who should we stop waiting on". This module
 * answers that deterministically from what Press Pilot already knows about each
 * recipient (delivery, opens, clicks, opt-outs) plus what the team has logged.
 *
 * The rules, in working days from the send:
 *  - Clicked, no reply      -> personal follow-up after 1 working day (highest priority).
 *  - Opened, no reply       -> personal follow-up after 2 working days.
 *  - Not opened             -> after 2 working days, if nobody at that outlet has engaged,
 *                              suggest ONE other contact at the same outlet. A non-open is
 *                              a better reason to change contact than to resend the same
 *                              email to the same person.
 *  - Followed up, still no reply after a further 3 working days -> offer an alternative
 *                              contact at the same outlet.
 *  - Bounced, failed, unsubscribed or spam-reported -> never follow up.
 *  - More than 10 working days after the send, follow-ups are marked as no longer timely.
 *
 * Nothing here sends anything. It only says what is worth doing; a person decides.
 *
 * Two byte-identical copies live in functions/src and src/lib, guarded by a test.
 * No imports, so both builds can compile it unchanged.
 */

export const FOLLOW_UP_RULES = {
  clickedAfterWorkingDays: 1,
  openedAfterWorkingDays: 2,
  notOpenedAfterWorkingDays: 2,
  alternativeAfterFollowUpWorkingDays: 3,
  staleAfterWorkingDays: 10,
  /** Follow-ups per journalist per release before an explicit override is needed. */
  defaultFollowUpLimit: 1,
} as const;

export type FollowUpStatus = 'followed_up' | 'off_platform' | 'no_follow_up' | 'alternative_sent';
export type FollowUpOutcome = 'replied' | 'interview' | 'coverage' | 'declined';
export type FollowUpChannel = 'email' | 'phone' | 'linkedin' | 'whatsapp' | 'in_person' | 'other';
export type FollowUpHook = 'new_angle' | 'interview' | 'images' | 'data' | 'deadline';

/** Statuses a team member may write directly. `alternative_sent` is server-only. */
export const CLIENT_FOLLOW_UP_STATUSES: FollowUpStatus[] = ['followed_up', 'off_platform', 'no_follow_up'];

export const FOLLOW_UP_CHANNEL_LABELS: Record<FollowUpChannel, string> = {
  email: 'Email',
  phone: 'Phone',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  in_person: 'In person',
  other: 'Other',
};

export const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  replied: 'Replied',
  interview: 'Interview agreed',
  coverage: 'Coverage',
  declined: 'Declined',
};

export const FOLLOW_UP_HOOKS: Array<{ id: FollowUpHook; label: string; leadIn: string; placeholder: string }> = [
  { id: 'new_angle', label: 'A new angle', leadIn: 'There may also be an angle for you here. ', placeholder: 'e.g. Three of the producers are under 30 and took over family farms this year.' },
  { id: 'interview', label: 'An interview offer', leadIn: 'We can also offer an interview. ', placeholder: 'e.g. Our chief executive is free for a call this week.' },
  { id: 'images', label: 'New images or video', leadIn: 'We now have images available. ', placeholder: 'e.g. High-resolution photos of the trail are ready to download.' },
  { id: 'data', label: 'A new data point', leadIn: 'There is also a new figure that may help. ', placeholder: 'e.g. Bookings are up 14% on last October.' },
  { id: 'deadline', label: 'A timing hook', leadIn: '', placeholder: 'e.g. The launch weekend is 14 November, so there is still time for a preview.' },
];

// ---------------------------------------------------------------------------
// Working days (Monday to Friday, UTC calendar; bank holidays are not modelled)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function isWeekday(ms: number): boolean {
  const d = new Date(ms).getUTCDay();
  return d !== 0 && d !== 6;
}

/** The moment `n` working days after `fromMs` (same time of day). */
export function addWorkingDays(fromMs: number, n: number): number {
  let t = fromMs;
  let added = 0;
  while (added < n) {
    t += DAY_MS;
    if (isWeekday(t)) added++;
  }
  return t;
}

/** Whole working days elapsed since `fromMs`. */
export function workingDaysSince(fromMs: number, nowMs: number): number {
  if (nowMs <= fromMs) return 0;
  let count = 0;
  let t = fromMs + DAY_MS;
  while (t <= nowMs) {
    if (isWeekday(t)) count++;
    t += DAY_MS;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Outlet matching
// ---------------------------------------------------------------------------

/** "The Daily Courier", "daily courier " and "Daily-Courier" all match. */
export function normaliseOutlet(outlet: string | undefined | null): string {
  return String(outlet || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/\s+/g, ' ');
}

/** Stable Firestore doc ID for a recipient's follow-up record. */
export function followUpKey(recipientRefOrEmail: string): string {
  const m = /outletLists\/([^/]+)\/recipients\/([^/]+)$/.exec(recipientRefOrEmail);
  if (m) return `${m[1]}__${m[2]}`;
  return 'e_' + recipientRefOrEmail.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 120);
}

// ---------------------------------------------------------------------------
// Engagement written onto each send-job recipient row by the SendGrid webhook
// ---------------------------------------------------------------------------

export type EngagementEventType = 'open' | 'click' | 'unsubscribe' | 'spam_report';

export type EngagementUpdate = {
  increment: 'opens' | 'clicks' | null;
  setFirstOpened: boolean;
  setFirstClicked: boolean;
  setLastOpened: boolean;
  setLastClicked: boolean;
  optOut: boolean;
};

/**
 * What a single tracked event changes on a recipient row. A click implies the email
 * was opened, even when the open pixel was blocked, so it also sets the first-open time.
 */
export function engagementUpdateFor(
  eventType: string,
  existing: { hasFirstOpened?: boolean; hasFirstClicked?: boolean }
): EngagementUpdate | null {
  const base: EngagementUpdate = {
    increment: null,
    setFirstOpened: false,
    setFirstClicked: false,
    setLastOpened: false,
    setLastClicked: false,
    optOut: false,
  };
  switch (eventType) {
    case 'open':
      return { ...base, increment: 'opens', setFirstOpened: !existing.hasFirstOpened, setLastOpened: true };
    case 'click':
      return {
        ...base,
        increment: 'clicks',
        setFirstClicked: !existing.hasFirstClicked,
        setLastClicked: true,
        setFirstOpened: !existing.hasFirstOpened,
      };
    case 'unsubscribe':
    case 'spam_report':
      return { ...base, optOut: true };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export type SentRecipient = {
  key: string;
  recipientRef?: string;
  name: string;
  email?: string;
  outlet: string;
  position?: string;
  /** 'network' = anonymised Press Pilot network contact; the team cannot see the address. */
  source: 'customer' | 'network';
  sentAtMs: number;
  delivery: 'delivered' | 'pending' | 'failed' | 'bounced' | 'suppressed';
  opens: number;
  clicks: number;
  optedOut: boolean;
  editorialFocus?: string[];
  topics?: string[];
};

export type FollowUpRecord = {
  status: FollowUpStatus;
  outcome?: FollowUpOutcome | null;
  channel?: FollowUpChannel | null;
  count?: number;
  updatedAtMs: number;
  alternativeRecipientRef?: string;
  alternativeName?: string;
};

export type Contact = {
  recipientRef: string;
  name: string;
  email?: string;
  outlet: string;
  position?: string;
  editorialFocus?: string[];
  topics?: string[];
  relationshipStatus?: string;
  doNotContact?: boolean;
};

export type AlternativeSuggestion = {
  contact: Contact;
  reasons: string[];
  /** Further eligible contacts at the outlet beyond the one suggested. */
  otherCount: number;
  why: 'not_opened' | 'no_reply_after_follow_up';
};

export type FollowUpCategory = 'clicked' | 'opened' | 'not_opened' | 'closed';
export type FollowUpState = 'waiting' | 'due' | 'done' | 'stale' | 'closed';

export type FollowUpRow = {
  recipient: SentRecipient;
  category: FollowUpCategory;
  state: FollowUpState;
  dueAtMs: number;
  closedReason?: 'bounced' | 'not_delivered' | 'opted_out';
  record?: FollowUpRecord;
  /** Opened three or more times: interest, but give them room. */
  openedRepeatedly: boolean;
  /** True when someone else at the same outlet has opened or clicked. */
  outletEngaged: boolean;
  alternative: AlternativeSuggestion | null;
  /** True when the default one-follow-up limit has been reached. */
  atFollowUpLimit: boolean;
};

export type FollowUpPlan = {
  rows: FollowUpRow[];
  counts: {
    clickedDue: number;
    openedDue: number;
    notOpenedDue: number;
    alternatives: number;
    waiting: number;
    done: number;
    closed: number;
    network: number;
  };
  firstSentAtMs: number | null;
  workingDaysSinceSend: number;
  stale: boolean;
  summary: string;
};

const RELATIONSHIP_BONUS: Record<string, { score: number; reason: string }> = {
  published: { score: 2, reason: 'Has covered your stories before' },
  responded: { score: 2, reason: 'Has replied to you before' },
  known: { score: 1, reason: 'Already known to your team' },
};

function overlap(a: string[] | undefined, b: string[]): string[] {
  if (!a || a.length === 0 || b.length === 0) return [];
  const set = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => set.has(x.toLowerCase()));
}

/** Rank the eligible contacts at one outlet against the original recipient and the release. */
export function rankAlternatives(
  candidates: Contact[],
  original: { editorialFocus?: string[]; topics?: string[] },
  releaseFocus: { editorialFocus?: string[]; topics?: string[] }
): Array<{ contact: Contact; score: number; reasons: string[] }> {
  const focus = Array.from(new Set([...(original.editorialFocus || []), ...(releaseFocus.editorialFocus || [])]));
  const topics = Array.from(new Set([...(original.topics || []), ...(releaseFocus.topics || [])]));
  return candidates
    .map((contact) => {
      const reasons: string[] = [];
      const f = overlap(contact.editorialFocus, focus);
      const t = overlap(contact.topics, topics);
      let score = f.length * 3 + t.length;
      if (f.length > 0) reasons.push(`Covers ${f.slice(0, 2).join(' and ')}`);
      else if (t.length > 0) reasons.push(`Writes about ${t.slice(0, 2).join(' and ')}`);
      const rel = RELATIONSHIP_BONUS[contact.relationshipStatus || ''];
      if (rel) {
        score += rel.score;
        reasons.push(rel.reason);
      }
      if (reasons.length === 0) reasons.push('Same outlet, in your contact lists');
      return { contact, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.contact.name.localeCompare(b.contact.name));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildFollowUpPlan(input: {
  recipients: SentRecipient[];
  records: Record<string, FollowUpRecord>;
  contacts: Contact[];
  releaseFocus?: { editorialFocus?: string[]; topics?: string[] };
  nowMs: number;
}): FollowUpPlan {
  const { recipients, records, contacts, nowMs } = input;
  const releaseFocus = input.releaseFocus || {};
  const R = FOLLOW_UP_RULES;

  const firstSentAtMs = recipients.length ? Math.min(...recipients.map((r) => r.sentAtMs)) : null;
  const daysSinceSend = firstSentAtMs === null ? 0 : workingDaysSince(firstSentAtMs, nowMs);

  // Everyone who has already been sent this release, so we never suggest them again.
  const sentRefs = new Set<string>();
  const sentEmails = new Set<string>();
  for (const r of recipients) {
    if (r.recipientRef) sentRefs.add(r.recipientRef);
    if (r.email) sentEmails.add(r.email.toLowerCase());
  }
  for (const rec of Object.values(records)) {
    if (rec.alternativeRecipientRef) sentRefs.add(rec.alternativeRecipientRef);
  }

  const byOutlet = new Map<string, SentRecipient[]>();
  for (const r of recipients) {
    const k = normaliseOutlet(r.outlet);
    if (!k) continue;
    const list = byOutlet.get(k) || [];
    list.push(r);
    byOutlet.set(k, list);
  }

  const contactsByOutlet = new Map<string, Contact[]>();
  for (const c of contacts) {
    const k = normaliseOutlet(c.outlet);
    if (!k || c.doNotContact || !c.email) continue;
    if (sentRefs.has(c.recipientRef) || sentEmails.has(c.email.toLowerCase())) continue;
    const list = contactsByOutlet.get(k) || [];
    list.push(c);
    contactsByOutlet.set(k, list);
  }

  const outletEngaged = (k: string) =>
    (byOutlet.get(k) || []).some((r) => r.opens > 0 || r.clicks > 0 || !!records[r.key]?.outcome);
  const outletAlreadyApproached = (k: string) =>
    (byOutlet.get(k) || []).some((r) => records[r.key]?.status === 'alternative_sent');

  const outletsGivenAlternative = new Set<string>();

  const rows: FollowUpRow[] = recipients.map((recipient) => {
    const record = records[recipient.key];
    const outletKey = normaliseOutlet(recipient.outlet);
    const engagedHere = outletKey ? outletEngaged(outletKey) : false;
    const base = {
      recipient,
      record,
      openedRepeatedly: recipient.opens >= 3,
      outletEngaged: engagedHere,
      alternative: null as AlternativeSuggestion | null,
      atFollowUpLimit: (record?.count || 0) >= R.defaultFollowUpLimit,
    };

    if (recipient.delivery === 'bounced' || recipient.delivery === 'failed' || recipient.delivery === 'suppressed') {
      return {
        ...base,
        category: 'closed' as const,
        state: 'closed' as const,
        dueAtMs: recipient.sentAtMs,
        closedReason: recipient.delivery === 'bounced' ? ('bounced' as const) : ('not_delivered' as const),
      };
    }
    if (recipient.optedOut) {
      return { ...base, category: 'closed' as const, state: 'closed' as const, dueAtMs: recipient.sentAtMs, closedReason: 'opted_out' as const };
    }

    const category: FollowUpCategory = recipient.clicks > 0 ? 'clicked' : recipient.opens > 0 ? 'opened' : 'not_opened';
    const wait =
      category === 'clicked' ? R.clickedAfterWorkingDays : category === 'opened' ? R.openedAfterWorkingDays : R.notOpenedAfterWorkingDays;
    const dueAtMs = addWorkingDays(recipient.sentAtMs, wait);

    let state: FollowUpState;
    if (record && (record.outcome || record.status)) state = 'done';
    else if (nowMs < dueAtMs) state = 'waiting';
    else if (workingDaysSince(recipient.sentAtMs, nowMs) > R.staleAfterWorkingDays) state = 'stale';
    else state = 'due';

    let alternative: AlternativeSuggestion | null = null;
    const pool = outletKey ? contactsByOutlet.get(outletKey) || [] : [];
    const canSuggest =
      recipient.source === 'customer' &&
      pool.length > 0 &&
      outletKey &&
      !outletsGivenAlternative.has(outletKey) &&
      !outletAlreadyApproached(outletKey) &&
      !record?.outcome &&
      nowMs >= dueAtMs &&
      workingDaysSince(recipient.sentAtMs, nowMs) <= R.staleAfterWorkingDays;

    if (canSuggest) {
      let why: AlternativeSuggestion['why'] | null = null;
      if (category === 'not_opened' && !engagedHere && (!record || record.status === 'off_platform')) {
        why = 'not_opened';
      } else if (
        record?.status === 'followed_up' &&
        nowMs >= addWorkingDays(record.updatedAtMs, R.alternativeAfterFollowUpWorkingDays)
      ) {
        why = 'no_reply_after_follow_up';
      }
      if (why) {
        const ranked = rankAlternatives(pool, recipient, releaseFocus);
        alternative = { contact: ranked[0].contact, reasons: ranked[0].reasons, otherCount: ranked.length - 1, why };
        outletsGivenAlternative.add(outletKey);
      }
    }

    return { ...base, category, state, dueAtMs, alternative };
  });

  const order: Record<FollowUpCategory, number> = { clicked: 0, opened: 1, not_opened: 2, closed: 3 };
  const stateOrder: Record<FollowUpState, number> = { due: 0, waiting: 1, stale: 2, done: 3, closed: 4 };
  rows.sort(
    (a, b) =>
      order[a.category] - order[b.category] ||
      stateOrder[a.state] - stateOrder[b.state] ||
      a.recipient.outlet.localeCompare(b.recipient.outlet) ||
      a.recipient.name.localeCompare(b.recipient.name)
  );

  const isActionable = (r: FollowUpRow) => r.recipient.source === 'customer' && r.state === 'due';
  const counts = {
    clickedDue: rows.filter((r) => r.category === 'clicked' && isActionable(r)).length,
    openedDue: rows.filter((r) => r.category === 'opened' && isActionable(r)).length,
    notOpenedDue: rows.filter((r) => r.category === 'not_opened' && isActionable(r)).length,
    alternatives: rows.filter((r) => r.alternative).length,
    waiting: rows.filter((r) => r.state === 'waiting').length,
    done: rows.filter((r) => r.state === 'done').length,
    closed: rows.filter((r) => r.state === 'closed').length,
    network: rows.filter((r) => r.recipient.source === 'network').length,
  };

  const stale = daysSinceSend > R.staleAfterWorkingDays;
  const parts: string[] = [];
  const engagedDue = counts.clickedDue + counts.openedDue;
  if (engagedDue > 0) {
    parts.push(`${plural(engagedDue, 'journalist has', 'journalists have')} opened this without a reply yet`);
  }
  if (counts.alternatives > 0) {
    parts.push(`${plural(counts.alternatives, 'outlet has', 'outlets have')} another contact worth trying`);
  }
  let summary: string;
  if (recipients.length === 0) summary = 'No recipients recorded for this release yet.';
  else if (stale) summary = 'This release went out more than two weeks ago, so new follow-ups are unlikely to land.';
  else if (parts.length > 0) summary = parts.join(', and ') + '.';
  else if (counts.waiting > 0) summary = 'It is too early to follow up. Suggestions appear after two working days.';
  else summary = 'Nothing needs following up right now.';

  return { rows, counts, firstSentAtMs, workingDaysSinceSend: daysSinceSend, stale, summary };
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export function firstNameOf(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

/**
 * A short personal follow-up. Deliberately never mentions that the email was opened or
 * clicked: journalists do not need to know they are being tracked.
 */
export function buildFollowUpDraft(input: {
  recipientName: string;
  headline: string;
  sentAtMs: number;
  hook: FollowUpHook;
  newValue: string;
  senderName?: string;
  orgName?: string;
}): { subject: string; body: string } {
  const hook = FOLLOW_UP_HOOKS.find((h) => h.id === input.hook) || FOLLOW_UP_HOOKS[0];
  const when = new Date(input.sentAtMs).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/London',
  });
  let value = input.newValue.trim().replace(/\s+/g, ' ');
  if (value && !/[.!?]$/.test(value)) value += '.';
  const signOff = [input.senderName, input.orgName].filter((s) => s && s.trim()).join('\n');
  const body = [
    `Hi ${firstNameOf(input.recipientName)},`,
    '',
    `I sent you our story "${input.headline}" on ${when}. ${hook.leadIn}${value}`,
    '',
    'Would it be of interest? I can send anything else you need.',
    '',
    signOff ? `Best wishes,\n${signOff}` : 'Best wishes',
  ].join('\n');
  return { subject: `Re: ${input.headline}`, body };
}

/** A mailto link, so the follow-up goes from the sender's own mailbox. */
export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** A follow-up must carry something new. */
export function validateNewValue(text: string): string | null {
  const t = text.trim();
  if (t.length < 15) return 'Add one sentence of something new: an angle, an interview offer, images, a figure or a deadline.';
  if (t.length > 400) return 'Keep it to one or two sentences.';
  return null;
}
