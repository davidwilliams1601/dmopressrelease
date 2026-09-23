/**
 * Dashboard figures, per level: the pure half.
 *
 * Three questions, one per level of the product:
 *  - Organisation team: "what needs our attention today, and what did our work produce?"
 *  - Network parent: "how is each member organisation doing against the network?"
 *  - Anyone, against peers: "is that good?" — answered only when there are enough peers for
 *    the answer to mean something and to not identify any one of them.
 *
 * Everything here is counted from records the organisation already holds. Nothing is
 * estimated, and no figure is shown without the period it covers.
 *
 * Two byte-identical copies live in functions/src and src/lib, guarded by a test.
 * No imports, so both builds can compile it unchanged.
 */

export type ReleaseLike = {
  id: string;
  status: 'Draft' | 'Ready' | 'Sent' | 'Scheduled' | string;
  hasHoldingText?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | string;
  /** Best available "when": sent/updated time for Sent releases, created time otherwise. */
  atMs: number | null;
  sourceOpportunityId?: string | null;
};

export type SubmissionLike = {
  id: string;
  status: 'submitted' | 'reviewed' | 'used' | 'archived' | string;
  atMs: number | null;
};

export type OpportunityLike = {
  id: string;
  status: 'new' | 'saved' | 'dismissed' | 'acted_on' | 'expired' | string;
  actedOnReleaseId?: string | null;
  atMs: number | null;
};

export type CoverageLike = {
  id: string;
  releaseId?: string | null;
  publishedAtMs: number;
};

export type AttentionItem = {
  key:
    | 'ready_to_send'
    | 'awaiting_approval'
    | 'holding_text'
    | 'stories_to_review'
    | 'new_opportunities'
    | 'coverage_to_log';
  count: number;
  label: string;
  href: string;
};

export type OutcomeChain = {
  storiesReceived: number;
  releasesSent: number;
  releasesPlaced: number;
  placements: number;
  opportunitiesActedOn: number;
  opportunitiesBecameReleases: number;
};

export type PeriodDelta = {
  current: number;
  previous: number;
  /** null when the previous period is zero: "up from nothing" is not a percentage. */
  pctChange: number | null;
  direction: 'up' | 'down' | 'flat';
};

export type PeerBenchmark =
  | { available: false; peerCount: number; minPeers: number }
  | {
      available: true;
      peerCount: number;
      minPeers: number;
      median: number;
      lowerQuartile: number;
      upperQuartile: number;
      own: number;
      position: 'above' | 'within' | 'below';
    };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Below this many peers a benchmark is withheld: too few to mean anything, and too few to anonymise. */
export const MIN_PEERS_FOR_BENCHMARK = 5;

/** A sent release with no coverage logged after this long gets a nudge to log (or confirm none). */
export const COVERAGE_NUDGE_AFTER_DAYS = 7;
/** ...and stops nudging after this, when the moment has passed. */
export const COVERAGE_NUDGE_UNTIL_DAYS = 45;

function between(ms: number | null | undefined, startMs: number, endMs: number): boolean {
  return typeof ms === 'number' && ms >= startMs && ms <= endMs;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The "what needs your attention" list. Zero-count items are dropped, so an empty list means
 * genuinely nothing waiting — the dashboard says so rather than showing a wall of zeros.
 */
export function buildAttentionItems(input: {
  releases: ReleaseLike[];
  submissions: SubmissionLike[];
  opportunities: OpportunityLike[];
  coverage: CoverageLike[];
  nowMs: number;
  labels?: { release?: string; releases?: string; story?: string; stories?: string };
}): AttentionItem[] {
  const l = {
    release: input.labels?.release || 'release',
    releases: input.labels?.releases || 'releases',
    story: input.labels?.story || 'story',
    stories: input.labels?.stories || 'stories',
  };

  const ready = input.releases.filter(
    (r) => r.status === 'Ready' && !r.hasHoldingText && r.approvalStatus !== 'pending' && r.approvalStatus !== 'rejected'
  ).length;
  const pending = input.releases.filter(
    (r) => (r.status === 'Draft' || r.status === 'Ready') && r.approvalStatus === 'pending'
  ).length;
  const holding = input.releases.filter(
    (r) => (r.status === 'Draft' || r.status === 'Ready') && r.hasHoldingText
  ).length;
  const toReview = input.submissions.filter((s) => s.status === 'submitted').length;
  const newOpps = input.opportunities.filter((o) => o.status === 'new').length;

  const placedReleaseIds = new Set(input.coverage.map((c) => c.releaseId).filter(Boolean) as string[]);
  const nudgeStart = input.nowMs - COVERAGE_NUDGE_UNTIL_DAYS * DAY_MS;
  const nudgeEnd = input.nowMs - COVERAGE_NUDGE_AFTER_DAYS * DAY_MS;
  const toLog = input.releases.filter(
    (r) => r.status === 'Sent' && between(r.atMs, nudgeStart, nudgeEnd) && !placedReleaseIds.has(r.id)
  ).length;

  const items: AttentionItem[] = [
    { key: 'ready_to_send', count: ready, label: `${ready} approved ${plural(ready, l.release, l.releases)} ready to send`, href: '/dashboard/releases' },
    { key: 'awaiting_approval', count: pending, label: `${pending} ${plural(pending, l.release, l.releases)} awaiting approval`, href: '/dashboard/releases' },
    { key: 'holding_text', count: holding, label: `${holding} ${plural(holding, 'draft', 'drafts')} still ${plural(holding, 'has', 'have')} holding text`, href: '/dashboard/releases' },
    { key: 'stories_to_review', count: toReview, label: `${toReview} ${plural(toReview, l.story, l.stories)} awaiting review`, href: '/dashboard/submissions' },
    { key: 'new_opportunities', count: newOpps, label: `${newOpps} new media ${plural(newOpps, 'opportunity', 'opportunities')}`, href: '/dashboard/opportunities' },
    { key: 'coverage_to_log', count: toLog, label: `${toLog} sent ${plural(toLog, l.release, l.releases)} with no coverage logged yet`, href: '/dashboard/coverage' },
  ];
  return items.filter((i) => i.count > 0);
}

/**
 * What the work produced in a period: story → release → placement, and opportunity → release.
 *
 * A release counts as placed if any coverage in the period is linked to it — coverage can land
 * weeks after a send, so the placement is dated by the article, not by the release.
 */
export function buildOutcomeChain(input: {
  releases: ReleaseLike[];
  submissions: SubmissionLike[];
  opportunities: OpportunityLike[];
  coverage: CoverageLike[];
  startMs: number;
  endMs: number;
}): OutcomeChain {
  const { startMs, endMs } = input;
  const cov = input.coverage.filter((c) => between(c.publishedAtMs, startMs, endMs));
  const acted = input.opportunities.filter((o) => o.status === 'acted_on' && between(o.atMs, startMs, endMs));
  return {
    storiesReceived: input.submissions.filter((s) => between(s.atMs, startMs, endMs)).length,
    releasesSent: input.releases.filter((r) => r.status === 'Sent' && between(r.atMs, startMs, endMs)).length,
    releasesPlaced: new Set(cov.map((c) => c.releaseId).filter(Boolean)).size,
    placements: cov.length,
    opportunitiesActedOn: acted.length,
    opportunitiesBecameReleases: acted.filter((o) => o.actedOnReleaseId).length,
  };
}

export function comparePeriods(current: number, previous: number): PeriodDelta {
  const direction = current > previous ? 'up' : current < previous ? 'down' : 'flat';
  const pctChange = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return { current, previous, pctChange, direction };
}

export function formatDelta(d: PeriodDelta): string {
  if (d.direction === 'flat') return 'same as the previous period';
  if (d.pctChange === null) return `up from ${d.previous} in the previous period`;
  return `${d.direction === 'up' ? 'up' : 'down'} ${Math.abs(d.pctChange)}% on the previous period (${d.previous})`;
}

/** Linear-interpolated quantile of a sorted array. */
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Where one organisation sits against its peers on one figure.
 *
 * `peers` must exclude the organisation itself. Only the median and quartiles leave this
 * function — never a list — and nothing at all below MIN_PEERS_FOR_BENCHMARK, because with
 * three peers the "median" is one identifiable organisation's number.
 */
export function peerBenchmark(own: number, peers: number[], minPeers = MIN_PEERS_FOR_BENCHMARK): PeerBenchmark {
  const clean = peers.filter((n) => Number.isFinite(n) && n >= 0);
  if (clean.length < minPeers) return { available: false, peerCount: clean.length, minPeers };
  const sorted = [...clean].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const lowerQuartile = quantile(sorted, 0.25);
  const upperQuartile = quantile(sorted, 0.75);
  const position = own > upperQuartile ? 'above' : own < lowerQuartile ? 'below' : 'within';
  return { available: true, peerCount: clean.length, minPeers, median, lowerQuartile, upperQuartile, own, position };
}

export function describePeerBenchmark(b: PeerBenchmark, noun: string): string {
  if (!b.available) {
    return `Peer comparison appears once at least ${b.minPeers} comparable organisations are logging ${noun}; there are ${b.peerCount} so far.`;
  }
  const med = Number.isInteger(b.median) ? String(b.median) : b.median.toFixed(1);
  const where =
    b.position === 'above' ? 'above the middle half of' : b.position === 'below' ? 'below the middle half of' : 'within the middle half of';
  return `${b.own} ${noun}: ${where} ${b.peerCount} comparable organisations (median ${med}).`;
}
