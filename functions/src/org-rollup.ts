import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface OrgRollupNode {
  id: string;
  name: string;
  slug: string;
  parentOrgId: string | null;
  /** 0 = the org the rollup was requested for; 1 = its direct children; etc. */
  depth: number;
  partnerCount: number;
  submissionCount: number;
  releaseSentCount: number;
  totalEmailsSent: number;
  lastActivityAt: admin.firestore.Timestamp | null;
  /** Submissions pushed INTO this org from one of its own children (sourceOrgId set). */
  escalatedInCount: number;
  /** Of those, how many have actually been drafted into a release (status === 'used'). */
  escalatedInUsedCount: number;
}

/**
 * Compute the same usage stats getSuperAdminReport computes per org, plus the
 * federated-tenants escalation counters, for one org doc.
 */
async function computeOrgNodeStats(
  orgDoc: admin.firestore.DocumentSnapshot,
  depth: number
): Promise<OrgRollupNode> {
  const org = orgDoc.data() || {};
  const orgId = orgDoc.id;

  const [usersSnap, submissionsSnap, releasesSnap] = await Promise.all([
    db.collection('orgs').doc(orgId).collection('users').get(),
    db.collection('orgs').doc(orgId).collection('submissions').get(),
    db.collection('orgs').doc(orgId).collection('releases').get(),
  ]);

  const partnerCount = usersSnap.docs.filter((u) => u.data().role === 'Partner').length;
  const submissionCount = submissionsSnap.size;

  let releaseSentCount = 0;
  let totalEmailsSent = 0;
  let lastActivityAt: admin.firestore.Timestamp | null = null;

  for (const rel of releasesSnap.docs) {
    const r = rel.data();
    if (r.status === 'Sent') {
      releaseSentCount++;
      totalEmailsSent += r.sends || 0;
    }
    const ts: admin.firestore.Timestamp | null = r.updatedAt || r.createdAt || null;
    if (ts && (!lastActivityAt || ts.toMillis() > lastActivityAt.toMillis())) {
      lastActivityAt = ts;
    }
  }

  let escalatedInCount = 0;
  let escalatedInUsedCount = 0;
  for (const sub of submissionsSnap.docs) {
    const s = sub.data();
    if (s.sourceOrgId) {
      escalatedInCount++;
      if (s.status === 'used') escalatedInUsedCount++;
    }
  }

  return {
    id: orgId,
    name: org.name || orgId,
    slug: org.slug || orgId,
    parentOrgId: org.parentOrgId ?? null,
    depth,
    partnerCount,
    submissionCount,
    releaseSentCount,
    totalEmailsSent,
    lastActivityAt,
    escalatedInCount,
    escalatedInUsedCount,
  };
}

/**
 * Roll up usage across an org and every descendant beneath it (its whole subtree),
 * regardless of depth. Works at any node in the tree, not just the root — the exact
 * same query and code path serves an LVEP looking at its own DMOs and Visit England
 * looking at everything below every LVEP.
 *
 * Callable by any signed-in team member of `orgId` itself (Admin or Editor — role
 * gating for who sees the "Network" nav item is a UI concern) or a platform super
 * admin. Authorisation derives the caller's own org from their auth token first; a
 * super admin may additionally pass any orgId.
 *
 * Input: { orgId: string }
 * Returns: { org: {id, name, slug}, nodes: OrgRollupNode[], totals: {...} }
 */
export const getOrgRollup = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const orgId = data?.orgId as string | undefined;
  if (!orgId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required field: orgId.');
  }

  const isSuperAdmin = !!context.auth.token?.superAdmin;
  const callerOrgId = context.auth.token.orgId as string | undefined;

  if (!isSuperAdmin) {
    if (callerOrgId !== orgId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only view the network rollup for your own organisation.'
      );
    }
    // Mirrors the membership check other org-scoped callables use (e.g.
    // escalateSubmissionToParent) — confirms the caller is a real team member,
    // not just holding a stale/spoofed custom claim.
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
  const orgAncestorLen = (orgData.ancestorOrgIds || []).length;

  // Every descendant at any depth, in one query — no recursion needed at read time,
  // since ancestorOrgIds denormalises the full root-first ancestor chain on write.
  const descendantsSnap = await db.collection('orgs').where('ancestorOrgIds', 'array-contains', orgId).get();

  const nodes = await Promise.all([
    computeOrgNodeStats(orgSnap, 0),
    ...descendantsSnap.docs.map((d) => {
      const depth = (d.data().ancestorOrgIds || []).length - orgAncestorLen;
      return computeOrgNodeStats(d, depth);
    }),
  ]);

  const totals = nodes.reduce(
    (acc, n) => ({
      orgCount: acc.orgCount + 1,
      totalPartners: acc.totalPartners + n.partnerCount,
      totalSubmissions: acc.totalSubmissions + n.submissionCount,
      totalReleasesSent: acc.totalReleasesSent + n.releaseSentCount,
      totalEmailsSent: acc.totalEmailsSent + n.totalEmailsSent,
      totalEscalated: acc.totalEscalated + n.escalatedInCount,
      totalEscalatedUsed: acc.totalEscalatedUsed + n.escalatedInUsedCount,
    }),
    {
      orgCount: 0,
      totalPartners: 0,
      totalSubmissions: 0,
      totalReleasesSent: 0,
      totalEmailsSent: 0,
      totalEscalated: 0,
      totalEscalatedUsed: 0,
    }
  );

  const escalationConversionRate = totals.totalEscalated > 0 ? totals.totalEscalatedUsed / totals.totalEscalated : 0;

  return {
    org: { id: orgId, name: orgData.name || orgId, slug: orgData.slug || orgId },
    nodes,
    totals: { ...totals, escalationConversionRate },
  };
});
