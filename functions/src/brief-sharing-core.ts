/**
 * Pure logic behind the tokenised brief share link.
 *
 * Kept free of firebase-admin so it can be unit tested, in the same split as
 * destination-brief-engine.ts (pure) / destination-briefs.ts (callables).
 *
 * Two questions live here, and both are the kind that must be answered the same way every
 * time: is this link still allowed to be opened, and what exactly may a person holding the
 * link see? The second one matters most. A brief document lives under /mediaProspects, which
 * is superadmin-only and holds our own notes about a prospect. Nothing from that record may
 * leak through a public URL, so the shared payload is built by naming the fields that go out
 * rather than by deleting the fields that must not — a field added to a brief later is then
 * private by default instead of published by accident.
 */

/** Anything with the shape of a stored share link. */
export type ShareLinkRecord = {
  revoked?: boolean;
  expiresAtMs?: number | null;
};

export type ShareLinkState =
  | { openable: true }
  | { openable: false; reason: 'revoked' | 'expired' };

export function shareLinkState(link: ShareLinkRecord, nowMs: number): ShareLinkState {
  // Revocation is checked first: a link David has deliberately switched off should report as
  // revoked even if it also happens to have aged out, because that is the fact he acted on.
  if (link.revoked === true) return { openable: false, reason: 'revoked' };
  if (typeof link.expiresAtMs === 'number' && nowMs >= link.expiresAtMs) {
    return { openable: false, reason: 'expired' };
  }
  return { openable: true };
}

/** How long a link lasts unless told otherwise. Long enough for a trade-show follow-up cycle. */
export const SHARE_LINK_DEFAULT_TTL_DAYS = 90;
export const SHARE_LINK_MIN_TTL_DAYS = 1;
export const SHARE_LINK_MAX_TTL_DAYS = 365;

export function resolveExpiry(nowMs: number, ttlDays?: number | null): number {
  const raw = typeof ttlDays === 'number' && Number.isFinite(ttlDays)
    ? Math.round(ttlDays)
    : SHARE_LINK_DEFAULT_TTL_DAYS;
  const clamped = Math.min(SHARE_LINK_MAX_TTL_DAYS, Math.max(SHARE_LINK_MIN_TTL_DAYS, raw));
  return nowMs + clamped * 24 * 60 * 60 * 1000;
}

/** The document a link holder is allowed to render. */
export type SharedBriefPayload = {
  prospectName: string;
  headline: string;
  openingNote: string;
  closingNote: string;
  watchTermsUsed: string[];
  generatedAtMs: number | null;
  content: unknown;
};

/**
 * Builds the public payload from a stored brief by allow-list.
 *
 * `content.sendability` is dropped here. The gate is our internal test of whether a brief was
 * worth a prospect's time; it is not a finding about their coverage and has no business on a
 * page they can read. Same for anything else we might later hang off a brief for our own use.
 */
export function buildSharedBriefPayload(brief: Record<string, any>): SharedBriefPayload {
  const content = (brief.content || {}) as Record<string, any>;
  const { sendability: _internalGate, ...publicContent } = content;

  return {
    prospectName: String(brief.prospectName || ''),
    headline: String(brief.headline || ''),
    openingNote: String(brief.openingNote || ''),
    closingNote: String(brief.closingNote || ''),
    watchTermsUsed: Array.isArray(brief.watchTermsUsed)
      ? brief.watchTermsUsed.map((t: unknown) => String(t))
      : [],
    generatedAtMs: toMillis(brief.generatedAt),
    content: {
      windowDays: publicContent.windowDays ?? null,
      dataStartMs: publicContent.dataStartMs ?? null,
      dataEndMs: publicContent.dataEndMs ?? null,
      dataSpanDays: publicContent.dataSpanDays ?? null,
      windowUnderfilled: publicContent.windowUnderfilled ?? false,
      totals: publicContent.totals ?? null,
      themes: publicContent.themes ?? [],
      appearances: publicContent.appearances ?? [],
      gaps: publicContent.gaps ?? [],
      sourcesUsed: publicContent.sourcesUsed ?? [],
      generatorVersion: publicContent.generatorVersion ?? null,
    },
  };
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  return null;
}

/**
 * Whether a view from this viewer counts as a new reader of the link.
 *
 * `viewerId` is an opaque random string the public page keeps in its own localStorage. It is
 * never derived from an IP address, a user agent or an email, so it cannot identify a person —
 * it only distinguishes "the same browser reopened this" from "someone else opened this". That
 * distinction is the whole point: a link forwarded to three colleagues shows three viewers,
 * which is the signal worth having, and we get it without collecting anything personal.
 */
export function isNewViewer(seenViewerIds: string[], viewerId: string | null | undefined): boolean {
  if (!viewerId) return true; // Unidentifiable opens are counted as distinct rather than dropped.
  return !seenViewerIds.includes(viewerId);
}

/** Cap on how many viewer ids we retain on the link doc, newest kept. */
export const SHARE_LINK_MAX_TRACKED_VIEWERS = 50;

export function trackViewer(seenViewerIds: string[], viewerId: string | null | undefined): string[] {
  if (!viewerId) return seenViewerIds;
  const next = seenViewerIds.filter((id) => id !== viewerId);
  next.push(viewerId);
  return next.slice(-SHARE_LINK_MAX_TRACKED_VIEWERS);
}
