/**
 * Tokenised share links for Destination Briefs.
 *
 * The brief was only ever a PDF handed over at a stand or attached to an email, which means
 * the moment it left David's hands it went dark: no way to know whether it was opened, whether
 * it was forwarded to the person who actually signs things, or whether it was read twice the
 * week before a meeting. Those are the only facts that tell you a brief worked.
 *
 * So a final brief can be given a random URL that renders the same document read-only, and
 * opening it is recorded. This reuses the shape of recordReleasePageView (see page-views.ts):
 * a public callable rather than a public Firestore rule, so the write path stays narrow and
 * server-validated and no client-writable field is ever opened on a stored document.
 *
 * Deliberate limits:
 *
 *   - Only a brief marked `final` can be shared. `final` already means "this goes to a
 *     prospect" and is gated on sendability, so sharing inherits that bar for free instead of
 *     inventing a second one.
 *   - The link reads through a function, never through Firestore. /mediaProspects is
 *     superadmin-only commercial data and stays that way; the payload is built by allow-list
 *     in brief-sharing-core.ts.
 *   - No IP address, user agent, location or email is recorded. Distinct readers are counted
 *     with an opaque random id the browser keeps for itself. That is enough to see a forward
 *     and not enough to identify a person.
 *   - The token is the credential. It is long and random, links expire, and any link can be
 *     revoked, but anyone holding it can read the brief — which is the intent, since the
 *     prospect is meant to be able to forward it to a colleague without being asked to log in.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import {
  SHARE_LINK_DEFAULT_TTL_DAYS,
  buildSharedBriefPayload,
  isNewViewer,
  resolveExpiry,
  shareLinkState,
  trackViewer,
} from './brief-sharing-core';

const db = admin.firestore();

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

/** Duplicated per-file by repo convention (see destination-briefs.ts, media-opportunities.ts). */
function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (!context.auth.token?.superAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
  }
}

function trimmed(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * 32 hex characters from a CSPRNG. This is the only thing standing between a public URL and a
 * commercial document, so it is not derived from the brief id, the prospect name or a
 * timestamp — a guessable token would turn the whole prospect pipeline into an open directory.
 */
function newToken(): string {
  return randomBytes(16).toString('hex');
}

function shareUrl(token: string): string {
  return `${appUrl}/brief/${token}`;
}

export const createBriefShareLink = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const prospectId = trimmed(data?.prospectId, 200);
  const briefId = trimmed(data?.briefId, 200);
  if (!prospectId || !briefId) {
    throw new functions.https.HttpsError('invalid-argument', 'prospectId and briefId are required.');
  }

  const briefRef = db
    .collection('mediaProspects')
    .doc(prospectId)
    .collection('briefs')
    .doc(briefId);
  const briefSnap = await briefRef.get();
  if (!briefSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Brief not found.');
  }

  const brief = briefSnap.data() as Record<string, any>;
  if (brief.status !== 'final') {
    // Sharing inherits the sending gate rather than duplicating it: a brief becomes final only
    // by clearing the bar or by a recorded override, so there is no second, softer route out.
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Only a brief marked final can be shared. Mark it final first — that is where the sending bar is checked.'
    );
  }

  const nowMs = Date.now();
  const token = newToken();
  const expiresAtMs = resolveExpiry(nowMs, data?.ttlDays);

  await db.collection('briefShareLinks').doc(token).set({
    token,
    prospectId,
    briefId,
    prospectName: brief.prospectName || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: nowMs,
    createdByUid: context.auth!.uid,
    expiresAtMs,
    revoked: false,
    viewCount: 0,
    distinctViewerCount: 0,
    firstViewedAtMs: null,
    lastViewedAtMs: null,
    seenViewerIds: [],
  });

  return { token, url: shareUrl(token), expiresAtMs, ttlDays: SHARE_LINK_DEFAULT_TTL_DAYS };
});

export const revokeBriefShareLink = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const token = trimmed(data?.token, 200);
  if (!token) {
    throw new functions.https.HttpsError('invalid-argument', 'token is required.');
  }

  const ref = db.collection('briefShareLinks').doc(token);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Share link not found.');
  }

  // Revoked rather than deleted, so the view history of a link that was pulled survives the
  // pulling of it. "It was opened four times and then I revoked it" is a useful sentence.
  await ref.update({
    revoked: true,
    revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    revokedByUid: context.auth!.uid,
  });

  return { ok: true };
});

/**
 * Public read of a shared brief. Deliberately no context.auth check — a prospect and whoever
 * they forward it to are never signed in — in the same way as recordReleasePageView.
 *
 * Recording the view happens here rather than in a separate call so that a view is only ever
 * counted against a link that actually served a document.
 */
export const getSharedBrief = functions.https.onCall(async (data) => {
  const token = trimmed(data?.token, 200);
  const viewerId = trimmed(data?.viewerId, 100) || null;
  if (!token) {
    throw new functions.https.HttpsError('invalid-argument', 'token is required.');
  }

  const linkRef = db.collection('briefShareLinks').doc(token);
  const linkSnap = await linkRef.get();
  if (!linkSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'This link is not valid.');
  }

  const link = linkSnap.data() as Record<string, any>;
  const nowMs = Date.now();
  const state = shareLinkState(link, nowMs);
  if (!state.openable) {
    throw new functions.https.HttpsError(
      'permission-denied',
      state.reason === 'revoked'
        ? 'This link has been withdrawn.'
        : 'This link has expired.'
    );
  }

  const briefSnap = await db
    .collection('mediaProspects')
    .doc(String(link.prospectId))
    .collection('briefs')
    .doc(String(link.briefId))
    .get();
  if (!briefSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'This brief is no longer available.');
  }

  const brief = briefSnap.data() as Record<string, any>;
  if (brief.status !== 'final') {
    // A brief pulled back to draft stops being shareable immediately — otherwise a link
    // created while it was final would outlive the decision to withdraw it.
    throw new functions.https.HttpsError('permission-denied', 'This brief is no longer available.');
  }

  const seen: string[] = Array.isArray(link.seenViewerIds) ? link.seenViewerIds.map(String) : [];
  const newViewer = isNewViewer(seen, viewerId);

  // Best effort: a failed counter must never stop the prospect from reading the document.
  try {
    await linkRef.update({
      viewCount: admin.firestore.FieldValue.increment(1),
      distinctViewerCount: admin.firestore.FieldValue.increment(newViewer ? 1 : 0),
      firstViewedAtMs: link.firstViewedAtMs ?? nowMs,
      lastViewedAtMs: nowMs,
      seenViewerIds: trackViewer(seen, viewerId),
    });
  } catch (err) {
    functions.logger.warn('getSharedBrief: failed to record view', { token, err });
  }

  return buildSharedBriefPayload(brief);
});

/**
 * The links issued for one brief, with their view history, for the superadmin console.
 *
 * Read through a callable because /briefShareLinks is closed to clients in both directions;
 * sorted in memory rather than with orderBy so this needs no composite index for what will
 * always be a handful of documents per brief.
 */
export const listBriefShareLinks = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const prospectId = trimmed(data?.prospectId, 200);
  const briefId = trimmed(data?.briefId, 200);
  if (!prospectId || !briefId) {
    throw new functions.https.HttpsError('invalid-argument', 'prospectId and briefId are required.');
  }

  const snap = await db
    .collection('briefShareLinks')
    .where('prospectId', '==', prospectId)
    .where('briefId', '==', briefId)
    .limit(50)
    .get();

  const links = snap.docs
    .map((d) => {
      const l = d.data() as Record<string, any>;
      return {
        token: d.id,
        url: shareUrl(d.id),
        createdAtMs: l.createdAtMs ?? null,
        expiresAtMs: l.expiresAtMs ?? null,
        revoked: l.revoked === true,
        viewCount: l.viewCount ?? 0,
        distinctViewerCount: l.distinctViewerCount ?? 0,
        firstViewedAtMs: l.firstViewedAtMs ?? null,
        lastViewedAtMs: l.lastViewedAtMs ?? null,
      };
    })
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));

  return { links };
});
