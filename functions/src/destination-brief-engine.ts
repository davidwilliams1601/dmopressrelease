/**
 * Pure assembly logic for a Destination Media Opportunity Brief.
 *
 * A brief is a retrospective replay: over the last N days, what moved in this
 * destination's sector, where the destination was actually named, and where a theme ran
 * without it. It is the manual version of what Media Opportunities does continuously, and
 * it is the artefact taken to WTM.
 *
 * Two things make this different from the live opportunity generator:
 *
 *  1. A prospect is not a customer. There is no approved-release inventory to match
 *     against, so the "credible contribution" gate cannot apply. What replaces it is a
 *     deterministic and far more interesting fact: was this organisation NAMED in the
 *     coverage, or did the theme run without it? That is checkable from public feeds and
 *     needs no access to anything the prospect has not published.
 *
 *  2. Momentum here is retrospective, not now-relative. assessMomentum() in
 *     media-opportunity-engine.ts asks "is this live today?", which is the right question
 *     for a queue and the wrong one for a 30-day replay. So the brief measures span and
 *     density inside its own window instead.
 *
 * No firebase imports: everything here is a pure function of its inputs, unit-tested in
 * __tests__/destination-brief-engine.test.ts.
 */

import { containsTerm } from './media-opportunity-engine';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default replay window. Thirty days is long enough to show a pattern and short enough
 *  that every link in the brief still resolves when a prospect checks it at the stand. */
export const BRIEF_WINDOW_DAYS = 30;

/** A theme needs this many items, from this many distinct outlets, inside the window
 *  before it earns a place in a brief. Same principle as the live generator: one outlet
 *  repeating itself is not a theme, and a brief padded with singletons is worthless. */
export const BRIEF_MIN_ITEMS = 3;
export const BRIEF_MIN_SOURCES = 2;

/** Themes per brief, and evidence rows shown per theme. A brief is a conversation
 *  opener, not a data dump — six themes is about two printed pages of substance. */
export const BRIEF_MAX_THEMES = 6;
export const BRIEF_MAX_EVIDENCE_PER_THEME = 6;
export const BRIEF_MAX_APPEARANCES = 10;

export type BriefInputItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceSiteUrl?: string | null;
  title: string;
  url: string;
  summary?: string;
  publishedAtMs: number;
  topicTags: string[];
  geographyTags: string[];
};

export type BriefEvidence = {
  mediaItemId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAtMs: number;
  /** True when one of the prospect's own watch terms appears in this item. */
  namesProspect: boolean;
};

export type BriefTheme = {
  key: string;
  label: string;
  kind: 'topic' | 'watch_term';
  itemCount: number;
  distinctSourceCount: number;
  sourceNames: string[];
  firstSeenMs: number;
  lastSeenMs: number;
  /** Calendar days between the first and last item. 0 means it broke and ran in a day. */
  spanDays: number;
  /** Hours between the first item appearing and the second outlet picking it up — the
   *  realistic window an organisation had to respond before the story was already set. */
  responseWindowHours: number | null;
  mentionCount: number;
  /** The honest headline of the whole brief, per theme. */
  route: 'you_were_in_it' | 'ran_without_you';
  evidence: BriefEvidence[];
};

export type BriefTotals = {
  itemsScanned: number;
  itemsMatched: number;
  sourcesRepresented: number;
  themesFound: number;
  themesWithMention: number;
  themesWithoutMention: number;
  appearanceCount: number;
};

export type BriefContent = {
  windowDays: number;
  windowStartMs: number;
  windowEndMs: number;
  totals: BriefTotals;
  /** Every item in the window that named the prospect, most recent first. */
  appearances: BriefEvidence[];
  themes: BriefTheme[];
  /** Explicit statement of what this brief does NOT establish. Always populated. */
  gaps: string[];
  sourcesUsed: Array<{ name: string; siteUrl?: string | null }>;
};

/** Does any watch term appear in this item's headline or feed summary? */
export function itemNamesProspect(item: BriefInputItem, watchTerms: string[]): boolean {
  const haystack = `${item.title} ${item.summary || ''}`;
  return watchTerms.some((term) => term.length >= 3 && containsTerm(haystack, term));
}

function toEvidence(item: BriefInputItem, watchTerms: string[]): BriefEvidence {
  return {
    mediaItemId: item.id,
    sourceName: item.sourceName,
    title: item.title,
    url: item.url,
    publishedAtMs: item.publishedAtMs,
    namesProspect: itemNamesProspect(item, watchTerms),
  };
}

/**
 * Hours from the first item to the first item from a DIFFERENT outlet.
 *
 * This is the number that makes the sales case without any claim about the future: it is
 * how long the prospect had between a story appearing and it becoming the received view.
 * Null when only one outlet ever covered it.
 */
export function responseWindowHours(items: BriefInputItem[]): number | null {
  if (items.length < 2) return null;
  const sorted = [...items].sort((a, b) => a.publishedAtMs - b.publishedAtMs);
  const firstSourceId = sorted[0].sourceId;
  const secondOutlet = sorted.find((i) => i.sourceId !== firstSourceId);
  if (!secondOutlet) return null;
  return Math.max(
    0,
    Math.round(((secondOutlet.publishedAtMs - sorted[0].publishedAtMs) / (60 * 60 * 1000)) * 10) / 10
  );
}

/**
 * Groups items into candidate themes.
 *
 * Two kinds, and the distinction is deliberate:
 *  - `watch_term` themes are coverage clustered around one of the prospect's own named
 *    assets (its destination, a flagship event, a member). These are the themes it has an
 *    unarguable right to be in.
 *  - `topic` themes are controlled-taxonomy sector themes.
 *
 * An item can appear in more than one theme, which is correct: a story about a festival in
 * the destination genuinely is both.
 */
export function groupBriefThemes(
  items: BriefInputItem[],
  options: { watchTerms?: string[]; priorityTopics?: string[] } = {}
): Array<{ key: string; label: string; kind: 'topic' | 'watch_term'; items: BriefInputItem[] }> {
  const watchTerms = (options.watchTerms || []).filter((t) => t.trim().length >= 3);
  const priorityTopics = options.priorityTopics || [];
  const groups: Array<{
    key: string;
    label: string;
    kind: 'topic' | 'watch_term';
    items: BriefInputItem[];
  }> = [];

  for (const term of watchTerms) {
    const matched = items.filter((i) => containsTerm(`${i.title} ${i.summary || ''}`, term));
    if (matched.length) {
      groups.push({ key: `watch:${term.toLowerCase()}`, label: term, kind: 'watch_term', items: matched });
    }
  }

  const topicKeys = new Set<string>();
  for (const item of items) {
    for (const topic of item.topicTags) {
      if (priorityTopics.length && !priorityTopics.includes(topic)) continue;
      topicKeys.add(topic);
    }
  }
  for (const topic of topicKeys) {
    groups.push({
      key: `topic:${topic}`,
      label: topic,
      kind: 'topic',
      items: items.filter((i) => i.topicTags.includes(topic)),
    });
  }

  return groups;
}

/** Turns one candidate group into a brief theme, or null if it does not clear the bar. */
export function summariseTheme(
  group: { key: string; label: string; kind: 'topic' | 'watch_term'; items: BriefInputItem[] },
  watchTerms: string[]
): BriefTheme | null {
  const items = [...group.items].sort((a, b) => b.publishedAtMs - a.publishedAtMs);
  const sourceIds = new Set(items.map((i) => i.sourceId));

  if (items.length < BRIEF_MIN_ITEMS || sourceIds.size < BRIEF_MIN_SOURCES) return null;

  const mentionCount = items.filter((i) => itemNamesProspect(i, watchTerms)).length;
  const firstSeenMs = items[items.length - 1].publishedAtMs;
  const lastSeenMs = items[0].publishedAtMs;

  // Evidence prefers items that name the prospect — if the destination is in the coverage,
  // that is the row it needs to see first — then falls back to most recent.
  const evidence = [...items]
    .sort((a, b) => {
      const aNames = itemNamesProspect(a, watchTerms) ? 1 : 0;
      const bNames = itemNamesProspect(b, watchTerms) ? 1 : 0;
      if (aNames !== bNames) return bNames - aNames;
      return b.publishedAtMs - a.publishedAtMs;
    })
    .slice(0, BRIEF_MAX_EVIDENCE_PER_THEME)
    .map((i) => toEvidence(i, watchTerms));

  return {
    key: group.key,
    label: group.label,
    kind: group.kind,
    itemCount: items.length,
    distinctSourceCount: sourceIds.size,
    sourceNames: [...new Set(items.map((i) => i.sourceName))].sort(),
    firstSeenMs,
    lastSeenMs,
    spanDays: Math.max(0, Math.round((lastSeenMs - firstSeenMs) / DAY_MS)),
    responseWindowHours: responseWindowHours(items),
    mentionCount,
    route: mentionCount > 0 ? 'you_were_in_it' : 'ran_without_you',
    evidence,
  };
}

/**
 * Ranks themes for a printed brief.
 *
 * Themes that ran WITHOUT the prospect come first. That is not a rhetorical trick — it is
 * the only part of the brief the prospect cannot already know, and it is the part that
 * makes the case. Within each group, breadth of coverage wins over volume, because five
 * outlets carrying a story matters more than one outlet carrying it five times.
 */
export function rankBriefThemes(themes: BriefTheme[]): BriefTheme[] {
  return [...themes].sort((a, b) => {
    if (a.route !== b.route) return a.route === 'ran_without_you' ? -1 : 1;
    if (b.distinctSourceCount !== a.distinctSourceCount) {
      return b.distinctSourceCount - a.distinctSourceCount;
    }
    if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
    return b.lastSeenMs - a.lastSeenMs;
  });
}

/**
 * The gaps section, generated from the brief's own contents rather than boilerplate.
 *
 * This section exists because the brief will be read by a communications professional who
 * will look for what has been overstated. Naming the limits ourselves — specifically,
 * before they find them — is what makes the rest of the document credible. It is never
 * empty and it is never hidden in small print.
 */
export function buildBriefGaps(input: {
  content: Pick<BriefContent, 'totals' | 'windowDays'>;
  sourceCount: number;
  hasWatchTerms: boolean;
}): string[] {
  const { content, sourceCount, hasWatchTerms } = input;
  const gaps: string[] = [
    `This brief reads ${sourceCount} permitted ${sourceCount === 1 ? 'feed' : 'feeds'} over ${content.windowDays} days. It is not the whole news agenda: paywalled titles, broadcast, most regional print and any publisher that blocks automated readers are not in it.`,
    'Coverage you secured through outlets outside this source set will not appear here. Absence from this brief is not absence from the media.',
    'We cannot see your own story pipeline, your embargoes or your members\u2019 plans. Themes marked as having run without you may well be ones you chose not to join.',
    'Nothing here predicts coverage. It records what was published, when, and by whom.',
  ];

  if (!hasWatchTerms) {
    gaps.push(
      'No watch terms were set for this organisation, so "where you appeared" is based on sector matching alone and will understate your presence.'
    );
  }
  if (content.totals.appearanceCount === 0) {
    gaps.push(
      'You were not named in any item in this window from these sources. That is a finding about this source set and this window, not a judgement about your communications.'
    );
  }
  return gaps;
}

/** Assembles the whole brief from a window of tagged items. */
export function assembleBrief(input: {
  items: BriefInputItem[];
  watchTerms?: string[];
  priorityTopics?: string[];
  windowDays?: number;
  nowMs?: number;
  /** Total items considered before sector/geography filtering, for an honest totals line. */
  itemsScanned?: number;
}): BriefContent {
  const windowDays = input.windowDays ?? BRIEF_WINDOW_DAYS;
  const nowMs = input.nowMs ?? Date.now();
  const windowStartMs = nowMs - windowDays * DAY_MS;
  const watchTerms = (input.watchTerms || []).map((t) => t.trim()).filter((t) => t.length >= 3);

  const items = input.items.filter(
    (i) => i.publishedAtMs >= windowStartMs && i.publishedAtMs <= nowMs
  );

  const themes = rankBriefThemes(
    groupBriefThemes(items, { watchTerms, priorityTopics: input.priorityTopics })
      .map((g) => summariseTheme(g, watchTerms))
      .filter((t): t is BriefTheme => t !== null)
  ).slice(0, BRIEF_MAX_THEMES);

  const appearances = items
    .filter((i) => itemNamesProspect(i, watchTerms))
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
    .slice(0, BRIEF_MAX_APPEARANCES)
    .map((i) => toEvidence(i, watchTerms));

  const sourcesUsed = [
    ...new Map(items.map((i) => [i.sourceId, { name: i.sourceName, siteUrl: i.sourceSiteUrl ?? null }])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const totals: BriefTotals = {
    itemsScanned: input.itemsScanned ?? items.length,
    itemsMatched: items.length,
    sourcesRepresented: sourcesUsed.length,
    themesFound: themes.length,
    themesWithMention: themes.filter((t) => t.route === 'you_were_in_it').length,
    themesWithoutMention: themes.filter((t) => t.route === 'ran_without_you').length,
    appearanceCount: items.filter((i) => itemNamesProspect(i, watchTerms)).length,
  };

  return {
    windowDays,
    windowStartMs,
    windowEndMs: nowMs,
    totals,
    appearances,
    themes,
    gaps: buildBriefGaps({
      content: { totals, windowDays },
      sourceCount: sourcesUsed.length,
      hasWatchTerms: watchTerms.length > 0,
    }),
    sourcesUsed,
  };
}
