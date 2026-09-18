/**
 * Shared client-side constants for the Media Opportunities intelligence layer.
 *
 * Mirrors functions/src/media-opportunities-shared.ts. The two are kept as separate
 * copies because functions/ is a standalone TypeScript project that isn't bundled with
 * the Next.js app — the same pattern already used for src/lib/media-taxonomy.ts vs
 * functions/src/media-taxonomy.ts, and VERTICAL_LABELS in the admin cards.
 *
 * Keep every label here customer-facing. Internal mechanics (distinct-source counts,
 * window lengths) belong in the functions copy; this file is what a comms lead reads.
 */

/** The recommended next move on an opportunity. Deliberately includes two do-nothing
 *  options — a quiet week must be allowed to look quiet. */
export type MediaOpportunityAction =
  | 'prepare_comment'
  | 'create_release'
  | 'build_case_study'
  | 'offer_spokesperson'
  | 'targeted_pitch'
  | 'monitor'
  | 'no_action';

export type MediaOpportunityUrgency = 'today' | 'this_week' | 'plan_ahead';

export type MediaOpportunityConfidence = 'high' | 'medium';

export type MediaOpportunityStatus = 'new' | 'saved' | 'dismissed' | 'acted_on' | 'expired';

/** Why a theme was considered strong enough to look at. Rules-based, not a black-box score. */
export type MediaOpportunityMomentum = 'developing_theme' | 'emerging_opportunity';

export const OPPORTUNITY_ACTION_LABELS: Record<MediaOpportunityAction, string> = {
  prepare_comment: 'Prepare an expert comment',
  create_release: 'Create a release',
  build_case_study: 'Build a member case study',
  offer_spokesperson: 'Offer a spokesperson',
  targeted_pitch: 'Prepare a targeted pitch',
  monitor: 'Watch and prepare',
  no_action: 'No action recommended',
};

export const OPPORTUNITY_ACTION_DESCRIPTIONS: Record<MediaOpportunityAction, string> = {
  prepare_comment:
    'The conversation is already live. A short, quotable comment from a named spokesperson is the fastest credible way in.',
  create_release:
    'There is enough substance here for a story of your own. Build it as a release with evidence attached.',
  build_case_study:
    'One member illustrates this theme particularly well. A case study gives journalists the human example they need.',
  offer_spokesperson:
    'You have someone who can speak to this with authority. Offer them rather than a written statement.',
  targeted_pitch:
    'This suits a small number of specific outlets rather than a broadcast. Pitch narrowly.',
  monitor:
    'Genuine signal, but not yet an opening. Keep it in view and prepare the assets you would need.',
  no_action:
    'Related to your priorities, but there is no credible contribution here. Recorded for transparency, not for action.',
};

export const OPPORTUNITY_URGENCY_LABELS: Record<MediaOpportunityUrgency, string> = {
  today: 'Act today',
  this_week: 'This week',
  plan_ahead: 'Prepare ahead',
};

export const OPPORTUNITY_MOMENTUM_LABELS: Record<MediaOpportunityMomentum, string> = {
  developing_theme: 'Developing theme',
  emerging_opportunity: 'Emerging opportunity',
};

export const OPPORTUNITY_MOMENTUM_EXPLANATIONS: Record<MediaOpportunityMomentum, string> = {
  developing_theme:
    'At least two items from two different sources in the past seven days.',
  emerging_opportunity:
    'Three or more different sources covering this within 72 hours.',
};

export const OPPORTUNITY_CONFIDENCE_LABELS: Record<MediaOpportunityConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
};

export const OPPORTUNITY_CONFIDENCE_EXPLANATIONS: Record<MediaOpportunityConfidence, string> = {
  high: 'Several independent sources, and you have an approved story that speaks to it.',
  medium: 'More than one source, but the match to your own material is thinner. Check it yourself.',
};

export const OPPORTUNITY_STATUS_LABELS: Record<MediaOpportunityStatus, string> = {
  new: 'New',
  saved: 'Saved',
  dismissed: 'Dismissed',
  acted_on: 'Acted on',
  expired: 'Expired',
};

/** The feedback reasons offered in the queue. Kept short: this is product discovery
 *  first and ranking data second, and a long list gets ignored. */
export type MediaOpportunityFeedbackReason =
  | 'relevant'
  | 'not_relevant'
  | 'too_late'
  | 'no_angle'
  | 'wrong_geography'
  | 'sensitive_subject';

export const OPPORTUNITY_FEEDBACK_LABELS: Record<MediaOpportunityFeedbackReason, string> = {
  relevant: 'Useful — we would have wanted to know',
  not_relevant: 'Not relevant to us',
  too_late: 'We saw this too late',
  no_angle: 'We have no angle on this',
  wrong_geography: 'Wrong area for us',
  sensitive_subject: 'Not a subject we should join',
};

/**
 * The standing methodology statement. Shown in the queue, and reused verbatim on the
 * printed WTM destination briefs so the claim made on paper and the claim made in the
 * product are the same claim.
 */
export const OPPORTUNITY_METHODOLOGY_NOTE =
  'Press Pilot reviews a curated set of permitted feeds from travel-trade, regional, sector and official sources. ' +
  'It groups related coverage into themes and highlights only those where your organisation has a credible contribution of its own. ' +
  'It does not read the whole news agenda, does not access member data you have not given it, does not contact anyone on your behalf, ' +
  'and does not guarantee coverage. Every opportunity links to the sources it came from so you can judge it yourself.';

/** Human sentence for the deterministic evidence behind a card, e.g.
 *  "4 items across 3 sources in the past 5 days". Built from stored counts, never generated. */
export function describeEvidence(
  itemCount: number,
  distinctSourceCount: number,
  windowDays: number
): string {
  const items = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
  const sources = `${distinctSourceCount} source${distinctSourceCount === 1 ? '' : 's'}`;
  const days = windowDays <= 1 ? 'the past 24 hours' : `the past ${windowDays} days`;
  return `${items} across ${sources} in ${days}`;
}
