import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countUnique,
  engagementKey,
  rebuildUniqueEngagement,
  uniqueClicksOf,
  uniqueEngagementUpdate,
  uniqueOpensOf,
  type EngagedState,
} from '../unique-engagement-core';

function replay(events: string[]) {
  let state: EngagedState | null = null;
  let opens = 0;
  let clicks = 0;
  for (const e of events) {
    const u = uniqueEngagementUpdate(e, state);
    if (!u) continue;
    opens += u.uniqueOpens;
    clicks += u.uniqueClicks;
    state = u.next;
  }
  return { opens, clicks, state };
}

test('repeat opens count once', () => {
  assert.deepEqual(replay(['open', 'open', 'open']).opens, 1);
});

test('a click counts as an open when no open was tracked, and only once', () => {
  const r = replay(['click', 'open', 'click']);
  assert.equal(r.opens, 1);
  assert.equal(r.clicks, 1);
});

test('open then click adds one of each', () => {
  const r = replay(['open', 'click', 'open', 'click']);
  assert.equal(r.opens, 1);
  assert.equal(r.clicks, 1);
});

test('other event types do not touch unique counts', () => {
  for (const e of ['delivered', 'bounce', 'unsubscribe', 'spam_report']) {
    assert.equal(uniqueEngagementUpdate(e, null), null);
  }
});

test('keys prefer the send-job row, else hash the address without storing it', () => {
  assert.equal(engagementKey('abc', 'x@y.example'), 'r_abc');
  const k = engagementKey(null, 'Jane@Outlet.example ');
  assert.ok(k && k.startsWith('e_'));
  assert.equal(k, engagementKey(null, 'jane@outlet.example'));
  assert.ok(!k!.includes('jane'));
  assert.equal(engagementKey(null, null), null);
  assert.equal(engagementKey(null, 'not-an-email'), null);
});

test('backfill merges row history with events without double counting', () => {
  const state = rebuildUniqueEngagement(
    [
      { id: 'row1', email: 'a@x.example', opened: true, clicked: false },
      { id: 'row2', opened: true, clicked: true }, // network contact: no email on the row
      { id: 'row3', email: 'c@x.example', opened: false, clicked: false },
    ],
    [
      { eventType: 'open', recipientEmail: 'a@x.example' },
      { eventType: 'open', recipientEmail: 'A@x.example' },
      { eventType: 'click', recipientEmail: 'a@x.example' },
      { eventType: 'open' }, // network event, already covered by row2
      { eventType: 'open', recipientEmail: 'c@x.example' },
      { eventType: 'open', recipientEmail: 'legacy@x.example' }, // send with no row
      { eventType: 'delivered', recipientEmail: 'd@x.example' },
    ]
  );
  assert.deepEqual(countUnique(state), { uniqueOpens: 4, uniqueClicks: 2 });
  assert.ok(state.has('r_row1') && state.has('r_row3'));
});

test('display helpers use unique counters, or cap legacy totals at sends', () => {
  assert.equal(uniqueOpensOf({ opens: 16, sends: 14, uniqueOpens: 8 }), 8);
  assert.equal(uniqueOpensOf({ opens: 16, sends: 14 }), 14);
  assert.equal(uniqueClicksOf({ opens: 16, clicks: 20, sends: 14 }), 14);
  assert.equal(uniqueClicksOf({ clicks: 5, uniqueClicks: 3 }), 3);
});
