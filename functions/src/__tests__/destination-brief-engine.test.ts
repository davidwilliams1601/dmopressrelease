/**
 * Tests for the destination-brief engine.
 *
 * Run with `npm test` in functions/. No emulator and no network.
 *
 * These exist because a brief is handed to a prospect on paper. Once it is printed it
 * cannot be corrected, so the claims it makes have to be right by construction:
 *
 *  1. A theme needs 3+ items from 2+ outlets. Padding a brief with singletons is the
 *     easiest way to make it look impressive and be worthless.
 *  2. "Ran without you" must be exactly true — a single naming item anywhere in the theme
 *     flips it, because telling a DMO it was absent from coverage it was in is fatal.
 *  3. The response window is the gap to the SECOND OUTLET, not the second item. One
 *     outlet publishing twice is not the agenda moving.
 *  4. Items outside the window never appear, and the gaps section is never empty.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIEF_MAX_THEMES,
  BriefInputItem,
  assembleBrief,
  buildBriefGaps,
  groupBriefThemes,
  itemNamesProspect,
  rankBriefThemes,
  responseWindowHours,
  summariseTheme,
} from '../destination-brief-engine';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 8, 15, 9, 0, 0); // 15 Sep 2026, fixed so tests never drift.

let seq = 0;
function it(overrides: Partial<BriefInputItem> & { sourceId: string; daysAgo?: number; hoursAgo?: number }): BriefInputItem {
  seq += 1;
  const offset =
    overrides.hoursAgo !== undefined
      ? overrides.hoursAgo * HOUR_MS
      : (overrides.daysAgo ?? 1) * DAY_MS;
  return {
    id: overrides.id || `i${seq}`,
    sourceId: overrides.sourceId,
    sourceName: overrides.sourceName || overrides.sourceId.toUpperCase(),
    sourceSiteUrl: overrides.sourceSiteUrl ?? `https://${overrides.sourceId}.example.com`,
    title: overrides.title || 'Coastal tourism demand climbs',
    url: overrides.url || `https://example.com/a${seq}`,
    summary: overrides.summary,
    publishedAtMs: overrides.publishedAtMs ?? NOW - offset,
    topicTags: overrides.topicTags || ['Tourism & travel'],
    geographyTags: overrides.geographyTags || ['Regional'],
  };
}

// --- Naming detection -----------------------------------------------------

test('a watch term is detected in the headline and in the feed summary', () => {
  assert.equal(itemNamesProspect(it({ sourceId: 'a', title: 'Visit Kent reports growth' }), ['Visit Kent']), true);
  assert.equal(
    itemNamesProspect(it({ sourceId: 'a', title: 'Growth in the south east', summary: 'Figures from Visit Kent show...' }), ['Visit Kent']),
    true
  );
  assert.equal(itemNamesProspect(it({ sourceId: 'a', title: 'Growth in Sussex' }), ['Visit Kent']), false);
});

test('watch terms under three characters are ignored', () => {
  // A two-letter term would match a large share of the corpus and make the single most
  // important claim in the brief ("you were / were not in this") meaningless.
  assert.equal(itemNamesProspect(it({ sourceId: 'a', title: 'UK tourism grows' }), ['UK']), false);
});

test('a watch term does not match inside a longer word', () => {
  assert.equal(itemNamesProspect(it({ sourceId: 'a', title: 'Bathing water quality improves' }), ['Bath']), false);
  assert.equal(itemNamesProspect(it({ sourceId: 'a', title: 'Bath sees record visitors' }), ['Bath']), true);
});

// --- Theme thresholds -----------------------------------------------------

test('two items are not enough to be a theme, however many outlets', () => {
  const theme = summariseTheme(
    { key: 'topic:Tourism & travel', label: 'Tourism & travel', kind: 'topic', items: [it({ sourceId: 'a' }), it({ sourceId: 'b' })] },
    []
  );
  assert.equal(theme, null);
});

test('three items from one outlet are not a theme', () => {
  const theme = summariseTheme(
    {
      key: 'topic:Tourism & travel',
      label: 'Tourism & travel',
      kind: 'topic',
      items: [it({ sourceId: 'a' }), it({ sourceId: 'a' }), it({ sourceId: 'a' })],
    },
    []
  );
  assert.equal(theme, null);
});

test('three items across two outlets is a theme, with correct counts and span', () => {
  const theme = summariseTheme(
    {
      key: 'topic:Tourism & travel',
      label: 'Tourism & travel',
      kind: 'topic',
      items: [it({ sourceId: 'a', daysAgo: 2 }), it({ sourceId: 'b', daysAgo: 5 }), it({ sourceId: 'a', daysAgo: 7 })],
    },
    []
  );
  assert.ok(theme);
  assert.equal(theme!.itemCount, 3);
  assert.equal(theme!.distinctSourceCount, 2);
  assert.equal(theme!.spanDays, 5);
  assert.deepEqual(theme!.sourceNames, ['A', 'B']);
});

// --- The route claim ------------------------------------------------------

test('a theme with no naming item is "ran without you"', () => {
  const theme = summariseTheme(
    {
      key: 'topic:Tourism & travel',
      label: 'Tourism & travel',
      kind: 'topic',
      items: [it({ sourceId: 'a' }), it({ sourceId: 'b' }), it({ sourceId: 'c' })],
    },
    ['Visit Kent']
  );
  assert.equal(theme!.route, 'ran_without_you');
  assert.equal(theme!.mentionCount, 0);
});

test('one single naming item anywhere in the theme flips the route', () => {
  const theme = summariseTheme(
    {
      key: 'topic:Tourism & travel',
      label: 'Tourism & travel',
      kind: 'topic',
      items: [
        it({ sourceId: 'a' }),
        it({ sourceId: 'b' }),
        it({ sourceId: 'c', title: 'Visit Kent launches coastal campaign', daysAgo: 9 }),
      ],
    },
    ['Visit Kent']
  );
  assert.equal(theme!.route, 'you_were_in_it');
  assert.equal(theme!.mentionCount, 1);
  // And that item must be the first row of evidence, not buried by recency ordering.
  assert.equal(theme!.evidence[0].namesProspect, true);
});

// --- Response window ------------------------------------------------------

test('the response window measures the gap to a different outlet, not the next item', () => {
  const items = [
    it({ sourceId: 'a', hoursAgo: 100 }),
    it({ sourceId: 'a', hoursAgo: 99 }), // same outlet again — must be ignored
    it({ sourceId: 'b', hoursAgo: 94 }),
  ];
  assert.equal(responseWindowHours(items), 6);
});

test('the response window is null when only one outlet ever covered it', () => {
  assert.equal(responseWindowHours([it({ sourceId: 'a', hoursAgo: 10 }), it({ sourceId: 'a', hoursAgo: 4 })]), null);
});

test('the response window is null for a single item', () => {
  assert.equal(responseWindowHours([it({ sourceId: 'a' })]), null);
});

// --- Grouping -------------------------------------------------------------

test('watch-term and topic themes are both produced, and an item can be in both', () => {
  const items = [
    it({ sourceId: 'a', title: 'Visit Kent reports record summer' }),
    it({ sourceId: 'b', title: 'Coastal tourism up across the south east' }),
    it({ sourceId: 'c', title: 'Visit Kent opens new trade programme' }),
  ];
  const groups = groupBriefThemes(items, { watchTerms: ['Visit Kent'] });
  const watch = groups.find((g) => g.kind === 'watch_term');
  const topic = groups.find((g) => g.kind === 'topic');
  assert.ok(watch);
  assert.equal(watch!.items.length, 2);
  assert.ok(topic);
  assert.equal(topic!.items.length, 3);
});

test('priorityTopics restricts which topic themes are considered', () => {
  const items = [
    it({ sourceId: 'a', topicTags: ['Tourism & travel'] }),
    it({ sourceId: 'b', topicTags: ['Sport'] }),
  ];
  const groups = groupBriefThemes(items, { priorityTopics: ['Tourism & travel'] });
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Tourism & travel']
  );
});

// --- Ranking --------------------------------------------------------------

test('themes that ran without the prospect are ranked first', () => {
  const base = {
    itemCount: 3,
    distinctSourceCount: 2,
    sourceNames: ['A', 'B'],
    firstSeenMs: NOW - 5 * DAY_MS,
    lastSeenMs: NOW - DAY_MS,
    spanDays: 4,
    responseWindowHours: 5,
    evidence: [],
    kind: 'topic' as const,
  };
  const ranked = rankBriefThemes([
    { ...base, key: 'a', label: 'Was in it', mentionCount: 2, route: 'you_were_in_it' },
    { ...base, key: 'b', label: 'Missed it', mentionCount: 0, route: 'ran_without_you' },
  ]);
  assert.deepEqual(
    ranked.map((t) => t.label),
    ['Missed it', 'Was in it']
  );
});

test('within a route group, breadth of coverage beats volume', () => {
  const base = {
    sourceNames: [],
    firstSeenMs: NOW - 5 * DAY_MS,
    lastSeenMs: NOW - DAY_MS,
    spanDays: 4,
    responseWindowHours: 5,
    mentionCount: 0,
    route: 'ran_without_you' as const,
    evidence: [],
    kind: 'topic' as const,
  };
  const ranked = rankBriefThemes([
    { ...base, key: 'a', label: 'One outlet, many items', itemCount: 12, distinctSourceCount: 2 },
    { ...base, key: 'b', label: 'Many outlets', itemCount: 5, distinctSourceCount: 6 },
  ]);
  assert.equal(ranked[0].label, 'Many outlets');
});

// --- Whole-brief assembly -------------------------------------------------

function busyWindow(): BriefInputItem[] {
  return [
    // A tourism theme that names nobody — the "ran without you" case.
    it({ sourceId: 'a', daysAgo: 3, title: 'Coastal breaks drive autumn bookings' }),
    it({ sourceId: 'b', daysAgo: 4, title: 'Operators report strong short-break demand' }),
    it({ sourceId: 'c', daysAgo: 6, title: 'Autumn staycation demand climbs' }),
    // A watch-term theme.
    it({ sourceId: 'a', daysAgo: 8, title: 'Visit Kent announces trade mission', topicTags: ['Business & investment'] }),
    it({ sourceId: 'b', daysAgo: 9, title: 'Visit Kent partners on coastal campaign', topicTags: ['Business & investment'] }),
    it({ sourceId: 'c', daysAgo: 11, title: 'Funding boost for Visit Kent programme', topicTags: ['Business & investment'] }),
    // Outside the window entirely.
    it({ sourceId: 'a', daysAgo: 60, title: 'Visit Kent old news' }),
  ];
}

test('assembleBrief excludes items outside the window', () => {
  const brief = assembleBrief({ items: busyWindow(), watchTerms: ['Visit Kent'], windowDays: 30, nowMs: NOW });
  assert.equal(brief.totals.itemsMatched, 6);
  const allUrls = brief.themes.flatMap((t) => t.evidence.map((e) => e.title));
  assert.equal(allUrls.includes('Visit Kent old news'), false);
});

test('assembleBrief reports both routes and lists appearances most recent first', () => {
  const brief = assembleBrief({ items: busyWindow(), watchTerms: ['Visit Kent'], windowDays: 30, nowMs: NOW });
  assert.ok(brief.totals.themesFound >= 2);
  assert.ok(brief.totals.themesWithoutMention >= 1);
  assert.ok(brief.totals.themesWithMention >= 1);
  assert.equal(brief.totals.appearanceCount, 3);
  assert.equal(brief.appearances.length, 3);
  assert.ok(brief.appearances[0].publishedAtMs > brief.appearances[1].publishedAtMs);
  assert.ok(brief.appearances.every((a) => a.namesProspect));
});

test('assembleBrief never exceeds the theme cap', () => {
  const items: BriefInputItem[] = [];
  for (let t = 0; t < 12; t += 1) {
    for (const source of ['a', 'b', 'c']) {
      items.push(it({ sourceId: source, daysAgo: 3, topicTags: [`Topic ${t}`] }));
    }
  }
  const brief = assembleBrief({ items, windowDays: 30, nowMs: NOW });
  assert.equal(brief.themes.length, BRIEF_MAX_THEMES);
});

test('a brief with no qualifying theme still returns a usable, honest document', () => {
  const brief = assembleBrief({
    items: [it({ sourceId: 'a', daysAgo: 2 }), it({ sourceId: 'b', daysAgo: 3 })],
    watchTerms: ['Visit Kent'],
    windowDays: 30,
    nowMs: NOW,
  });
  assert.equal(brief.themes.length, 0);
  assert.equal(brief.totals.themesFound, 0);
  assert.ok(brief.gaps.length > 0);
  // The "you were named nowhere" gap must be stated explicitly, not left as an absence.
  assert.ok(brief.gaps.some((g) => g.toLowerCase().includes('not named in any item')));
});

test('sourcesUsed is deduplicated and alphabetical', () => {
  const brief = assembleBrief({ items: busyWindow(), windowDays: 30, nowMs: NOW });
  assert.deepEqual(
    brief.sourcesUsed.map((s) => s.name),
    ['A', 'B', 'C']
  );
});

test('the gaps section is never empty and always states the source-set limit', () => {
  const gaps = buildBriefGaps({
    content: { windowDays: 30, totals: { itemsScanned: 100, itemsMatched: 50, sourcesRepresented: 10, themesFound: 3, themesWithMention: 1, themesWithoutMention: 2, appearanceCount: 4 } },
    sourceCount: 10,
    hasWatchTerms: true,
  });
  assert.ok(gaps.length >= 4);
  assert.ok(gaps[0].includes('10 permitted feeds'));
  assert.ok(gaps.some((g) => g.includes('does not predict') || g.includes('Nothing here predicts')));
});

test('a missing watch-term list is called out as a limitation', () => {
  const gaps = buildBriefGaps({
    content: { windowDays: 30, totals: { itemsScanned: 10, itemsMatched: 10, sourcesRepresented: 3, themesFound: 1, themesWithMention: 0, themesWithoutMention: 1, appearanceCount: 0 } },
    sourceCount: 3,
    hasWatchTerms: false,
  });
  assert.ok(gaps.some((g) => g.includes('No watch terms were set')));
});
