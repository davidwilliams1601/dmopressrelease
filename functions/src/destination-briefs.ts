/**
 * Destination Media Opportunity Briefs — the manual, prospect-facing version of Media
 * Opportunities, and the artefact taken to trade shows.
 *
 * Why this lives in the product rather than in a document folder: a brief built by hand in
 * a slide deck proves nothing about the platform, and it cannot be reproduced or defended
 * six weeks later. A brief built from the same ingested item pool, with the same source
 * registry and the same evidence rules, is simultaneously a sales asset, a reproducible
 * record and the first real test of whether the intelligence layer finds anything worth
 * paying for.
 *
 * Constraints this file honours:
 *
 *   - Superadmin only, end to end. A prospect record is Press Pilot's own commercial
 *     pipeline data. No tenant can read /mediaProspects or any brief.
 *   - Nothing is fetched for a brief. It reads only items already ingested by
 *     ingestMediaSources, so a brief can never quietly widen what the platform reads.
 *   - No model calls. Every number, date, link and route on a brief is computed
 *     deterministically in destination-brief-engine.ts. The human framing fields
 *     (headline, openingNote, closingNote) are typed by a person and are the only
 *     free prose on the document.
 *   - The content object is stored whole. A printed brief must stay exactly as printed
 *     even after sources are re-tagged, items are purged or the engine changes, so the
 *     brief snapshots its own body rather than re-deriving it at render time.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  BRIEF_WINDOW_DAYS,
  BriefInputItem,
  assembleBrief,
} from './destination-brief-engine';

const db = admin.firestore();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bumped whenever the brief rules change, so an old brief can still be explained. */
export const BRIEF_GENERATOR_VERSION = 'brief-1';

/** Hard ceiling on the item pool read for one brief. A 30-day window across the current
 *  source set is well inside this; the cap exists so a future 200-feed registry cannot
 *  turn one button press into an unbounded read. */
const MAX_POOL_ITEMS = 4000;

/** Duplicated per-file by repo convention (see media-opportunities.ts, media-network.ts). */
function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (!context.auth.token?.superAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
  }
}

function cleanStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean)
    ),
  ].slice(0, max);
}

function trimmed(value: unknown, max = 300): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

// ---------------------------------------------------------------------------
// Prospect registry
// ---------------------------------------------------------------------------

/**
 * Create or update a prospect.
 *
 * `watchTerms` is the field that decides whether a brief is interesting, so it is the one
 * validated hardest: terms shorter than three characters are dropped, because a two-letter
 * term matches half the corpus and would make "you were in it" meaningless.
 */
export const upsertMediaProspect = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const prospectId = trimmed(data?.prospectId, 200);
  const name = trimmed(data?.name, 200);
  if (!name) {
    throw new functions.https.HttpsError('invalid-argument', 'A prospect name is required.');
  }

  const watchTerms = cleanStringArray(data?.watchTerms, 40).filter((t) => t.length >= 3);
  const vertical = typeof data?.vertical === 'string' ? data.vertical : 'dmo';

  const payload: Record<string, unknown> = {
    name,
    organisationType: trimmed(data?.organisationType, 120) || null,
    country: trimmed(data?.country, 120) || null,
    vertical,
    watchTerms,
    priorityTopics: cleanStringArray(data?.priorityTopics, 20),
    priorityGeographies: cleanStringArray(data?.priorityGeographies, 8),
    notes: trimmed(data?.notes, 2000) || null,
    contactName: trimmed(data?.contactName, 160) || null,
    contactRole: trimmed(data?.contactRole, 160) || null,
    campaign: trimmed(data?.campaign, 80) || null,
    archived: data?.archived === true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (prospectId) {
    await db.collection('mediaProspects').doc(prospectId).set(payload, { merge: true });
    return { prospectId, created: false };
  }

  const ref = await db.collection('mediaProspects').add({
    ...payload,
    briefCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: context.auth!.uid,
  });
  return { prospectId: ref.id, created: true };
});

// ---------------------------------------------------------------------------
// Brief generation
// ---------------------------------------------------------------------------

/**
 * Reads the ingested pool for one prospect's vertical and window.
 *
 * Geography filtering is applied here rather than in the engine because it is a query
 * concern; topic filtering is applied in the engine so the totals line can honestly report
 * how many items were scanned before narrowing.
 */
async function loadPool(input: {
  vertical: string;
  windowDays: number;
  priorityGeographies: string[];
}): Promise<{ items: BriefInputItem[]; scanned: number }> {
  const windowStart = admin.firestore.Timestamp.fromMillis(
    Date.now() - input.windowDays * DAY_MS
  );

  const snap = await db
    .collection('mediaItems')
    .where('publishedAt', '>=', windowStart)
    .orderBy('publishedAt', 'desc')
    .limit(MAX_POOL_ITEMS)
    .get();

  // Source names and site URLs are read once and cached, so a brief's source list can name
  // outlets properly rather than showing raw IDs.
  const sourceSnap = await db.collection('mediaSources').get();
  const siteUrlById = new Map<string, string | null>(
    sourceSnap.docs.map((d) => [d.id, (d.data().siteUrl as string | null) ?? null])
  );

  let scanned = 0;
  const items: BriefInputItem[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as any;
    if (data.sensitive === true) continue;
    if (Array.isArray(data.verticals) && !data.verticals.includes(input.vertical)) continue;
    scanned += 1;

    if (input.priorityGeographies.length) {
      const geos: string[] = data.geographyTags || [];
      if (!geos.some((g) => input.priorityGeographies.includes(g))) continue;
    }

    const ts: admin.firestore.Timestamp = data.publishedAt;
    items.push({
      id: doc.id,
      sourceId: data.sourceId,
      sourceName: data.sourceName,
      sourceSiteUrl: siteUrlById.get(data.sourceId) ?? null,
      title: data.title,
      url: data.url,
      summary: data.summary,
      publishedAtMs: ts?.toMillis ? ts.toMillis() : Date.now(),
      topicTags: data.topicTags || [],
      geographyTags: data.geographyTags || [],
    });
  }

  return { items, scanned };
}

/**
 * Builds and stores a brief for one prospect.
 *
 * Returns the brief id. The caller then opens the print view, which reads the stored
 * content — generation and rendering are deliberately separate so what gets printed is
 * always exactly what was recorded.
 */
export const generateDestinationBrief = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);

    const prospectId = trimmed(data?.prospectId, 200);
    if (!prospectId) {
      throw new functions.https.HttpsError('invalid-argument', 'prospectId is required.');
    }

    const requestedWindow = Number(data?.windowDays);
    const windowDays =
      Number.isFinite(requestedWindow) && requestedWindow >= 7 && requestedWindow <= 90
        ? Math.round(requestedWindow)
        : BRIEF_WINDOW_DAYS;

    const prospectRef = db.collection('mediaProspects').doc(prospectId);
    const prospectSnap = await prospectRef.get();
    if (!prospectSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Prospect not found.');
    }
    const prospect = prospectSnap.data() as any;

    const watchTerms: string[] = prospect.watchTerms || [];
    const priorityTopics: string[] = prospect.priorityTopics || [];

    const { items, scanned } = await loadPool({
      vertical: prospect.vertical || 'dmo',
      windowDays,
      priorityGeographies: prospect.priorityGeographies || [],
    });

    const content = assembleBrief({
      items,
      watchTerms,
      priorityTopics,
      windowDays,
      itemsScanned: scanned,
    });

    // A brief with no theme that clears the evidence bar is still written and still
    // returned. That is a real finding about the source set and the window, and quietly
    // failing here would hide exactly the case an operator most needs to see before
    // walking into a meeting.
    const briefRef = await prospectRef.collection('briefs').add({
      prospectId,
      prospectName: prospect.name,
      watchTermsUsed: watchTerms,
      priorityTopicsUsed: priorityTopics,
      content,
      generatorVersion: BRIEF_GENERATOR_VERSION,
      status: 'draft',
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedByUid: context.auth!.uid,
    });

    await prospectRef.set(
      {
        lastBriefAt: admin.firestore.FieldValue.serverTimestamp(),
        briefCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true }
    );

    return {
      briefId: briefRef.id,
      themesFound: content.totals.themesFound,
      themesWithoutMention: content.totals.themesWithoutMention,
      appearanceCount: content.totals.appearanceCount,
      itemsMatched: content.totals.itemsMatched,
      sourcesRepresented: content.totals.sourcesRepresented,
    };
  });

/**
 * Saves the human framing on a brief, and its draft/final state.
 *
 * The stored `content` is never editable. If the analysis is wrong, the brief is
 * regenerated — a document whose evidence can be quietly hand-edited is worth nothing as a
 * record, and this whole feature is an argument about trustworthiness.
 *
 * Marking a brief `final` is gated on `content.sendability`. `final` is the state that
 * means "this goes to a prospect", so the bar is enforced here rather than left to whoever
 * is in a hurry before a trade show. The gate is overridable — judgement beats a constant,
 * and there will be briefs whose weak numbers are exactly the point of the conversation —
 * but an override must carry a written reason and is recorded on the document, so the slate
 * shows which briefs went out below the bar and why.
 */
export const updateDestinationBrief = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const prospectId = trimmed(data?.prospectId, 200);
  const briefId = trimmed(data?.briefId, 200);
  if (!prospectId || !briefId) {
    throw new functions.https.HttpsError('invalid-argument', 'prospectId and briefId are required.');
  }

  const status = data?.status === 'final' ? 'final' : 'draft';

  const briefRef = db
    .collection('mediaProspects')
    .doc(prospectId)
    .collection('briefs')
    .doc(briefId);

  const payload: Record<string, unknown> = {
    headline: trimmed(data?.headline, 200) || null,
    openingNote: trimmed(data?.openingNote, 2000) || null,
    closingNote: trimmed(data?.closingNote, 2000) || null,
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: context.auth!.uid,
  };

  if (status === 'final') {
    const snap = await briefRef.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Brief not found.');
    }
    // Briefs generated before the gate existed have no sendability block. They are left
    // alone rather than retro-judged on thresholds they were never assessed against.
    const sendability = (snap.data() as any)?.content?.sendability;
    if (sendability && sendability.sendable === false) {
      const reason = trimmed(data?.overrideReason, 500);
      if (data?.override !== true || !reason || reason.length < 15) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `This brief is below the sending bar: ${(sendability.failures || []).join('; ')}. ` +
            'Wait for more ingestion or add outlets, or override with a written reason.'
        );
      }
      payload.gateOverride = {
        reason,
        failures: sendability.failures || [],
        byUid: context.auth!.uid,
        at: admin.firestore.FieldValue.serverTimestamp(),
      };
    }
  }

  await briefRef.set(payload, { merge: true });

  return { ok: true };
});

/** Deletes a brief. Prospects are archived rather than deleted; briefs are cheap to
 *  regenerate and a wrong one should not linger in a slate. */
export const deleteDestinationBrief = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const prospectId = trimmed(data?.prospectId, 200);
  const briefId = trimmed(data?.briefId, 200);
  if (!prospectId || !briefId) {
    throw new functions.https.HttpsError('invalid-argument', 'prospectId and briefId are required.');
  }
  await db
    .collection('mediaProspects')
    .doc(prospectId)
    .collection('briefs')
    .doc(briefId)
    .delete();
  await db
    .collection('mediaProspects')
    .doc(prospectId)
    .set({ briefCount: admin.firestore.FieldValue.increment(-1) }, { merge: true });
  return { ok: true };
});
