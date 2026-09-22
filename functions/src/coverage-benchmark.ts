/**
 * Callable wrapper for the aggregate coverage benchmark.
 *
 * Reads the same ingested pool a brief reads — never fetches anything, never touches
 * /mediaProspects — and stores each run so a figure that has been posted publicly can be
 * produced again months later with the sample size it was based on. A published statistic that
 * cannot be reproduced is a liability, not marketing.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { BriefInputItem } from './destination-brief-engine';
import {
  BENCHMARK_VERSION,
  computeCoverageBenchmark,
} from './coverage-benchmark-engine';

const db = admin.firestore();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Same ceiling as the brief pool read, for the same reason. */
const MAX_POOL_ITEMS = 4000;

/** Duplicated per-file by repo convention (see destination-briefs.ts). */
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

export const generateCoverageBenchmark = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);

    const requested = Number(data?.windowDays);
    const windowDays =
      Number.isFinite(requested) && requested >= 7 && requested <= 90 ? Math.round(requested) : 30;

    // Optional geography filter so a benchmark can describe one region honestly instead of
    // averaging two unrelated media markets into a number that describes neither.
    const geography = trimmed(data?.geography, 60);
    const regionLabel = trimmed(data?.regionLabel, 80) || geography || '';

    const nowMs = Date.now();
    const snap = await db
      .collection('mediaItems')
      .where('publishedAt', '>=', admin.firestore.Timestamp.fromMillis(nowMs - windowDays * DAY_MS))
      .orderBy('publishedAt', 'desc')
      .limit(MAX_POOL_ITEMS)
      .get();

    const items: BriefInputItem[] = [];
    for (const doc of snap.docs) {
      const d = doc.data() as any;
      if (d.sensitive === true) continue;
      if (geography) {
        const geos: string[] = d.geographyTags || [];
        if (!geos.includes(geography)) continue;
      }
      const ts: admin.firestore.Timestamp = d.publishedAt;
      items.push({
        id: doc.id,
        sourceId: d.sourceId,
        sourceName: d.sourceName,
        sourceSiteUrl: null,
        title: d.title,
        url: d.url,
        summary: d.summary,
        publishedAtMs: ts?.toMillis ? ts.toMillis() : nowMs,
        topicTags: d.topicTags || [],
        geographyTags: d.geographyTags || [],
      });
    }

    const benchmark = computeCoverageBenchmark({
      items,
      windowDays,
      nowMs,
      regionLabel: regionLabel || undefined,
    });

    const ref = await db.collection('coverageBenchmarks').add({
      ...benchmark,
      geography: geography || null,
      regionLabel: regionLabel || null,
      generatorVersion: BENCHMARK_VERSION,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedAtMs: nowMs,
      generatedByUid: context.auth!.uid,
    });

    return { id: ref.id, ...benchmark };
  });
