/**
 * Client-side labels and standing copy for Destination Media Opportunity Briefs.
 *
 * Kept in src/lib/ (separate from functions/src/) by the same convention as
 * media-taxonomy.ts and media-opportunities.ts: functions/ is a standalone TS project.
 *
 * The wording here is load-bearing. A brief is handed to a communications director who
 * reads sales material for a living, and its credibility rests on saying exactly what was
 * measured and exactly what was not. Nothing in this file should be softened into
 * marketing language.
 */

import type { DestinationBriefTheme } from '@/lib/types';

export const BRIEF_ROUTE_LABELS: Record<DestinationBriefTheme['route'], string> = {
  ran_without_you: 'Ran without you',
  you_were_in_it: 'You were in it',
};

export const BRIEF_ROUTE_EXPLANATIONS: Record<DestinationBriefTheme['route'], string> = {
  ran_without_you:
    'None of the coverage in this theme named your organisation or any of your watch terms.',
  you_were_in_it:
    'At least one item in this theme named your organisation or one of your watch terms.',
};

export const BRIEF_THEME_KIND_LABELS: Record<DestinationBriefTheme['kind'], string> = {
  watch_term: 'Your own name or asset',
  topic: 'Sector theme',
};

/**
 * The methodology statement printed on every brief.
 *
 * Deliberately near-identical in substance to OPPORTUNITY_METHODOLOGY_NOTE in
 * src/lib/media-opportunities.ts, because the claim made on paper at a trade show and the
 * claim made inside the product must be the same claim. If one is ever changed, change both.
 */
export const BRIEF_METHODOLOGY_NOTE =
  'This brief was produced by Press Pilot from a curated set of permitted feeds: travel-trade, regional, sector and official sources. ' +
  'It groups related coverage into themes, records how many outlets carried each theme and when, and checks whether your organisation ' +
  'or your named assets appeared in that coverage. It does not read the whole news agenda, does not use any data you have not published, ' +
  'does not contact anyone, and does not predict coverage. Every item below links to its original source with its publication date so you can check it yourself.';

/**
 * The future-state paragraph. Always rendered under an explicit heading that marks it as
 * what the product does, separate from the measured findings above it — the one thing that
 * would make this document dishonest is blurring that line.
 */
export const BRIEF_FUTURE_STATE_NOTE =
  'We produced this brief by hand, once. Press Pilot is the system that does it continuously: ' +
  'it watches these sources for you, groups coverage into themes as it emerges, and tells your team ' +
  'when a theme is moving and one of your members has a story that belongs in it. It recommends a route ' +
  'and drafts the brief; your team decides whether to act. It never contacts a journalist on your behalf.';

/** Human sentence for a theme's deterministic facts. Built from stored counts, never generated. */
export function describeBriefTheme(theme: DestinationBriefTheme): string {
  const items = `${theme.itemCount} ${theme.itemCount === 1 ? 'item' : 'items'}`;
  const sources = `${theme.distinctSourceCount} ${theme.distinctSourceCount === 1 ? 'outlet' : 'outlets'}`;
  const span =
    theme.spanDays === 0
      ? 'inside a single day'
      : `over ${theme.spanDays} ${theme.spanDays === 1 ? 'day' : 'days'}`;
  return `${items} across ${sources} ${span}`;
}

/**
 * The response-window sentence — the most useful line in the brief, because it is a fact
 * about time rather than a claim about value.
 */
export function describeResponseWindow(theme: DestinationBriefTheme): string | null {
  if (theme.responseWindowHours === null) return null;
  const h = theme.responseWindowHours;
  if (h < 1) return 'A second outlet followed within the hour.';
  if (h < 24) {
    const rounded = Math.round(h);
    return `A second outlet followed ${rounded} ${rounded === 1 ? 'hour' : 'hours'} later — that was the window to respond.`;
  }
  const days = Math.round(h / 24);
  return `A second outlet followed ${days} ${days === 1 ? 'day' : 'days'} later — that was the window to respond.`;
}

/** One-line summary of the whole brief for the cover, from stored totals only. */
export function describeBriefHeadline(totals: {
  themesFound: number;
  themesWithoutMention: number;
  sourcesRepresented: number;
  windowDays: number;
}): string {
  const { themesFound, themesWithoutMention, sourcesRepresented, windowDays } = totals;
  if (themesFound === 0) {
    return `No theme reached the evidence threshold across ${sourcesRepresented} sources in the last ${windowDays} days.`;
  }
  return (
    `${themesFound} ${themesFound === 1 ? 'theme' : 'themes'} moved across ${sourcesRepresented} sources in the last ${windowDays} days. ` +
    `${themesWithoutMention} of ${themesFound} ran without you named in ${themesWithoutMention === 1 ? 'it' : 'them'}.`
  );
}
