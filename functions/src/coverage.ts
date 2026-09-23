/**
 * Coverage records — server side.
 *
 * Coverage records themselves are written by the dashboard straight to
 * /orgs/{orgId}/coverage, under firestore.rules validation, in the same way releases are:
 * a team member logging a placement is ordinary editorial work inside their own tenant and does
 * not need a function in the path. What lives here are the two things that cannot be done
 * safely from a browser:
 *
 *   1. fetchCoverageMetadata — "paste a link, we fill in the headline, outlet and date".
 *      Browsers cannot read arbitrary publisher pages (CORS), so the server fetches the page.
 *      A server that fetches any URL it is handed is a classic way into a private network, so
 *      the target is checked as a string, then every resolved address is checked, redirects are
 *      followed by hand and re-checked at every hop, and the response is size- and time-capped.
 *
 *   2. Shared coverage reports — the CoverageBook-style link an org sends to its board, a funder
 *      or its members. Same shape as brief share links (brief-sharing.ts): a random token, a
 *      public callable rather than a public Firestore rule, an allow-listed payload, expiry,
 *      revocation and privacy-preserving open counts.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { promises as dns } from 'dns';
import {
  buildSharedCoverageRecords,
  extractCoverageMetadata,
  isPrivateAddress,
  isPublicHttpUrl,
  validateReportPeriod,
} from './coverage-core';
import {
  SHARE_LINK_DEFAULT_TTL_DAYS,
  isNewViewer,
  resolveExpiry,
  shareLinkState,
  trackViewer,
} from './brief-sharing-core';

import { peerBenchmark } from './dashboard-core';

const db = admin.firestore();

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

function trimmed(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Duplicated per-file by repo convention (see media-opportunities.ts, recommendations.ts). */
async function requireOrgRole(
  context: functions.https.CallableContext,
  orgId: string,
  roles: Array<'Admin' | 'User'>
): Promise<{ uid: string; name: string }> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (!orgId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');
  }
  if (context.auth.token?.superAdmin) {
    return { uid: context.auth.uid, name: 'Press Pilot' };
  }
  const userSnap = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'You are not a member of this organisation.');
  }
  const role = userSnap.data()?.role;
  if (!roles.includes(role)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      roles.length === 1 ? `${roles[0]} access required.` : 'Team-member access required.'
    );
  }
  return { uid: context.auth.uid, name: String(userSnap.data()?.name || '') };
}

// ---------------------------------------------------------------------------
// 1. Link metadata
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 8000;
const FETCH_MAX_BYTES = 1_500_000;
const FETCH_MAX_REDIRECTS = 4;
const USER_AGENT = 'PressPilotCoverageBot/1.0 (+https://press-pilot.com; reads title and date of a page a customer logged as coverage)';

async function assertResolvesPublic(hostname: string): Promise<void> {
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new functions.https.HttpsError('not-found', 'That website could not be found.');
  }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new functions.https.HttpsError('invalid-argument', 'That link cannot be read automatically. Fill in the details by hand.');
  }
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      chunks.push(value);
      if (total >= FETCH_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

export const fetchCoverageMetadata = functions.https.onCall(async (data, context) => {
  const orgId = trimmed(data?.orgId, 200);
  await requireOrgRole(context, orgId, ['Admin', 'User']);

  let current = trimmed(data?.url, 2000);
  if (!isPublicHttpUrl(current)) {
    throw new functions.https.HttpsError('invalid-argument', 'Paste a full public link starting with https://');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= FETCH_MAX_REDIRECTS; hop++) {
      if (!isPublicHttpUrl(current)) {
        throw new functions.https.HttpsError('invalid-argument', 'That link redirects somewhere that cannot be read automatically.');
      }
      await assertResolvesPublic(new URL(current).hostname);

      const res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      });

      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next) break;
        current = new URL(next, current).toString();
        continue;
      }
      if (!res.ok) {
        // Paywalls and bot walls commonly answer 401/403. That is not an error in the placement,
        // just in our ability to read it, so the message says so plainly.
        throw new functions.https.HttpsError(
          'unavailable',
          `The publisher did not let us read that page (HTTP ${res.status}). Fill in the details by hand.`
        );
      }
      const type = res.headers.get('content-type') || '';
      if (!/html/i.test(type)) {
        throw new functions.https.HttpsError('invalid-argument', 'That link is not a web page. Fill in the details by hand.');
      }
      const html = await readCapped(res);
      return { ...extractCoverageMetadata(html, current), finalUrl: current };
    }
    throw new functions.https.HttpsError('unavailable', 'That link redirects too many times.');
  } catch (err: any) {
    if (err instanceof functions.https.HttpsError) throw err;
    if (err?.name === 'AbortError') {
      throw new functions.https.HttpsError('deadline-exceeded', 'The publisher took too long to respond. Fill in the details by hand.');
    }
    functions.logger.warn('fetchCoverageMetadata failed', { orgId, err: String(err) });
    throw new functions.https.HttpsError('unavailable', 'That page could not be read. Fill in the details by hand.');
  } finally {
    clearTimeout(timer);
  }
});

// ---------------------------------------------------------------------------
// 2. Shared coverage reports
// ---------------------------------------------------------------------------

/** CSPRNG token; see brief-sharing.ts for why it is never derived from anything guessable. */
function newToken(): string {
  return randomBytes(16).toString('hex');
}

function reportUrl(token: string): string {
  return `${appUrl}/report/${token}`;
}

/**
 * Admin-only on purpose. A shared report leaves the tenant and carries member names to people
 * who are not signed in; the person who decides that should be the person who owns the account.
 */
export const createCoverageReportShareLink = functions.https.onCall(async (data, context) => {
  const orgId = trimmed(data?.orgId, 200);
  const caller = await requireOrgRole(context, orgId, ['Admin']);

  const period = validateReportPeriod(data?.startMs, data?.endMs);
  if (!period.ok) {
    throw new functions.https.HttpsError('invalid-argument', period.error);
  }
  const title = trimmed(data?.title, 160) || 'Coverage report';
  const includeSensitive = data?.includeSensitive === true;

  const nowMs = Date.now();
  const token = newToken();
  const expiresAtMs = resolveExpiry(nowMs, data?.ttlDays);

  await db.collection('coverageReportLinks').doc(token).set({
    token,
    orgId,
    title,
    startMs: period.startMs,
    endMs: period.endMs,
    includeSensitive,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: nowMs,
    createdByUid: caller.uid,
    createdByName: caller.name,
    expiresAtMs,
    revoked: false,
    viewCount: 0,
    distinctViewerCount: 0,
    firstViewedAtMs: null,
    lastViewedAtMs: null,
    seenViewerIds: [],
  });

  return { token, url: reportUrl(token), expiresAtMs, ttlDays: data?.ttlDays ?? SHARE_LINK_DEFAULT_TTL_DAYS };
});

export const revokeCoverageReportShareLink = functions.https.onCall(async (data, context) => {
  const orgId = trimmed(data?.orgId, 200);
  const caller = await requireOrgRole(context, orgId, ['Admin']);
  const token = trimmed(data?.token, 200);
  if (!token) throw new functions.https.HttpsError('invalid-argument', 'token is required.');

  const ref = db.collection('coverageReportLinks').doc(token);
  const snap = await ref.get();
  // Same answer for "no such link" and "someone else's link", so tokens cannot be probed.
  if (!snap.exists || snap.data()?.orgId !== orgId) {
    throw new functions.https.HttpsError('not-found', 'Share link not found.');
  }
  await ref.update({
    revoked: true,
    revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    revokedByUid: caller.uid,
  });
  return { ok: true };
});

export const listCoverageReportShareLinks = functions.https.onCall(async (data, context) => {
  const orgId = trimmed(data?.orgId, 200);
  await requireOrgRole(context, orgId, ['Admin', 'User']);

  const snap = await db.collection('coverageReportLinks').where('orgId', '==', orgId).limit(100).get();
  const links = snap.docs
    .map((d) => {
      const l = d.data() as Record<string, any>;
      return {
        token: d.id,
        url: reportUrl(d.id),
        title: l.title || 'Coverage report',
        startMs: l.startMs ?? null,
        endMs: l.endMs ?? null,
        includeSensitive: l.includeSensitive === true,
        createdAtMs: l.createdAtMs ?? null,
        createdByName: l.createdByName || '',
        expiresAtMs: l.expiresAtMs ?? null,
        revoked: l.revoked === true,
        viewCount: l.viewCount ?? 0,
        distinctViewerCount: l.distinctViewerCount ?? 0,
        lastViewedAtMs: l.lastViewedAtMs ?? null,
      };
    })
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  return { links };
});

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  return null;
}

/**
 * Public read of a shared coverage report. No auth check, by design — a board member opening a
 * link from an email is not a Press Pilot user.
 *
 * The report is computed live from the org's coverage records at the time of opening, so a
 * placement logged after the link was sent still appears (and one deleted as a mistake no longer
 * does). The period is fixed at creation. Funnel counts are computed here rather than exposed as
 * raw documents, so nothing about a submission other than "it exists in this period" leaves.
 */
export const getSharedCoverageReport = functions.https.onCall(async (data) => {
  const token = trimmed(data?.token, 200);
  const viewerId = trimmed(data?.viewerId, 100) || null;
  if (!token) throw new functions.https.HttpsError('invalid-argument', 'token is required.');

  const linkRef = db.collection('coverageReportLinks').doc(token);
  const linkSnap = await linkRef.get();
  if (!linkSnap.exists) throw new functions.https.HttpsError('not-found', 'This link is not valid.');

  const link = linkSnap.data() as Record<string, any>;
  const nowMs = Date.now();
  const state = shareLinkState(link, nowMs);
  if (!state.openable) {
    throw new functions.https.HttpsError(
      'permission-denied',
      state.reason === 'revoked' ? 'This link has been withdrawn.' : 'This link has expired.'
    );
  }

  const orgId = String(link.orgId);
  const startMs = Number(link.startMs);
  const endMs = Number(link.endMs);

  const orgSnap = await db.collection('orgs').doc(orgId).get();
  if (!orgSnap.exists) throw new functions.https.HttpsError('not-found', 'This report is no longer available.');
  const org = orgSnap.data() as Record<string, any>;

  const [coverageSnap, releaseSnap, submissionSnap] = await Promise.all([
    db.collection('orgs').doc(orgId).collection('coverage')
      .where('publishedAtMs', '>=', startMs)
      .where('publishedAtMs', '<=', endMs)
      .limit(1000)
      .get(),
    db.collection('orgs').doc(orgId).collection('releases')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(startMs))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromMillis(endMs))
      .select('status')
      .limit(2000)
      .get(),
    db.collection('orgs').doc(orgId).collection('submissions')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(startMs))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromMillis(endMs))
      .select()
      .limit(5000)
      .get(),
  ]);

  const records = buildSharedCoverageRecords(
    coverageSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
    { includeSensitive: link.includeSensitive === true }
  );

  const seen: string[] = Array.isArray(link.seenViewerIds) ? link.seenViewerIds.map(String) : [];
  const newViewer = isNewViewer(seen, viewerId);
  try {
    await linkRef.update({
      viewCount: admin.firestore.FieldValue.increment(1),
      distinctViewerCount: admin.firestore.FieldValue.increment(newViewer ? 1 : 0),
      firstViewedAtMs: link.firstViewedAtMs ?? nowMs,
      lastViewedAtMs: nowMs,
      seenViewerIds: trackViewer(seen, viewerId),
    });
  } catch (err) {
    functions.logger.warn('getSharedCoverageReport: failed to record view', { token, err });
  }

  return {
    title: String(link.title || 'Coverage report'),
    orgName: String(org.name || ''),
    orgLogoUrl: typeof org.branding?.logoUrl === 'string' ? org.branding.logoUrl : null,
    orgPrimaryColor: typeof org.branding?.primaryColor === 'string' ? org.branding.primaryColor : null,
    vertical: typeof org.vertical === 'string' ? org.vertical : 'dmo',
    startMs,
    endMs,
    generatedAtMs: nowMs,
    createdAtMs: toMillis(link.createdAt) ?? link.createdAtMs ?? null,
    includeSensitive: link.includeSensitive === true,
    funnel: {
      submitted: submissionSnap.size,
      issued: releaseSnap.docs.filter((d) => d.get('status') === 'Sent').length,
    },
    records,
  };
});

// ---------------------------------------------------------------------------
// 5. Peer benchmark
// ---------------------------------------------------------------------------

const PEER_WINDOW_DAYS = 90;
/** Hard ceiling on orgs read per call; peers are sampled from the same vertical only. */
const PEER_MAX_ORGS = 300;

/**
 * Where an organisation's placements sit against comparable organisations.
 *
 * "Comparable" means the same vertical and actually logging coverage: an org with no coverage
 * records at all is not a peer with zero placements, it is an org not using the feature, and
 * counting it would drag every median to nothing. Only the median, quartiles and the caller's
 * own position leave the function (see peerBenchmark in dashboard-core),
 * and nothing below five peers.
 */
export const getPeerCoverageBenchmark = functions.https.onCall(async (data, context) => {
  const orgId = trimmed(data?.orgId, 128);
  await requireOrgRole(context, orgId, ['Admin', 'User']);

  const orgSnap = await db.collection('orgs').doc(orgId).get();
  if (!orgSnap.exists) throw new functions.https.HttpsError('not-found', 'Organisation not found.');
  const vertical = (orgSnap.get('vertical') as string) || 'dmo';
  const sinceMs = Date.now() - PEER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const countFor = async (id: string): Promise<{ ever: boolean; recent: number }> => {
    const col = db.collection('orgs').doc(id).collection('coverage');
    const [any, recent] = await Promise.all([
      col.limit(1).select().get(),
      col.where('publishedAtMs', '>=', sinceMs).count().get(),
    ]);
    return { ever: !any.empty, recent: recent.data().count };
  };

  const peersSnap = await db.collection('orgs').where('vertical', '==', vertical).limit(PEER_MAX_ORGS).get();
  // Orgs created before verticals existed have no field and are treated as DMOs elsewhere.
  const legacySnap =
    vertical === 'dmo' ? await db.collection('orgs').limit(PEER_MAX_ORGS).get() : null;
  const ids = new Set(peersSnap.docs.map((d) => d.id));
  legacySnap?.docs.forEach((d) => {
    if (!d.get('vertical')) ids.add(d.id);
  });
  ids.delete(orgId);

  const [own, ...peerCounts] = await Promise.all([countFor(orgId), ...[...ids].map(countFor)]);
  const peers = peerCounts.filter((p) => p.ever).map((p) => p.recent);

  return {
    windowDays: PEER_WINDOW_DAYS,
    vertical,
    benchmark: peerBenchmark(own.recent, peers),
  };
});
