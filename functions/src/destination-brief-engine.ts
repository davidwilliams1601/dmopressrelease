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

/**
 * Why this row is in the brief.
 *
 * `first` and `second_outlet` are the two rows that evidence the responseWindowHours claim
 * — without them the document asserts "a second outlet followed in N hours" and then shows
 * six unrelated items from the final day, which is an invitation to disbelieve it.
 * Undefined on briefs generated before this field existed.
 */
export type BriefEvidenceRole =
  | 'names_you'
  | 'first'
  | 'second_outlet'
  | 'latest'
  | 'span';

export type BriefEvidence = {
  mediaItemId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAtMs: number;
  /** True when one of the prospect's own watch terms appears in this item. */
  namesProspect: boolean;
  /** What this row is doing in the brief. See BriefEvidenceRole. */
  role?: BriefEvidenceRole;
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
  /**
   * The window the data actually covers: the first and last item the brief could see.
   *
   * This is not the same as windowStartMs/windowEndMs and must never be presented as if it
   * were. A brief requested over thirty days when ingestion has only been running a
   * fortnight covers a fortnight, and printing "30-day replay, 19 Aug – 18 Sept" over
   * fourteen days of data overstates the document's own reach — the easiest kind of error
   * for a prospect to catch and the most damaging to find. Null when no items matched.
   */
  dataStartMs: number | null;
  dataEndMs: number | null;
  /** Calendar days actually covered by the items. Null when no items matched. */
  dataSpanDays: number | null;
  /** True when the data covers materially less than the window that was requested. */
  windowUnderfilled: boolean;
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

function toEvidence(
  item: BriefInputItem,
  watchTerms: string[],
  role?: BriefEvidenceRole
): BriefEvidence {
  return {
    mediaItemId: item.id,
    sourceName: item.sourceName,
    title: item.title,
    url: item.url,
    publishedAtMs: item.publishedAtMs,
    namesProspect: itemNamesProspect(item, watchTerms),
    ...(role ? { role } : {}),
  };
}

/**
 * Chooses which items in a theme are shown as evidence.
 *
 * The first version of this took the most recent N, which produced briefs where a theme
 * described as running for sixteen days was evidenced entirely by items from its last day,
 * and where the "a second outlet followed N hours later" line had nothing behind it. The
 * rows have to carry the theme's shape, not just its tail.
 *
 * Priority, highest first:
 *   1. Items naming the prospect. If the destination is in the coverage, that is the row it
 *      needs to see before anything else.
 *   2. The first item in the window — where the theme started.
 *   3. The first item from a DIFFERENT outlet — the one responseWindowHours is measured to.
 *      These two together are the evidence for the central timing claim.
 *   4. The most recent item — whether this is still live.
 *   5. Remaining slots spread evenly across the rest of the window by publication date,
 *      so the middle of the theme is represented rather than a single day of it.
 *
 * Rows come back in chronological order, because that is how the claim reads on the page.
 */
export function selectThemeEvidence(
  items: BriefInputItem[],
  watchTerms: string[],
  limit: number = BRIEF_MAX_EVIDENCE_PER_THEME
): BriefEvidence[] {
  if (!items.length || limit <= 0) return [];

  const chrono = [...items].sort((a, b) => a.publishedAtMs - b.publishedAtMs);
  const picked = new Map<string, BriefEvidenceRole>();

  const take = (item: BriefInputItem | undefined, role: BriefEvidenceRole) => {
    if (!item || picked.size >= limit || picked.has(item.id)) return;
    picked.set(item.id, role);
  };

  // 1. Namings, most recent first.
  const namings = [...chrono]
    .reverse()
    .filter((i) => itemNamesProspect(i, watchTerms));
  for (const item of namings) take(item, 'names_you');

  // 2-4. The rows that evidence the theme's shape and its timing claim.
  const first = chrono[0];
  take(first, 'first');
  take(
    chrono.find((i) => i.sourceId !== first.sourceId),
    'second_outlet'
  );
  take(chrono[chrono.length - 1], 'latest');

  // 5. Spread the remainder across the window instead of clustering on one date.
  const remaining = chrono.filter((i) => !picked.has(i.id));
  const slots = limit - picked.size;
  if (slots > 0 && remaining.length) {
    if (remaining.length <= slots) {
      for (const item of remaining) take(item, 'span');
    } else {
      const step = remaining.length / (slots + 1);
      for (let n = 1; n <= slots; n += 1) {
        take(remaining[Math.min(remaining.length - 1, Math.round(step * n))], 'span');
      }
      // Rounding can collide on short lists; backfill so a slot is never wasted.
      for (const item of remaining) take(item, 'span');
    }
  }

  return chrono
    .filter((i) => picked.has(i.id))
    .map((i) => toEvidence(i, watchTerms, picked.get(i.id)));
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

  const evidence = selectThemeEvidence(items, watchTerms, BRIEF_MAX_EVIDENCE_PER_THEME);

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
  content: Pick<BriefContent, 'totals' | 'windowDays' | 'dataSpanDays' | 'windowUnderfilled'>;
  sourceCount: number;
  hasWatchTerms: boolean;
}): string[] {
  const { content, sourceCount, hasWatchTerms } = input;
  // The opening line describes the window the data covers, not the one that was requested.
  const coveredDays = content.dataSpanDays ?? 0;
  const gaps: string[] = [
    `This brief reads ${sourceCount} permitted ${sourceCount === 1 ? 'feed' : 'feeds'} over ${coveredDays} ${coveredDays === 1 ? 'day' : 'days'} of published items. It is not the whole news agenda: paywalled titles, broadcast, most regional print and any publisher that blocks automated readers are not in it.`,
    'Coverage you secured through outlets outside this source set will not appear here. Absence from this brief is not absence from the media.',
    'We cannot see your own story pipeline, your embargoes or your members\u2019 plans. Themes marked as having run without you may well be ones you chose not to join.',
    'Nothing here predicts coverage. It records what was published, when, and by whom.',
  ];

  if (content.windowUnderfilled) {
    gaps.push(
      content.dataSpanDays === null
        ? `A ${content.windowDays}-day window was requested, but no published items fell inside it. There is nothing here to draw a conclusion from.`
        : `A ${content.windowDays}-day window was requested; the sources only carried items across ${content.dataSpanDays} ${content.dataSpanDays === 1 ? 'day' : 'days'} of it. Read every figure below as covering that shorter period.`
    );
  }

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

  // What the data actually covers, as opposed to what was asked for.
  const publishedTimes = items.map((i) => i.publishedAtMs);
  const dataStartMs = publishedTimes.length ? Math.min(...publishedTimes) : null;
  const dataEndMs = publishedTimes.length ? Math.max(...publishedTimes) : null;
  const dataSpanDays =
    dataStartMs !== null && dataEndMs !== null
      ? Math.max(0, Math.round((dataEndMs - dataStartMs) / DAY_MS))
      : null;
  // A fifth of the requested window missing is the point at which the headline figure stops
  // being a fair description of the document, so it gets disclosed rather than smoothed over.
  const windowUnderfilled =
    dataSpanDays === null || dataSpanDays < Math.floor(windowDays * 0.8);

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
    dataStartMs,
    dataEndMs,
    dataSpanDays,
    windowUnderfilled,
    totals,
    appearances,
    themes,
    gaps: buildBriefGaps({
      content: { totals, windowDays, dataSpanDays, windowUnderfilled },
      sourceCount: sourcesUsed.length,
      hasWatchTerms: watchTerms.length > 0,
    }),
    sourcesUsed,
  };
}
