import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type ThemeTrendsScope = { type: 'org-subtree'; orgId: string };

interface ThemeTrendRow {
  theme: string;
  /** Submissions carrying this theme, created in the last WINDOW_DAYS. */
  submissionsCurrent: number;
  /** Submissions carrying this theme, created in the WINDOW_DAYS before that. */
  submissionsPrior: number;
  /** % change current vs prior. null when there's no prior-window baseline to compare against. */
  volumeChangePct: number | null;
  escalatedCount: number;
  /** Share (0-1) of this-window submissions with this theme that were escalated to a parent org. */
  escalationRate: number;
  /** Distinct releases (across the subtree) that used at least one submission carrying this theme, this window. */
  releaseCount: number;
  totalSends: number;
  totalOpens: number;
  totalClicks: number;
  /** 0-1 */
  openRate: number;
  /** e.g. 2.0 = "2x the network mean open rate". null when the network mean itself is 0 (no sends yet). */
  openRateVsNetworkMean: number | null;
}

interface GetThemeTrendsResult {
  org: { id: string; name: string; slug: string };
  windowDays: number;
  networkMeanOpenRate: number;
  themes: ThemeTrendRow[];
}

function toMillis(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  return null;
}

/**
 * Pilot theme-trend digest (federated-tenants step 8), scoped to one org's own subtree.
 * Combines three signals per curated theme, exactly as worked through in the build plan:
 * submission volume with period-over-period change, escalation rate, and release
 * engagement (opens/clicks) attributed via each submission's usedInReleaseIds.
 *
 * Deliberately implements ONLY `scope: { type: 'org-subtree', orgId }` for now. The
 * vertical-wide scope, k-anonymity gating (>=5 orgs before any cross-customer
 * publication), published quarterly reports, and licensable datasets described later in
 * the build plan ("One aggregation, three outputs") are explicit future generalisation
 * work, deferred until there are several Education-vertical customers beyond Auris
 * Tech's own network — not built here.
 *
 * Auth mirrors getOrgRollup exactly: signed-in team member of `orgId` itself (via the
 * org's users subcollection) or a platform super admin.
 *
 * Works on whatever `aiThemes` values exist on submissions in scope, whether or not a
 * curated taxonomy (see super-admin.ts) is configured for that org's vertical — a
 * configured taxonomy just makes cross-submission theme buckets consistent instead of
 * drifting free text, which is the whole reason step 8 pairs this callable with the
 * taxonomy feature.
 */
export const getThemeTrends = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const scope = data?.scope as ThemeTrendsScope | undefined;
  if (!scope || scope.type !== 'org-subtree' || !scope.orgId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      "Only { type: 'org-subtree', orgId } is supported currently."
    );
  }
  const orgId = scope.orgId;

  const isSuperAdmin = !!context.auth.token?.superAdmin;
  const callerOrgId = context.auth.token.orgId as string | undefined;

  if (!isSuperAdmin) {
    if (callerOrgId !== orgId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only view theme trends for your own organisation.'
      );
    }
    const callerSnap = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
    if (!callerSnap.exists) {
      throw new functions.https.HttpsError('permission-denied', 'You are not a member of this organisation.');
    }
  }

  const orgRef = db.collection('orgs').doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Organisation not found.');
  }
  const orgData = orgSnap.data() || {};

  // Every descendant at any depth, same subtree query pattern as getOrgRollup.
  const descendantsSnap = await db.collection('orgs').where('ancestorOrgIds', 'array-contains', orgId).get();
  const subtreeOrgIds = [orgId, ...descendantsSnap.docs.map((d) => d.id)];

  const now = Date.now();
  const currentWindowStart = now - WINDOW_DAYS * DAY_MS;
  const priorWindowStart = now - 2 * WINDOW_DAYS * DAY_MS;

  const themeStats = new Map<string, {
    submissionsCurrent: number;
    submissionsPrior: number;
    escalatedCount: number;
    // Composite `${ownerOrgId}/${releaseId}` keys, deduped so a release referenced by
    // several submissions with the same theme is only counted (and its engagement
    // summed) once per theme.
    releaseKeys: Set<string>;
  }>();

  function getOrInitTheme(theme: string) {
    let stat = themeStats.get(theme);
    if (!stat) {
      stat = { submissionsCurrent: 0, submissionsPrior: 0, escalatedCount: 0, releaseKeys: new Set() };
      themeStats.set(theme, stat);
    }
    return stat;
  }

  // Release docs per org, kept around so the second pass can resolve releaseKeys back
  // to sends/opens/clicks without re-fetching.
  const releasesByOrg = new Map<string, Map<string, admin.firestore.DocumentData>>();

  // Network-mean baseline uses every release across the subtree's full history (not
  // just this window) — with a small pilot cohort (~260 submitters), a 30-day release
  // sample alone would be too thin a denominator to compare theme-level open rates
  // against meaningfully.
  let networkTotalSends = 0;
  let networkTotalOpens = 0;

  await Promise.all(
    subtreeOrgIds.map(async (memberOrgId) => {
      const [submissionsSnap, releasesSnap] = await Promise.all([
        db.collection('orgs').doc(memberOrgId).collection('submissions').get(),
        db.collection('orgs').doc(memberOrgId).collection('releases').get(),
      ]);

      const releaseById = new Map<string, admin.firestore.DocumentData>();
      for (const rel of releasesSnap.docs) {
        const r = rel.data();
        releaseById.set(rel.id, r);
        networkTotalSends += r.sends || 0;
        networkTotalOpens += r.opens || 0;
      }
      releasesByOrg.set(memberOrgId, releaseById);

      for (const sub of submissionsSnap.docs) {
        const s = sub.data();
        const themes: string[] = Array.isArray(s.aiThemes) ? s.aiThemes : [];
        if (themes.length === 0) continue;

        const createdAtMs = toMillis(s.createdAt);
        const inCurrentWindow = createdAtMs !== null && createdAtMs >= currentWindowStart;
        const inPriorWindow = createdAtMs !== null && createdAtMs >= priorWindowStart && createdAtMs < currentWindowStart;
        if (!inCurrentWindow && !inPriorWindow) continue;

        for (const theme of themes) {
          const stat = getOrInitTheme(theme);
          if (inCurrentWindow) {
            stat.submissionsCurrent++;
            if (s.escalatedAt) stat.escalatedCount++;
            for (const relId of (s.usedInReleaseIds || [])) {
              if (releaseById.has(relId)) stat.releaseKeys.add(`${memberOrgId}/${relId}`);
            }
          } else {
            stat.submissionsPrior++;
          }
        }
      }
    })
  );

  const networkMeanOpenRate = networkTotalSends > 0 ? networkTotalOpens / networkTotalSends : 0;

  const themes: ThemeTrendRow[] = Array.from(themeStats.entries()).map(([theme, stat]) => {
    let totalSends = 0;
    let totalOpens = 0;
    let totalClicks = 0;
    for (const key of stat.releaseKeys) {
      const [ownerOrgId, relId] = key.split('/');
      const rel = releasesByOrg.get(ownerOrgId)?.get(relId);
      if (rel) {
        totalSends += rel.sends || 0;
        totalOpens += rel.opens || 0;
        totalClicks += rel.clicks || 0;
      }
    }

    const volumeChangePct = stat.submissionsPrior > 0
      ? Math.round(((stat.submissionsCurrent - stat.submissionsPrior) / stat.submissionsPrior) * 1000) / 10
      : (stat.submissionsCurrent > 0 ? null : 0);

    const escalationRate = stat.submissionsCurrent > 0 ? stat.escalatedCount / stat.submissionsCurrent : 0;
    const openRate = totalSends > 0 ? totalOpens / totalSends : 0;
    const openRateVsNetworkMean = networkMeanOpenRate > 0 ? Math.round((openRate / networkMeanOpenRate) * 100) / 100 : null;

    return {
      theme,
      submissionsCurrent: stat.submissionsCurrent,
      submissionsPrior: stat.submissionsPrior,
      volumeChangePct,
      escalatedCount: stat.escalatedCount,
      escalationRate: Math.round(escalationRate * 1000) / 1000,
      releaseCount: stat.releaseKeys.size,
      totalSends,
      totalOpens,
      totalClicks,
      openRate: Math.round(openRate * 1000) / 1000,
      openRateVsNetworkMean,
    };
  });

  themes.sort((a, b) => b.submissionsCurrent - a.submissionsCurrent);

  const result: GetThemeTrendsResult = {
    org: { id: orgId, name: orgData.name || orgId, slug: orgData.slug || orgId },
    windowDays: WINDOW_DAYS,
    networkMeanOpenRate: Math.round(networkMeanOpenRate * 1000) / 1000,
    themes,
  };
  return result;
});
