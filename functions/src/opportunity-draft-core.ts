/**
 * Opportunity → draft: the pure half.
 *
 * An opportunity card says "this theme is moving and it is relevant to you". Until now the
 * only route onward was a "Start a draft" link to a page that did not exist. This module
 * decides two things, deterministically and without any model call:
 *
 *  1. The draft seed — a working headline and a body scaffold shaped by the suggested
 *     action. The scaffold is prompts in square brackets, not generated copy, and the
 *     release is created with holding text flagged, so sending is blocked until a person
 *     has written it. Press Pilot says what is worth writing about; the team writes it.
 *
 *  2. Which members could give the story a local face — ranked by overlap between the
 *     opportunity's topics, geography and title, and each member's profile categories,
 *     description and recent story themes. Every suggestion carries the reasons it was
 *     made, because a list of names with no "why" is a list nobody trusts.
 *
 * Two byte-identical copies live in functions/src and src/lib, guarded by a test.
 * No imports, so both builds can compile it unchanged.
 */

export type OpportunityAction =
  | 'prepare_comment'
  | 'create_release'
  | 'build_case_study'
  | 'offer_spokesperson'
  | 'targeted_pitch'
  | 'monitor'
  | 'no_action';

export type OpportunityLike = {
  id: string;
  title: string;
  summary?: string;
  suggestedAction: OpportunityAction;
  topicTags?: string[];
  geographyTags?: string[];
  matchedTopics?: string[];
};

export type MemberLike = {
  id: string;
  name: string;
  businessDescription?: string;
  businessCategories?: string[];
};

export type MemberStoryLike = {
  id: string;
  partnerId: string;
  title: string;
  aiThemes?: string[];
  status?: string;
  createdAtMs?: number | null;
};

export type MemberSuggestion = {
  memberId: string;
  memberName: string;
  score: number;
  reasons: string[];
  /** Up to three of their stories that matched, newest first. */
  storyIds: string[];
  storyTitles: string[];
};

export type DraftSeed = {
  headline: string;
  bodyCopy: string;
  /** Always true: the scaffold is prompts, and the send gate must hold until they are replaced. */
  hasHoldingText: true;
};

/** How many members to suggest. More than this and it stops being a suggestion. */
export const MAX_MEMBER_SUGGESTIONS = 5;

/** Stories older than this do not count as evidence a member has a current angle. */
export const MEMBER_STORY_MAX_AGE_DAYS = 365;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'this', 'that', 'what', 'your', 'their',
  'about', 'after', 'amid', 'more', 'less', 'new', 'news', 'says', 'said', 'will', 'are', 'was',
  'has', 'have', 'its', 'our', 'out', 'how', 'why', 'who', 'rise', 'rises', 'grows', 'demand',
  'record', 'year', 'week', 'month', 'across', 'than', 'they', 'them', 'been', 'being', 'also',
]);

/** Lower-case word tokens of at least four letters, minus stop words. */
export function keywordsOf(text: string | undefined | null): string[] {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9&\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Case-insensitive intersection, returning the left-hand spelling. */
function overlap(a: string[] | undefined, b: string[] | undefined): string[] {
  if (!a?.length || !b?.length) return [];
  const right = new Set(b.map(norm));
  return [...new Set(a.filter((x) => right.has(norm(x))))];
}

const ACTION_SCAFFOLDS: Record<OpportunityAction, string[]> = {
  prepare_comment: [
    '[Your view in one sentence: what does this theme mean for your area or members?]',
    '[The evidence behind it — a figure, a trend you can see, or a member example.]',
    '[Quote from your spokesperson, with name and role.]',
    '[What happens next, or what you are asking for.]',
  ],
  create_release: [
    '[Lead: the news in one sentence — who, what, where, when.]',
    '[Why now: connect it to the wider theme outlets are already covering.]',
    '[Member or local example that makes it concrete.]',
    '[Quote from your spokesperson, with name and role.]',
    '[Practical detail: dates, prices, how to find out more.]',
  ],
  build_case_study: [
    '[The member and what they do, in one sentence.]',
    '[What they did or saw that connects to this theme.]',
    '[The result, with a number if they will share one.]',
    '[Quote from the member, with name and role.]',
    '[How your organisation supported them.]',
  ],
  offer_spokesperson: [
    '[Who is available, their role, and why they are credible on this theme.]',
    '[Two or three points they can speak to.]',
    '[Availability: dates, times, in person or remote.]',
  ],
  targeted_pitch: [
    '[The angle for this outlet, in one sentence.]',
    '[Why their readers care, and why now.]',
    '[What you can offer: interview, data, images, member example.]',
  ],
  monitor: [
    '[What you would say if this theme reaches you.]',
    '[Who would say it, and which member examples you could use.]',
  ],
  no_action: ['[Notes for later.]'],
};

/**
 * Builds the starting point for a draft release.
 *
 * The headline is marked as a working title so nobody mistakes the theme label for a
 * headline worth sending; the scaffold is shaped by the suggested action; matched members
 * are named as prompts, never written into quotes.
 */
export function buildOpportunityDraftSeed(
  opportunity: OpportunityLike,
  members: Array<Pick<MemberSuggestion, 'memberName'>> = []
): DraftSeed {
  const lines = [...(ACTION_SCAFFOLDS[opportunity.suggestedAction] || ACTION_SCAFFOLDS.create_release)];
  if (members.length) {
    const names = members.map((m) => m.memberName).join(', ');
    lines.push(`[Members who could give this a local face: ${names}. Ask before naming them.]`);
  }
  return {
    headline: `Working title: ${opportunity.title}`.slice(0, 200),
    bodyCopy: lines.join('\n\n'),
    hasHoldingText: true,
  };
}

/**
 * Ranks members against an opportunity.
 *
 * Scoring, highest weight first:
 *  - a profile category equal to one of the opportunity's topics (3 each)
 *  - a recent story whose themes include one of the opportunity's topics (2 each, max 3 stories)
 *  - a geography tag named in the member's description (2)
 *  - title keywords found in the member's description or story titles (1 each, max 3)
 *
 * Members scoring zero are never returned. Ties break on name so the list is stable.
 */
export function rankMembersForOpportunity(input: {
  opportunity: OpportunityLike;
  members: MemberLike[];
  stories?: MemberStoryLike[];
  nowMs?: number;
  limit?: number;
}): MemberSuggestion[] {
  const { opportunity } = input;
  const nowMs = input.nowMs ?? Date.now();
  const limit = input.limit ?? MAX_MEMBER_SUGGESTIONS;
  const topics = [...new Set([...(opportunity.matchedTopics || []), ...(opportunity.topicTags || [])])];
  const geographies = opportunity.geographyTags || [];
  const titleWords = keywordsOf(`${opportunity.title} ${opportunity.summary || ''}`);
  const cutoff = nowMs - MEMBER_STORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const storiesByMember = new Map<string, MemberStoryLike[]>();
  for (const s of input.stories || []) {
    if (s.status === 'archived') continue;
    if (typeof s.createdAtMs === 'number' && s.createdAtMs < cutoff) continue;
    const list = storiesByMember.get(s.partnerId) || [];
    list.push(s);
    storiesByMember.set(s.partnerId, list);
  }

  const out: MemberSuggestion[] = [];
  for (const m of input.members) {
    let score = 0;
    const reasons: string[] = [];

    const catHits = overlap(m.businessCategories, topics);
    if (catHits.length) {
      score += 3 * catHits.length;
      reasons.push(`Profile category: ${catHits.join(', ')}`);
    }

    const stories = [...(storiesByMember.get(m.id) || [])].sort(
      (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)
    );
    const themed = stories.filter((s) => overlap(s.aiThemes, topics).length > 0).slice(0, 3);
    if (themed.length) {
      score += 2 * themed.length;
      reasons.push(
        `${themed.length} recent ${themed.length === 1 ? 'story' : 'stories'} on ${overlap(themed.flatMap((s) => s.aiThemes || []), topics).join(', ')}`
      );
    }

    const desc = norm(m.businessDescription || '');
    const geoHit = geographies.find((g) => g.trim().length >= 3 && desc.includes(norm(g)));
    if (geoHit) {
      score += 2;
      reasons.push(`Based in or serves ${geoHit}`);
    }

    const memberText = new Set(keywordsOf(`${m.businessDescription || ''} ${stories.map((s) => s.title).join(' ')}`));
    const wordHits = titleWords.filter((w) => memberText.has(w)).slice(0, 3);
    if (wordHits.length) {
      score += wordHits.length;
      reasons.push(`Mentions ${wordHits.join(', ')}`);
    }

    if (score === 0) continue;
    out.push({
      memberId: m.id,
      memberName: m.name,
      score,
      reasons,
      storyIds: themed.map((s) => s.id),
      storyTitles: themed.map((s) => s.title),
    });
  }

  return out
    .sort((a, b) => b.score - a.score || a.memberName.localeCompare(b.memberName))
    .slice(0, limit);
}
