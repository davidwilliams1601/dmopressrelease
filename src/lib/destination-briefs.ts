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
 * Why each evidence row is on the page.
 *
 * These labels exist to make the response-window claim checkable. A brief that says "a
 * second outlet followed 18 hours later" and then lists six items from the final day is
 * asking to be taken on trust; one that marks which row was first and which was the second
 * outlet has shown its working. `span` rows are deliberately unlabelled in the UI — they
 * are the ordinary middle of the theme and need no explanation.
 */
export const BRIEF_EVIDENCE_ROLE_LABELS: Record<string, string> = {
  names_you: 'Named you',
  first: 'First in this theme',
  second_outlet: 'Second outlet picked it up',
  latest: 'Most recent',
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

/**
 * Standing copy for the sending gate.
 *
 * Screen-only — none of this is ever printed on a brief. The gate is an internal
 * discipline, not a disclosure to the prospect: a brief that clears the bar should not
 * advertise that a bar exists, and one that fails it should not be sent at all.
 */
export const BRIEF_GATE_EXPLANATION =
  'A brief that records a thin window honestly is still a weak thing to send. These checks are ' +
  'stricter than the evidence thresholds: they ask whether there is enough here to be worth a ' +
  'communications director’s attention. When one fails, the fix is more ingestion time or more ' +
  'outlets — never softer wording over thinner evidence.';

export const BRIEF_GATE_OVERRIDE_HINT =
  'Overriding is legitimate when the weak numbers are the point of the conversation — a quiet ' +
  'window you intend to discuss, or a brief built for one specific theme. The reason is stored ' +
  'on the brief so the slate stays honest about what went out below the bar.';

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

/**
 * How to describe the period a brief covers.
 *
 * Always the days the data actually spans, never the window that was requested. A brief
 * generated over a 30-day window two weeks after ingestion started covers two weeks, and
 * saying otherwise is the single easiest claim on the page for a prospect to disprove.
 * Falls back to the requested window only for briefs stored before dataSpanDays existed.
 */
export function briefCoveredDays(content: {
  windowDays: number;
  dataSpanDays?: number | null;
}): number {
  return typeof content.dataSpanDays === 'number' ? content.dataSpanDays : content.windowDays;
}

/** One-line summary of the whole brief for the cover, from stored totals only. */
export function describeBriefHeadline(totals: {
  themesFound: number;
  themesWithoutMention: number;
  sourcesRepresented: number;
  windowDays: number;
  dataSpanDays?: number | null;
}): string {
  const { themesFound, themesWithoutMention, sourcesRepresented } = totals;
  const days = briefCoveredDays(totals);
  const period = days === 1 ? 'a single day' : `${days} days`;
  if (themesFound === 0) {
    return `No theme reached the evidence threshold across ${sourcesRepresented} sources in ${period} of coverage.`;
  }
  return (
    `${themesFound} ${themesFound === 1 ? 'theme' : 'themes'} moved across ${sourcesRepresented} sources in ${period} of coverage. ` +
    `${themesWithoutMention} of ${themesFound} ran without you named in ${themesWithoutMention === 1 ? 'it' : 'them'}.`
  );
}

/**
 * Screen-only copy for the share-link panel. Like the sending gate, this is internal: a
 * prospect opening the link sees the brief, not our note to ourselves about why it is a link
 * rather than an attachment.
 */
export const BRIEF_SHARE_LINK_EXPLANATION =
  'A read-only link to this exact brief. An attachment goes dark the moment it is sent; a link ' +
  'shows when it was opened and how many separate people opened it, which is how you find out it ' +
  'was forwarded to whoever actually makes the decision. No names, locations or devices are ' +
  'recorded — only opens and a count of distinct readers.';
