/**
 * Tests for the Media Opportunities engine.
 *
 * Run with `npm test` in functions/ (compiles via tsconfig.test.json, then node --test).
 * No emulator and no network: media-opportunity-engine.ts imports no firebase-admin.
 *
 * What these pin down — the four claims the feature's credibility rests on:
 *  1. Feed parsing handles both RSS and Atom, CDATA, entities and missing dates.
 *  2. URL canonicalisation collapses tracking-tagged duplicates to one ID, so a
 *     syndicated article cannot inflate the distinct-source count momentum depends on.
 *  3. Tagging is deterministic and carries a match trail, and the sensitive-subject
 *     list catches the cases nobody should ever be nudged into newsjacking.
 *  4. Momentum thresholds: one item is never a theme, one outlet repeating itself is
 *     never a theme, and three distinct sources inside 72 hours is an emerging one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorkingItem,
  assessMomentum,
  canonicaliseUrl,
  chooseAction,
  containsTerm,
  mediaItemDocId,
  parseFeed,
  tagItem,
} from '../media-opportunity-engine';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function item(overrides: Partial<WorkingItem> & { sourceId: string; hoursAgo: number }): WorkingItem {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    sourceId: overrides.sourceId,
    sourceName: overrides.sourceName || overrides.sourceId,
    title: overrides.title || 'Family travel demand rises',
    url: overrides.url || `https://example.com/${Math.random().toString(36).slice(2)}`,
    summary: overrides.summary,
    publishedAtMs: Date.now() - overrides.hoursAgo * HOUR_MS,
    topicTags: overrides.topicTags || ['Tourism & travel'],
    geographyTags: overrides.geographyTags || ['National (UK)'],
    verticals: overrides.verticals || ['dmo'],
  };
}

// --- 1. Feed parsing -------------------------------------------------------

test('parses an RSS feed including CDATA and HTML entities', () => {
  const xml = `<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <title>Channel title should not become an item</title>
      <item>
        <title><![CDATA[Kent &amp; Sussex named top coastal break]]></title>
        <link>https://example.com/kent-sussex</link>
        <description><![CDATA[<p>Visitor numbers &pound;up 12%</p>]]></description>
        <pubDate>Tue, 08 Sep 2026 09:00:00 GMT</pubDate>
        <dc:creator>Jo Reporter</dc:creator>
      </item>
    </channel></rss>`;

  const entries = parseFeed(xml);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Kent & Sussex named top coastal break');
  assert.equal(entries[0].url, 'https://example.com/kent-sussex');
  // HTML is stripped from the feed-supplied summary; we never store markup.
  assert.equal(entries[0].summary, 'Visitor numbers £up 12%');
  assert.equal(entries[0].author, 'Jo Reporter');
  assert.equal(entries[0].publishedAt?.toISOString(), '2026-09-08T09:00:00.000Z');
});

test('parses an Atom feed with a self-closing link and rel attributes', () => {
  const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>New rail route boosts inbound tourism</title>
        <link rel="self" href="https://example.com/self.atom"/>
        <link rel="alternate" href="https://example.com/rail-route"/>
        <published>2026-09-10T07:30:00Z</published>
        <summary>Officials confirm the service.</summary>
      </entry>
    </feed>`;

  const entries = parseFeed(xml);
  assert.equal(entries.length, 1);
  // rel="self" must not win over rel="alternate".
  assert.equal(entries[0].url, 'https://example.com/rail-route');
  assert.equal(entries[0].publishedAt?.toISOString(), '2026-09-10T07:30:00.000Z');
});

test('skips entries with no usable link, and reports a null date rather than guessing', () => {
  const xml = `<rss><channel>
      <item><title>No link here</title><description>Nothing</description></item>
      <item><title>Undated</title><link>https://example.com/undated</link></item>
    </channel></rss>`;

  const entries = parseFeed(xml);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Undated');
  assert.equal(entries[0].publishedAt, null);
});

// --- 2. Canonicalisation ---------------------------------------------------

test('canonicalisation strips tracking params, hashes and trailing slashes', () => {
  const a = canonicaliseUrl('https://Example.com/story/?utm_source=newsletter&utm_medium=email#top');
  const b = canonicaliseUrl('https://example.com/story');
  assert.equal(a, b);
  assert.equal(mediaItemDocId(a), mediaItemDocId(b));
});

test('canonicalisation keeps meaningful query params', () => {
  const url = canonicaliseUrl('https://example.com/news?id=4821&utm_campaign=x');
  assert.equal(url, 'https://example.com/news?id=4821');
});

// --- 3. Tagging and sensitivity -------------------------------------------

test('tags on word boundaries and records why', () => {
  const tagged = tagItem({
    title: 'Coastal accommodation reports record occupancy',
    summary: 'Operators across the county say demand for short breaks is up.',
    sourceGeographies: ['Regional'],
    sourceDefaultTopics: ['Tourism & travel'],
  });

  assert.ok(tagged.topicTags.includes('Tourism & travel'));
  assert.ok(tagged.geographyTags.includes('Regional'));
  // The source's own declared coverage is part of the trail, not silently assumed.
  assert.ok(tagged.matchTrail.some((t) => t.field === 'source'));
  assert.ok(tagged.matchTrail.some((t) => t.field === 'title' || t.field === 'summary'));
  assert.equal(tagged.sensitive, false);
});

test('does not match a term inside a longer word', () => {
  // 'court' must not fire on 'courtyard' — a false sensitivity flag silently removes a
  // legitimate opportunity, so the boundary behaviour is worth pinning down.
  assert.equal(containsTerm('The courtyard garden reopens', 'court'), false);
  assert.equal(containsTerm('Case reaches the court today', 'court'), true);
});

test('flags sensitive subjects and names the term that caused it', () => {
  const tagged = tagItem({ title: 'Two die in coach crash near the coast' });
  assert.equal(tagged.sensitive, true);
  assert.ok(tagged.sensitiveReason);
});

test('a redundancy or insolvency story is treated as sensitive', () => {
  assert.equal(tagItem({ title: 'Hotel group enters administration' }).sensitive, true);
  assert.equal(tagItem({ title: 'Attraction announces redundancies' }).sensitive, true);
});

// --- 4. Momentum ----------------------------------------------------------

test('a single item is never a theme', () => {
  const { momentum } = assessMomentum([item({ sourceId: 'a', hoursAgo: 2 })]);
  assert.equal(momentum, null);
});

test('one outlet repeating itself is never a theme', () => {
  const { momentum } = assessMomentum([
    item({ sourceId: 'a', hoursAgo: 2 }),
    item({ sourceId: 'a', hoursAgo: 20 }),
    item({ sourceId: 'a', hoursAgo: 40 }),
  ]);
  assert.equal(momentum, null);
});

test('two sources within seven days is a developing theme', () => {
  const result = assessMomentum([
    item({ sourceId: 'a', hoursAgo: 100 }),
    item({ sourceId: 'b', hoursAgo: 130 }),
  ]);
  assert.equal(result.momentum, 'developing_theme');
  assert.equal(result.distinctSourceCount, 2);
  assert.equal(result.windowDays, 7);
});

test('three sources within 72 hours is an emerging opportunity', () => {
  const result = assessMomentum([
    item({ sourceId: 'a', hoursAgo: 4 }),
    item({ sourceId: 'b', hoursAgo: 20 }),
    item({ sourceId: 'c', hoursAgo: 60 }),
  ]);
  assert.equal(result.momentum, 'emerging_opportunity');
  assert.equal(result.distinctSourceCount, 3);
  assert.equal(result.windowDays, 3);
});

test('items outside the seven-day window do not count towards momentum', () => {
  const result = assessMomentum([
    item({ sourceId: 'a', hoursAgo: 2 }),
    item({ sourceId: 'b', hoursAgo: 12 * 24 }),
  ]);
  assert.equal(result.momentum, null);
});

test('stale coverage alone cannot reach the emerging threshold', () => {
  const result = assessMomentum([
    item({ sourceId: 'a', hoursAgo: 5 * 24 }),
    item({ sourceId: 'b', hoursAgo: 5 * 24 + 1 }),
    item({ sourceId: 'c', hoursAgo: 6 * 24 }),
  ]);
  assert.equal(result.momentum, 'developing_theme');
});

// --- 5. Action selection --------------------------------------------------

test('an emerging theme the org has an approved story for is a same-day comment', () => {
  const { action, urgency } = chooseAction({
    momentum: 'emerging_opportunity',
    hasMatchedRelease: true,
    isWatchlistTheme: false,
  });
  assert.equal(action, 'prepare_comment');
  assert.equal(urgency, 'today');
});

test('a topic match with nothing of the org\u2019s own to say is only ever "watch and prepare"', () => {
  const { action, urgency } = chooseAction({
    momentum: 'developing_theme',
    hasMatchedRelease: false,
    isWatchlistTheme: false,
  });
  assert.equal(action, 'monitor');
  assert.equal(urgency, 'plan_ahead');
});

test('the MVP never recommends an action that needs data the platform cannot see', () => {
  // create_release / build_case_study / no_action require the story-asset and
  // spokesperson inventory from a later slice. Guard against them creeping in early.
  const forbidden = new Set(['create_release', 'build_case_study', 'no_action']);
  for (const momentum of ['developing_theme', 'emerging_opportunity'] as const) {
    for (const hasMatchedRelease of [true, false]) {
      for (const isWatchlistTheme of [true, false]) {
        const { action } = chooseAction({ momentum, hasMatchedRelease, isWatchlistTheme });
        assert.equal(forbidden.has(action), false, `unexpected action: ${action}`);
      }
    }
  }
});

// --- 6. Ageing sanity check ----------------------------------------------

test('windowDays reported for a developing theme matches the configured lookback', () => {
  const result = assessMomentum([
    item({ sourceId: 'a', hoursAgo: 6 * 24 }),
    item({ sourceId: 'b', hoursAgo: 6 * 24 + 2 }),
  ]);
  assert.equal(result.windowDays * DAY_MS, 7 * DAY_MS);
});
