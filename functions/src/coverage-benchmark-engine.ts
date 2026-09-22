/**
 * Aggregate coverage benchmarks — the publishable version of what a brief measures.
 *
 * A Destination Brief is one organisation's mirror and can only ever be shown to them. But the
 * same measurements taken across the whole ingested pool answer a question every destination
 * marketer has and nobody can currently answer with a number: once a story starts in this
 * region, how long is it before a second outlet has it? That is marketing content that is
 * useful before anyone buys anything, which is the only kind worth publishing.
 *
 * Two rules make this safe to post:
 *
 *   1. **No prospect, customer or organisation is ever named or countable.** The input is the
 *      public item pool and the output is outlet-level aggregate. Nothing here reads
 *      /mediaProspects, watch terms, or whether anyone was named in anything — so a published
 *      benchmark cannot leak who we are talking to, and cannot be reverse-engineered into
 *      "Press Pilot is pitching Visit X".
 *   2. **No outlet league table.** Aggregates only, never "outlet A was 14 hours behind outlet
 *      B". The numbers are about how a region's media moves, not a ranking of newsrooms we
 *      need on side, and a stat that makes an editor defensive is worth less than no stat.
 *
 * Computed with the same functions a brief uses (groupBriefThemes, summariseTheme,
 * responseWindowHours in destination-brief-engine.ts) rather than a second implementation. If
 * the published median and the number on a prospect's own brief could disagree, the benchmark
 * would undermine the thing it exists to support.
 */

import {
  BRIEF_MIN_ITEMS,
  BriefInputItem,
  BriefTheme,
  groupBriefThemes,
  summariseTheme,
} from './destination-brief-engine';

/** A topic needs this many items before "it stayed with one outlet" is a fact about a story
 *  rather than about a single article. Same floor the brief uses for a theme. */
export const CLUSTER_MIN_ITEMS = BRIEF_MIN_ITEMS;

/** Bumped whenever the benchmark rules change, so a published figure can still be explained. */
export const BENCHMARK_VERSION = 'benchmark-1';

/**
 * A median of two numbers is not a median, it is an anecdote with a decimal point. Any figure
 * built on fewer observations than this is withheld and the reason is recorded, rather than
 * published with a caveat nobody reads.
 */
export const BENCHMARK_MIN_SAMPLE = 5;

/** Minimum outlets behind the whole benchmark before any of it is publishable. */
export const BENCHMARK_MIN_OUTLETS = 4;

export type BenchmarkDistribution = {
  sampleSize: number;
  medianHours: number;
  fastestHours: number;
  slowestHours: number;
  /** Quartiles, because "usually between X and Y" is more honest than a bare median. */
  p25Hours: number;
  p75Hours: number;
  /** Share of the sample where the second outlet followed inside one working day. */
  withinOneDayPct: number;
};

export type BenchmarkTopicRow = {
  label: string;
  themeCount: number;
  medianHours: number | null;
  /** Withheld rather than shown when the topic has too few themes to mean anything. */
  suppressed: boolean;
};

export type CoverageBenchmark = {
  version: string;
  windowDays: number;
  dataStartMs: number | null;
  dataEndMs: number | null;
  dataSpanDays: number | null;
  itemsAnalysed: number;
  outletCount: number;
  themesAnalysed: number;
  /** How long a story takes to reach a second outlet, across every theme in the window. */
  responseWindow: BenchmarkDistribution | null;
  /** Running stories (a topic carried three or more times) that never left the outlet that
   *  broke them. Counted over candidate clusters, not themes, because a theme already has two
   *  outlets by definition. */
  singleOutlet: {
    themeCount: number;
    singleOutletCount: number;
    sharePct: number;
  } | null;
  byTopic: BenchmarkTopicRow[];
  /** Every figure withheld, with the reason. Printed, not hidden — the discipline that makes
   *  the published ones believable. */
  withheld: string[];
  /** Ready-to-post sentences, each one carrying its own sample size. */
  statements: string[];
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = (sortedValues.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summariseDistribution(hoursValues: number[]): BenchmarkDistribution | null {
  if (hoursValues.length < BENCHMARK_MIN_SAMPLE) return null;
  const sorted = [...hoursValues].sort((a, b) => a - b);
  const withinOneDay = sorted.filter((h) => h <= 24).length;
  return {
    sampleSize: sorted.length,
    medianHours: round1(percentile(sorted, 0.5)),
    fastestHours: round1(sorted[0]),
    slowestHours: round1(sorted[sorted.length - 1]),
    p25Hours: round1(percentile(sorted, 0.25)),
    p75Hours: round1(percentile(sorted, 0.75)),
    withinOneDayPct: Math.round((withinOneDay / sorted.length) * 100),
  };
}

/**
 * Describes a duration the way a person would say it, because these sentences get posted.
 * "1.5 days" reads as a considered figure; "36.4 hours" reads as a spreadsheet.
 */
export function describeHours(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 36) {
    const rounded = Math.round(hours);
    return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`;
  }
  const days = round1(hours / 24);
  return `${days} days`;
}

/**
 * Builds the benchmark from an ingested item pool.
 *
 * Themes are grouped with no priority topics and scored with no watch terms, so nothing about
 * any prospect influences which themes are counted — the aggregate is a property of the
 * region's coverage, not of our pipeline.
 */
export function computeCoverageBenchmark(input: {
  items: BriefInputItem[];
  windowDays: number;
  nowMs: number;
  /** Label for the geography this pool represents, e.g. 'West of England'. Never a prospect. */
  regionLabel?: string;
}): CoverageBenchmark {
  const { items, windowDays, nowMs } = input;
  const cutoff = nowMs - windowDays * DAY_MS;
  const inWindow = items.filter((i) => i.publishedAtMs >= cutoff && i.publishedAtMs <= nowMs);

  const withheld: string[] = [];
  const outletIds = new Set(inWindow.map((i) => i.sourceId));
  const publishedMs = inWindow.map((i) => i.publishedAtMs).sort((a, b) => a - b);
  const dataStartMs = publishedMs.length ? publishedMs[0] : null;
  const dataEndMs = publishedMs.length ? publishedMs[publishedMs.length - 1] : null;
  const dataSpanDays =
    dataStartMs !== null && dataEndMs !== null
      ? Math.round((dataEndMs - dataStartMs) / DAY_MS)
      : null;

  // Grouped and summarised by the brief's own functions. Themes below the brief's evidence bar
  // are excluded here too — a benchmark built on weaker evidence than the briefs it supports
  // would be the wrong way round.
  const groups = groupBriefThemes(inWindow, {});
  const themes: BriefTheme[] = [];
  for (const group of groups) {
    const theme = summariseTheme(group, []);
    if (theme) themes.push(theme);
  }

  const responseHours = themes
    .map((t) => t.responseWindowHours)
    .filter((h): h is number => typeof h === 'number');

  const responseWindow = summariseDistribution(responseHours);
  if (!responseWindow) {
    withheld.push(
      `Second-outlet window withheld: ${responseHours.length} ${responseHours.length === 1 ? 'theme' : 'themes'} with a measurable window, ${BENCHMARK_MIN_SAMPLE} needed.`
    );
  }

  // Whether a story stayed put.
  //
  // This cannot be read off `themes`: summariseTheme requires two outlets before it will call
  // something a theme, so every theme has spread by definition. The interesting population is
  // the one the brief bar excludes — topic clusters with enough items to be a running story but
  // only one outlet carrying it. Counted from the candidate groups for that reason.
  const clusters = groups
    .filter((g) => g.kind === 'topic' && g.items.length >= CLUSTER_MIN_ITEMS)
    .map((g) => new Set(g.items.map((i) => i.sourceId)).size);

  const singleOutlet =
    clusters.length >= BENCHMARK_MIN_SAMPLE
      ? {
          themeCount: clusters.length,
          singleOutletCount: clusters.filter((n) => n === 1).length,
          sharePct: Math.round((clusters.filter((n) => n === 1).length / clusters.length) * 100),
        }
      : null;
  if (!singleOutlet) {
    withheld.push(
      `Single-outlet share withheld: ${clusters.length} ${clusters.length === 1 ? 'story cluster' : 'story clusters'} of ${CLUSTER_MIN_ITEMS}+ items, ${BENCHMARK_MIN_SAMPLE} needed.`
    );
  }

  // Per-topic rows, suppressed individually. A topic with two themes is shown as suppressed
  // rather than omitted, so the table cannot be mistaken for the full picture.
  const byTopicMap = new Map<string, number[]>();
  const topicThemeCounts = new Map<string, number>();
  for (const theme of themes) {
    if (theme.kind !== 'topic') continue;
    topicThemeCounts.set(theme.label, (topicThemeCounts.get(theme.label) || 0) + 1);
    if (typeof theme.responseWindowHours === 'number') {
      const existing = byTopicMap.get(theme.label) || [];
      existing.push(theme.responseWindowHours);
      byTopicMap.set(theme.label, existing);
    }
  }

  const byTopic: BenchmarkTopicRow[] = [...topicThemeCounts.entries()]
    .map(([label, themeCount]) => {
      const hours = byTopicMap.get(label) || [];
      const enough = hours.length >= BENCHMARK_MIN_SAMPLE;
      return {
        label,
        themeCount,
        medianHours: enough ? round1(percentile([...hours].sort((a, b) => a - b), 0.5)) : null,
        suppressed: !enough,
      };
    })
    .sort((a, b) => b.themeCount - a.themeCount);

  if (outletIds.size < BENCHMARK_MIN_OUTLETS) {
    withheld.push(
      `Whole benchmark is provisional: ${outletIds.size} ${outletIds.size === 1 ? 'outlet' : 'outlets'} published in this window, ${BENCHMARK_MIN_OUTLETS} needed before publishing any figure.`
    );
  }

  return {
    version: BENCHMARK_VERSION,
    windowDays,
    dataStartMs,
    dataEndMs,
    dataSpanDays,
    itemsAnalysed: inWindow.length,
    outletCount: outletIds.size,
    themesAnalysed: themes.length,
    responseWindow,
    singleOutlet,
    byTopic,
    withheld,
    statements: buildStatements({
      responseWindow,
      singleOutlet,
      outletCount: outletIds.size,
      dataSpanDays,
      itemsAnalysed: inWindow.length,
      regionLabel: input.regionLabel,
    }),
  };
}

/**
 * The publishable sentences.
 *
 * Each one carries its own sample size and window, because a statistic posted without them is
 * indistinguishable from one that was invented, and the entire argument for this content is
 * that ours are not. Nothing here claims causation, predicts anything, or mentions the product:
 * the marketing job of these lines is to be quotable and checkable.
 *
 * Returns an empty list when nothing clears the bar. Publishing no number is a valid outcome,
 * and a better one than publishing a soft number.
 */
export function buildStatements(input: {
  responseWindow: BenchmarkDistribution | null;
  singleOutlet: CoverageBenchmark['singleOutlet'];
  outletCount: number;
  dataSpanDays: number | null;
  itemsAnalysed: number;
  regionLabel?: string;
}): string[] {
  const out: string[] = [];
  if (input.outletCount < BENCHMARK_MIN_OUTLETS) return out;

  const where = input.regionLabel ? ` across ${input.regionLabel}` : '';
  const period =
    typeof input.dataSpanDays === 'number'
      ? `${input.dataSpanDays} ${input.dataSpanDays === 1 ? 'day' : 'days'}`
      : 'the window';

  if (input.responseWindow) {
    const r = input.responseWindow;
    out.push(
      `Across ${r.sampleSize} local news stories${where} in the last ${period}, the median gap between the first outlet publishing and a second outlet picking it up was ${describeHours(r.medianHours)}.`
    );
    out.push(
      `${r.withinOneDayPct}% of those stories had reached a second outlet inside 24 hours. If you are deciding on a Tuesday what to say about something that broke on Monday, the story is usually already set.`
    );
    out.push(
      `The middle half of stories spread in ${describeHours(r.p25Hours)} to ${describeHours(r.p75Hours)}. The fastest was ${describeHours(r.fastestHours)}; the slowest took ${describeHours(r.slowestHours)}.`
    );
  }

  if (input.singleOutlet) {
    const s = input.singleOutlet;
    out.push(
      `Of ${s.themeCount} running stories${where} — subjects carried three or more times in the window — ${s.singleOutletCount} (${s.sharePct}%) never left the outlet that broke them. Most coverage does not spread, which is why the share that does is the part worth being ready for.`
    );
  }

  if (out.length > 0) {
    out.push(
      `Method: ${input.itemsAnalysed} published items from ${input.outletCount} outlets${where}, measured over ${period} from public RSS feeds. No paywalled or print-only coverage. No organisation is named, counted or identifiable in these figures.`
    );
  }

  return out;
}
