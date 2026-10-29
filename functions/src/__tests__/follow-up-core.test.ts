import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  addWorkingDays,
  workingDaysSince,
  normaliseOutlet,
  followUpKey,
  engagementUpdateFor,
  buildFollowUpPlan,
  buildFollowUpDraft,
  validateNewValue,
  mailtoHref,
  type SentRecipient,
  type Contact,
} from '../follow-up-core';
import { buildTranquilityDataset } from '../demo-tranquility';

const DAY = 24 * 60 * 60 * 1000;
// Monday 2 November 2026, 09:00 UTC
const MON = Date.UTC(2026, 10, 2, 9, 0, 0);

test('the app copy of follow-up-core is byte-identical to the functions copy', () => {
  const a = fs.readFileSync(path.join(process.cwd(), 'src/follow-up-core.ts'), 'utf8');
  const b = fs.readFileSync(path.join(process.cwd(), '../src/lib/follow-up-core.ts'), 'utf8');
  assert.equal(a, b);
});

test('working days skip weekends', () => {
  const fri = MON + 4 * DAY;
  assert.equal(addWorkingDays(fri, 1), MON + 7 * DAY); // next Monday
  assert.equal(addWorkingDays(MON, 2), MON + 2 * DAY);
  assert.equal(workingDaysSince(fri, fri + 3 * DAY), 1); // Fri -> Mon
  assert.equal(workingDaysSince(MON, MON + DAY - 1), 0);
});

test('outlet names match loosely', () => {
  assert.equal(normaliseOutlet('The Daily Courier'), normaliseOutlet('daily  courier'));
  assert.equal(normaliseOutlet('Coast & Valley Radio'), normaliseOutlet('Coast and Valley Radio'));
  assert.notEqual(normaliseOutlet('The Courier'), normaliseOutlet('Daily Courier'));
});

test('follow-up keys are stable and path-safe', () => {
  assert.equal(followUpKey('orgs/o/outletLists/L1/recipients/R9'), 'L1__R9');
  assert.match(followUpKey('Someone@Example.com'), /^e_[a-z0-9_]+$/);
});

test('a click also counts as the first open, once', () => {
  assert.deepEqual(engagementUpdateFor('click', {}), {
    increment: 'clicks', setFirstOpened: true, setFirstClicked: true, setLastOpened: false, setLastClicked: true, optOut: false,
  });
  const again = engagementUpdateFor('open', { hasFirstOpened: true })!;
  assert.equal(again.setFirstOpened, false);
  assert.equal(again.increment, 'opens');
  assert.equal(engagementUpdateFor('unsubscribe', {})!.optOut, true);
  assert.equal(engagementUpdateFor('delivered', {}), null);
});

function r(id: string, outlet: string, over: Partial<SentRecipient> = {}): SentRecipient {
  return {
    key: `L__${id}`,
    recipientRef: `orgs/o/outletLists/L/recipients/${id}`,
    name: `Person ${id}`,
    email: `${id}@x.example`,
    outlet,
    source: 'customer',
    sentAtMs: MON,
    delivery: 'delivered',
    opens: 0,
    clicks: 0,
    optedOut: false,
    ...over,
  };
}
function c(id: string, outlet: string, over: Partial<Contact> = {}): Contact {
  return { recipientRef: `orgs/o/outletLists/D/recipients/${id}`, name: `Alt ${id}`, email: `${id}@x.example`, outlet, ...over };
}

test('nothing is due before the waiting period', () => {
  const plan = buildFollowUpPlan({ recipients: [r('a', 'A', { opens: 1 }), r('b', 'B')], records: {}, contacts: [c('b2', 'B')], nowMs: MON + DAY });
  assert.ok(plan.rows.every((row) => row.state === 'waiting'));
  assert.equal(plan.counts.alternatives, 0);
  assert.match(plan.summary, /too early/);
});

test('clicked comes due after one working day, opened after two', () => {
  const recipients = [r('a', 'A', { opens: 1, clicks: 1 }), r('b', 'B', { opens: 2 })];
  const day1 = buildFollowUpPlan({ recipients, records: {}, contacts: [], nowMs: MON + DAY + 1 });
  assert.equal(day1.rows.find((x) => x.recipient.key === 'L__a')!.state, 'due');
  assert.equal(day1.rows.find((x) => x.recipient.key === 'L__b')!.state, 'waiting');
  const day2 = buildFollowUpPlan({ recipients, records: {}, contacts: [], nowMs: MON + 2 * DAY + 1 });
  assert.equal(day2.counts.clickedDue, 1);
  assert.equal(day2.counts.openedDue, 1);
  assert.equal(day2.rows[0].category, 'clicked'); // clicked first
});

test('a non-opener at an outlet nobody engaged with gets one alternative, ranked by fit', () => {
  const plan = buildFollowUpPlan({
    recipients: [r('a', 'Daily Courier', { editorialFocus: ['Travel'] }), r('b', 'The Daily Courier')],
    records: {},
    contacts: [
      c('x', 'Daily Courier', { editorialFocus: ['Business'] }),
      c('y', 'daily courier', { editorialFocus: ['Travel'], relationshipStatus: 'published' }),
    ],
    nowMs: MON + 3 * DAY,
  });
  const withAlt = plan.rows.filter((row) => row.alternative);
  assert.equal(withAlt.length, 1, 'one alternative per outlet');
  assert.equal(withAlt[0].alternative!.contact.name, 'Alt y');
  assert.equal(withAlt[0].alternative!.otherCount, 1);
  assert.ok(withAlt[0].alternative!.reasons.some((s) => /Travel/.test(s)));
});

test('no alternative when someone else at the outlet opened it', () => {
  const plan = buildFollowUpPlan({
    recipients: [r('a', 'Coastline'), r('b', 'Coastline', { opens: 1 })],
    records: {},
    contacts: [c('x', 'Coastline')],
    nowMs: MON + 3 * DAY,
  });
  const a = plan.rows.find((x) => x.recipient.key === 'L__a')!;
  assert.equal(a.alternative, null);
  assert.equal(a.outletEngaged, true);
});

test('contacts already sent the release, or marked do not contact, are never suggested', () => {
  const plan = buildFollowUpPlan({
    recipients: [r('a', 'Wanderlist'), r('b', 'Other')],
    records: {},
    contacts: [
      { ...c('b', 'Wanderlist'), recipientRef: 'orgs/o/outletLists/L/recipients/b' },
      c('dnc', 'Wanderlist', { doNotContact: true }),
      c('noemail', 'Wanderlist', { email: '' }),
    ],
    nowMs: MON + 3 * DAY,
  });
  assert.equal(plan.counts.alternatives, 0);
});

test('an outlet already approached is not offered again', () => {
  const plan = buildFollowUpPlan({
    recipients: [r('a', 'Wanderlist')],
    records: { L__a: { status: 'alternative_sent', updatedAtMs: MON + DAY, alternativeRecipientRef: 'orgs/o/outletLists/D/recipients/x' } },
    contacts: [c('x', 'Wanderlist'), c('z', 'Wanderlist')],
    nowMs: MON + 3 * DAY,
  });
  assert.equal(plan.counts.alternatives, 0);
  assert.equal(plan.rows[0].state, 'done');
});

test('after a follow-up with no reply for three working days, offer an alternative', () => {
  const recipients = [r('a', 'Weekend Traveller', { opens: 2 })];
  const contacts = [c('x', 'The Weekend Traveller')];
  const records = { L__a: { status: 'followed_up' as const, updatedAtMs: MON + 2 * DAY, count: 1 } };
  const early = buildFollowUpPlan({ recipients, records, contacts, nowMs: MON + 3 * DAY });
  assert.equal(early.rows[0].alternative, null);
  assert.equal(early.rows[0].atFollowUpLimit, true);
  const later = buildFollowUpPlan({ recipients, records, contacts, nowMs: MON + 7 * DAY + 1 });
  assert.equal(later.rows[0].alternative!.why, 'no_reply_after_follow_up');
  const replied = buildFollowUpPlan({ recipients, records: { L__a: { ...records.L__a, outcome: 'replied' as const } }, contacts, nowMs: MON + 7 * DAY + 1 });
  assert.equal(replied.rows[0].alternative, null);
});

test('bounces and opt-outs are closed and never suggested', () => {
  const plan = buildFollowUpPlan({
    recipients: [r('a', 'A', { delivery: 'bounced' }), r('b', 'B', { opens: 1, optedOut: true })],
    records: {},
    contacts: [c('x', 'A')],
    nowMs: MON + 3 * DAY,
  });
  assert.deepEqual(plan.rows.map((x) => x.closedReason), ['bounced', 'opted_out']);
  assert.equal(plan.counts.alternatives, 0);
  assert.equal(plan.counts.closed, 2);
});

test('network contacts are counted but never actionable', () => {
  const plan = buildFollowUpPlan({
    recipients: [r('n', 'Some Desk', { source: 'network', opens: 1, email: undefined, recipientRef: undefined })],
    records: {},
    contacts: [c('x', 'Some Desk')],
    nowMs: MON + 3 * DAY,
  });
  assert.equal(plan.counts.network, 1);
  assert.equal(plan.counts.openedDue, 0);
  assert.equal(plan.counts.alternatives, 0);
});

test('after ten working days the release is no longer timely', () => {
  const plan = buildFollowUpPlan({ recipients: [r('a', 'A', { opens: 1 })], records: {}, contacts: [], nowMs: MON + 15 * DAY });
  assert.equal(plan.stale, true);
  assert.equal(plan.rows[0].state, 'stale');
});

test('the draft is personal, carries the new value and never mentions tracking', () => {
  const d = buildFollowUpDraft({
    recipientName: 'Hannah Okafor',
    headline: 'Winter steam specials',
    sentAtMs: MON,
    hook: 'interview',
    newValue: 'Our chief executive is free on Thursday',
    senderName: 'Eleanor Hart',
    orgName: 'Visit Tranquility',
  });
  assert.equal(d.subject, 'Re: Winter steam specials');
  assert.match(d.body, /^Hi Hannah,/);
  assert.match(d.body, /Monday 2 November/);
  assert.match(d.body, /free on Thursday\./);
  assert.match(d.body, /Eleanor Hart\nVisit Tranquility$/);
  assert.doesNotMatch(d.body, /open|click|track/i);
  assert.match(mailtoHref('a@b.example', d.subject, d.body), /^mailto:a%40b\.example\?subject=Re%3A/);
});

test('a follow-up needs something new', () => {
  assert.ok(validateNewValue('just checking'));
  assert.equal(validateNewValue('Bookings are up 14% on last October.'), null);
});

test('the demo send covers every follow-up case', () => {
  const ds = buildTranquilityDataset(MON + 5 * DAY);
  const job = ds.sendJobs[0];
  const contacts: Contact[] = ds.outletLists.flatMap((l) =>
    l.recipients.map((x) => ({ ...x, recipientRef: `__ORG__/outletLists/${l.id}/recipients/${x.id}` }))
  );
  const recipients: SentRecipient[] = job.recipients.map((row: any) => ({
    key: followUpKey(row.recipientRef),
    recipientRef: row.recipientRef,
    name: row.name,
    email: row.email,
    outlet: row.outlet,
    source: 'customer',
    sentAtMs: (job.completedAt as Date).getTime(),
    delivery: row.deliveryStatus === 'bounced_hard' ? 'bounced' : 'delivered',
    opens: row.opens,
    clicks: row.clicks,
    optedOut: false,
  }));
  const records = Object.fromEntries(
    ds.followUps.map((f: any) => [f.id, { status: f.status, outcome: f.outcome, updatedAtMs: (f.updatedAt as Date).getTime() }])
  );
  const plan = buildFollowUpPlan({ recipients, records, contacts, nowMs: MON + 5 * DAY });
  assert.ok(plan.counts.clickedDue >= 2);
  assert.ok(plan.counts.openedDue >= 2);
  assert.equal(plan.counts.alternatives, 3); // Daily Courier, Wanderlist, Business Review
  assert.equal(plan.counts.closed, 1);
  assert.equal(plan.counts.done, 2);
  const names = plan.rows.filter((x) => x.alternative).map((x) => x.alternative!.contact.name).sort();
  assert.deepEqual(names, ['Jess Holloway', 'Kofi Mensah', 'Ruth Adeyemi']);
  for (const e of ds.events) assert.ok((e.timestamp as Date).getTime() < MON + 5 * DAY);
});
