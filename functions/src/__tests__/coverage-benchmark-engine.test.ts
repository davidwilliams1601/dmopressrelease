import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCHMARK_MIN_OUTLETS,
  BENCHMARK_MIN_SAMPLE,
  buildStatements,
  computeCoverageBenchmark,
  describeHours,
  percentile,
  summariseDistribution,
} from '../coverage-benchmark-engine';
import { BriefInputItem } from '../destination-brief-engine';

const NOW = Date.UTC(2026, 8, 15, 9, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

let seq = 0;
function item(overrides: {
  sourceId: string;
  hoursAgo?: number;
  daysAgo?: number;
  topicTags?: string[];
  title?: string;
}): BriefInputItem {
  const offset =
    overrides.hoursAgo !== undefined
      ? overrides.hoursAgo * HOUR_MS
      : (overrides.daysAgo ?? 1) * DAY_MS;
  seq += 1;
  return {
    id: `i${seq}`,
    sourceId: overrides.sourceId,
    sourceName: overrides.sourceId.toUpperCase(),
    sourceSiteUrl: null,
    title: overrides.title ?? `Story ${seq}`,
    url: `https://example.com/${seq}`,
    summary: '',
    publishedAtMs: NOW - offset,
    topicTags: overrides.topicTags ?? ['Tourism & travel'],
    geographyTags: ['Regional'],
  };
}

/** A topic carried by two outlets, the second following `gapHours` after the first. */
function spreadStory(topic: string, startDaysAgo: number, gapHours: number): BriefInputItem[] {
  return [
    item({ sourceId: 'a', daysAgo: startDaysAgo, topicTags: [topic] }),
    item({ sourceId: 'b', hoursAgo: startDaysAgo * 24 - gapHours, topicTags: [topic] }),
    item({ sourceId: 'c', hoursAgo: startDaysAgo * 24 - gapHours - 2, topicTags: [topic] }),
  ];
}

// --- Percentiles and phrasing --------------------------------------------

test('percentile interpolates and handles the degenerate cases', () => {
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([7], 0.5), 7);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.25), 2);
});

test('durations are phrased the way a person would post them', () => {
  // These sentences go on LinkedIn. "36.4 hours" reads as a spreadsheet; "1.5 days" reads as a
  // figure someone stands behind.
  assert.equal(describeHours(0.5), 'under an hour');
  assert.equal(describeHours(1), '1 hour');
  assert.equal(describeHours(18.4), '18 hours');
  assert.equal(describeHours(48), '2 days');
  assert.equal(describeHours(36), '1.5 days');
});

// --- Suppression ---------------------------------------------------------

test('a distribution below the minimum sample is withheld, not caveated', () => {
  const tooFew = Array.from({ length: BENCHMARK_MIN_SAMPLE - 1 }, (_, i) => i + 1);
  assert.equal(summariseDistribution(tooFew), null);
  assert.notEqual(summariseDistribution([...tooFew, 9]), null);
});

test('a distribution reports its own sample size and spread', () => {
  const d = summariseDistribution([2, 6, 12, 20, 30, 40, 100]);
  assert.ok(d);
  assert.equal(d!.sampleSize, 7);
  assert.equal(d!.medianHours, 20);
  assert.equal(d!.fastestHours, 2);
  assert.equal(d!.slowestHours, 100);
  // Four of seven inside a day.
  assert.equal(d!.withinOneDayPct, 57);
});

test('nothing is publishable from too few outlets, however many items there are', () => {
  // A "regional benchmark" computed from three feeds is a description of three feeds.
  const statements = buildStatements({
    responseWindow: summariseDistribution([2, 4, 6, 8, 10, 12]),
    singleOutlet: { themeCount: 20, singleOutletCount: 10, sharePct: 50 },
    outletCount: BENCHMARK_MIN_OUTLETS - 1,
    dataSpanDays: 28,
    itemsAnalysed: 400,
  });
  assert.deepEqual(statements, []);
});

test('every published sentence carries its sample size, window and method', () => {
  const statements = buildStatements({
    responseWindow: summariseDistribution([4, 8, 12, 20, 30, 48]),
    singleOutlet: { themeCount: 18, singleOutletCount: 11, sharePct: 61 },
    outletCount: 8,
    dataSpanDays: 28,
    itemsAnalysed: 412,
    regionLabel: 'the West of England',
  });

  assert.ok(statements.length >= 4);
  assert.ok(statements[0].includes('6 local news stories'));
  assert.ok(statements[0].includes('28 days'));
  assert.ok(statements.some((s) => s.includes('61%')));
  const method = statements[statements.length - 1];
  assert.ok(method.startsWith('Method:'));
  assert.ok(method.includes('412 published items from 8 outlets'));
  assert.ok(method.includes('No paywalled or print-only coverage'));
  // The promise that makes this postable at all.
  assert.ok(method.includes('No organisation is named'));
});

// --- End to end over a pool ----------------------------------------------

test('the benchmark is computed over the window and names nobody', () => {
  const items = [
    ...spreadStory('Tourism & travel', 26, 6),
    ...spreadStory('Food & drink', 22, 12),
    ...spreadStory('Arts & culture', 18, 30),
    ...spreadStory('Business', 14, 4),
    ...spreadStory('Transport', 10, 20),
    ...spreadStory('Events', 6, 48),
    // A story carried three times by one outlet only — the population the brief bar excludes.
    item({ sourceId: 'd', daysAgo: 9, topicTags: ['Heritage'] }),
    item({ sourceId: 'd', daysAgo: 8, topicTags: ['Heritage'] }),
    item({ sourceId: 'd', daysAgo: 7, topicTags: ['Heritage'] }),
    // Outside the window entirely.
    item({ sourceId: 'a', daysAgo: 200, topicTags: ['Tourism & travel'] }),
  ];

  const b = computeCoverageBenchmark({
    items,
    windowDays: 30,
    nowMs: NOW,
    regionLabel: 'the West of England',
  });

  assert.equal(b.itemsAnalysed, items.length - 1); // the 200-day-old item is excluded
  assert.equal(b.outletCount, 4);
  assert.ok(b.responseWindow);
  assert.equal(b.responseWindow!.sampleSize, 6);
  assert.equal(b.singleOutlet!.singleOutletCount, 1); // the Heritage cluster
  assert.ok(b.statements.length > 0);

  // The safety property, asserted rather than assumed: no outlet and no organisation appears in
  // anything publishable. Only aggregates leave this function.
  const publishable = b.statements.join(' ');
  for (const name of ['A', 'B', 'C', 'D', 'Visit West', 'Story']) {
    assert.equal(publishable.includes(name === 'A' ? ' A ' : name), false);
  }
});

test('a thin pool publishes nothing and says which figures were withheld', () => {
  const b = computeCoverageBenchmark({
    items: [
      item({ sourceId: 'a', daysAgo: 3 }),
      item({ sourceId: 'b', daysAgo: 2 }),
      item({ sourceId: 'a', daysAgo: 1 }),
    ],
    windowDays: 30,
    nowMs: NOW,
  });

  assert.deepEqual(b.statements, []);
  assert.ok(b.withheld.some((w) => w.includes('Second-outlet window withheld')));
  assert.ok(b.withheld.some((w) => w.includes('Single-outlet share withheld')));
  assert.ok(b.withheld.some((w) => w.includes('provisional')));
});

test('an empty pool is a valid result rather than an error', () => {
  const b = computeCoverageBenchmark({ items: [], windowDays: 30, nowMs: NOW });
  assert.equal(b.itemsAnalysed, 0);
  assert.equal(b.dataStartMs, null);
  assert.equal(b.dataSpanDays, null);
  assert.equal(b.responseWindow, null);
  assert.equal(b.singleOutlet, null);
  assert.deepEqual(b.statements, []);
});

test('a topic with too few measurable windows is shown as suppressed, not dropped', () => {
  // Dropping it would let the table read as the whole picture.
  const b = computeCoverageBenchmark({
    items: [...spreadStory('Tourism & travel', 20, 8), ...spreadStory('Food & drink', 12, 16)],
    windowDays: 30,
    nowMs: NOW,
  });

  assert.equal(b.byTopic.length, 2);
  assert.ok(b.byTopic.every((row) => row.suppressed));
  assert.ok(b.byTopic.every((row) => row.medianHours === null));
  assert.ok(b.byTopic.every((row) => row.themeCount > 0));
});
