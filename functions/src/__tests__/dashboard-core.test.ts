import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildAttentionItems,
  buildOutcomeChain,
  comparePeriods,
  describePeerBenchmark,
  formatDelta,
  peerBenchmark,
} from '../dashboard-core';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 20);

test('the app copy of dashboard-core is byte-identical to the functions copy', () => {
  const a = fs.readFileSync(path.join(process.cwd(), 'src/dashboard-core.ts'), 'utf8');
  const b = fs.readFileSync(path.join(process.cwd(), '../src/lib/dashboard-core.ts'), 'utf8');
  assert.equal(a, b);
});

test('attention: counts each queue, drops zeros, respects holding text and approval', () => {
  const items = buildAttentionItems({
    nowMs: NOW,
    releases: [
      { id: 'r1', status: 'Ready', atMs: NOW },
      { id: 'r2', status: 'Ready', hasHoldingText: true, atMs: NOW },
      { id: 'r3', status: 'Draft', approvalStatus: 'pending', atMs: NOW },
      { id: 'r4', status: 'Sent', atMs: NOW - 10 * DAY },
      { id: 'r5', status: 'Sent', atMs: NOW - 10 * DAY },
      { id: 'r6', status: 'Sent', atMs: NOW - 2 * DAY },
      { id: 'r7', status: 'Sent', atMs: NOW - 90 * DAY },
    ],
    submissions: [{ id: 's1', status: 'submitted', atMs: NOW }, { id: 's2', status: 'used', atMs: NOW }],
    opportunities: [{ id: 'o1', status: 'new', atMs: NOW }, { id: 'o2', status: 'dismissed', atMs: NOW }],
    coverage: [{ id: 'c1', releaseId: 'r4', publishedAtMs: NOW - 5 * DAY }],
  });
  const byKey = Object.fromEntries(items.map((i) => [i.key, i.count]));
  assert.deepEqual(byKey, {
    ready_to_send: 1,
    awaiting_approval: 1,
    holding_text: 1,
    stories_to_review: 1,
    new_opportunities: 1,
    coverage_to_log: 1, // r5 only: r4 has coverage, r6 too recent, r7 too old
  });
  assert.equal(items.find((i) => i.key === 'ready_to_send')!.label, '1 approved release ready to send');
});

test('attention: nothing waiting means an empty list, and vertical labels are used', () => {
  assert.deepEqual(buildAttentionItems({ nowMs: NOW, releases: [], submissions: [], opportunities: [], coverage: [] }), []);
  const items = buildAttentionItems({
    nowMs: NOW,
    releases: [],
    submissions: [{ id: 's', status: 'submitted', atMs: NOW }, { id: 't', status: 'submitted', atMs: NOW }],
    opportunities: [],
    coverage: [],
    labels: { stories: 'school stories' },
  });
  assert.equal(items[0].label, '2 school stories awaiting review');
});

test('outcome chain dates placements by the article and counts opportunity-to-release', () => {
  const chain = buildOutcomeChain({
    startMs: NOW - 30 * DAY,
    endMs: NOW,
    releases: [
      { id: 'r1', status: 'Sent', atMs: NOW - 40 * DAY },
      { id: 'r2', status: 'Sent', atMs: NOW - 5 * DAY },
      { id: 'r3', status: 'Draft', atMs: NOW - 5 * DAY },
    ],
    submissions: [{ id: 's1', status: 'used', atMs: NOW - 3 * DAY }, { id: 's2', status: 'used', atMs: NOW - 60 * DAY }],
    opportunities: [
      { id: 'o1', status: 'acted_on', actedOnReleaseId: 'r3', atMs: NOW - 4 * DAY },
      { id: 'o2', status: 'acted_on', atMs: NOW - 4 * DAY },
    ],
    coverage: [
      { id: 'c1', releaseId: 'r1', publishedAtMs: NOW - 20 * DAY },
      { id: 'c2', releaseId: 'r1', publishedAtMs: NOW - 19 * DAY },
      { id: 'c3', releaseId: null, publishedAtMs: NOW - 2 * DAY },
    ],
  });
  assert.deepEqual(chain, {
    storiesReceived: 1,
    releasesSent: 1,
    releasesPlaced: 1, // r1 was sent before the period but placed inside it
    placements: 3,
    opportunitiesActedOn: 2,
    opportunitiesBecameReleases: 1,
  });
});

test('period comparison never divides by zero', () => {
  assert.equal(comparePeriods(4, 0).pctChange, null);
  assert.equal(formatDelta(comparePeriods(4, 0)), 'up from 0 in the previous period');
  assert.equal(formatDelta(comparePeriods(6, 4)), 'up 50% on the previous period (4)');
  assert.equal(formatDelta(comparePeriods(2, 2)), 'same as the previous period');
});

test('peer benchmark is withheld below five peers', () => {
  const b = peerBenchmark(3, [1, 2, 4, 5]);
  assert.equal(b.available, false);
  assert.match(describePeerBenchmark(b, 'placements'), /at least 5 .* there are 4 so far/);
});

test('peer benchmark reports median, quartiles and position only', () => {
  const b = peerBenchmark(12, [2, 4, 6, 8, 10]);
  assert.ok(b.available);
  if (!b.available) return;
  assert.equal(b.median, 6);
  assert.equal(b.lowerQuartile, 4);
  assert.equal(b.upperQuartile, 8);
  assert.equal(b.position, 'above');
  assert.deepEqual(Object.keys(b).sort(), ['available', 'lowerQuartile', 'median', 'minPeers', 'own', 'peerCount', 'position', 'upperQuartile']);
  assert.match(describePeerBenchmark(b, 'placements'), /above the middle half of 5 comparable organisations \(median 6\)/);
});
