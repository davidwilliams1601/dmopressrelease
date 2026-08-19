import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { getTierPriceMonthly } from './tiers';

const db = admin.firestore();

/**
 * Checks that the caller has the superAdmin custom claim.
 */
function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in.'
    );
  }
  if (!context.auth.token?.superAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Super-admin access required.'
    );
  }
}

/**
 * List all organisations. Super-admin only.
 */
export const listAllOrgs = functions.https.onCall(async (_data, context) => {
  requireSuperAdmin(context);

  const snapshot = await db.collection('orgs').get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
});

/**
 * Provision a new organisation with its first admin user. Super-admin only.
 *
 * Input:
 *   orgName: string
 *   orgSlug: string          — URL-safe identifier, must be unique
 *   boilerplate: string      — "About" boilerplate text
 *   brandToneNotes: string   — AI tone guidelines
 *   pressContactName: string
 *   pressContactEmail: string
 *   adminName: string        — First admin's display name
 *   adminEmail: string       — First admin's email
 *
 * Returns: { orgId, adminUserId, tempPassword }
 */
export const provisionNewOrg = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const {
    orgName,
    orgSlug,
    boilerplate,
    brandToneNotes,
    pressContactName,
    pressContactEmail,
    adminName,
    adminEmail,
    vertical,
    maxPartners,
    maxUsers,
    tier,
    parentOrgId,
    region,
  } = data;

  if (!orgName || !orgSlug || !adminName || !adminEmail) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: orgName, orgSlug, adminName, adminEmail'
    );
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(orgSlug)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Slug must contain only lowercase letters, numbers, and hyphens.'
    );
  }

  // Check slug is not already taken
  const existing = await db.collection('orgs').where('slug', '==', orgSlug).limit(1).get();
  if (!existing.empty) {
    throw new functions.https.HttpsError(
      'already-exists',
      `An organisation with slug "${orgSlug}" already exists.`
    );
  }

  // If this org is being provisioned under a parent (federated tenants), validate the
  // parent exists and compute the denormalised ancestor chain up front so descendant
  // rollup queries (`ancestorOrgIds array-contains orgId`) work at any depth.
  let ancestorOrgIds: string[] | undefined;
  if (parentOrgId) {
    const parentSnap = await db.collection('orgs').doc(parentOrgId).get();
    if (!parentSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        `Parent organisation "${parentOrgId}" does not exist.`
      );
    }
    const parentData = parentSnap.data() || {};
    ancestorOrgIds = [...(parentData.ancestorOrgIds || []), parentOrgId];
  }

  // Generate a secure temporary password
  const tempPassword = crypto.randomBytes(12).toString('base64').slice(0, 16);

  try {
    // 1. Create the org document
    const orgRef = db.collection('orgs').doc(orgSlug);
    const orgData: Record<string, any> = {
      id: orgSlug,
      name: orgName,
      slug: orgSlug,
      boilerplate: boilerplate || '',
      brandToneNotes: brandToneNotes || '',
      vertical: vertical || 'dmo',
      pressContact: {
        name: pressContactName || '',
        email: pressContactEmail || '',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      provisionedBy: context.auth!.uid,
    };
    if (maxPartners && maxPartners > 0) orgData.maxPartners = maxPartners;
    if (maxUsers && maxUsers > 0) orgData.maxUsers = maxUsers;
    if (tier) orgData.tier = tier;
    if (region) orgData.region = region;
    if (parentOrgId) {
      orgData.parentOrgId = parentOrgId;
      orgData.ancestorOrgIds = ancestorOrgIds;
    }
    await orgRef.set(orgData);

    // 2. Create the Firebase Auth user for the first admin
    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: adminEmail,
        password: tempPassword,
        displayName: adminName,
      });
    } catch (err: any) {
      // Roll back org doc if user creation fails
      await orgRef.delete();
      if (err.code === 'auth/email-already-exists') {
        throw new functions.https.HttpsError(
          'already-exists',
          'A user with this email already exists.'
        );
      }
      throw err;
    }

    // 3. Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, { orgId: orgSlug });

    // 4. Create the user document
    const initials = adminName
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    await orgRef.collection('users').doc(userRecord.uid).set({
      id: userRecord.uid,
      orgId: orgSlug,
      email: adminEmail,
      name: adminName,
      initials,
      role: 'Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Org provisioned: ${orgSlug} | Admin: ${adminEmail} (${userRecord.uid})`);

    return {
      success: true,
      orgId: orgSlug,
      adminUserId: userRecord.uid,
      tempPassword,
    };
  } catch (error: any) {
    console.error('Error provisioning org:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError(
      'internal',
      `Failed to provision org: ${error.message}`
    );
  }
});

/**
 * Attach an EXISTING org to a parent org (or detach it back to root),
 * for cases where a DMO/org was onboarded standalone and only later gets
 * grouped under a newly-formed LVEP / Visit England / Auris Tech style
 * parent. provisionNewOrg only sets parentOrgId at creation time - this
 * is the retrofit path. Super-admin only.
 *
 * Guards against cycles (an org can't become its own descendant's child)
 * and cascades the ancestorOrgIds change to every existing descendant of
 * orgId, since their denormalised ancestor chains all need the new
 * ancestors spliced in ahead of orgId.
 */
export const setOrgParent = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { orgId, parentOrgId } = data;

  if (!orgId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required field: orgId');
  }

  const orgRef = db.collection('orgs').doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new functions.https.HttpsError('not-found', `Organisation ${orgId} not found.`);
  }

  // Existing descendants of orgId, found BEFORE we change anything - both to check for
  // cycles and because every one of them needs its ancestorOrgIds cascaded afterwards.
  const descendantsSnap = await db
    .collection('orgs')
    .where('ancestorOrgIds', 'array-contains', orgId)
    .get();

  let newAncestorOrgIds: string[] = [];

  if (parentOrgId) {
    if (parentOrgId === orgId) {
      throw new functions.https.HttpsError('invalid-argument', 'An organisation cannot be its own parent.');
    }
    if (descendantsSnap.docs.some((d) => d.id === parentOrgId)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Cannot set parent to ${parentOrgId} - it is already a descendant of ${orgId}, which would create a cycle.`
      );
    }
    const parentSnap = await db.collection('orgs').doc(parentOrgId).get();
    if (!parentSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Parent organisation "${parentOrgId}" does not exist.`);
    }
    const parentData = parentSnap.data() || {};
    newAncestorOrgIds = [...(parentData.ancestorOrgIds || []), parentOrgId];
  }

  // Chunk into batches of 400 to stay well under Firestore's 500-write batch limit,
  // covering: the org itself, plus a cascading update for every existing descendant.
  const writes: Array<() => Promise<void>> = [];
  const BATCH_SIZE = 400;

  const allUpdates: Array<{ ref: admin.firestore.DocumentReference; data: Record<string, any> }> = [
    {
      ref: orgRef,
      data: {
        parentOrgId: parentOrgId || admin.firestore.FieldValue.delete(),
        ancestorOrgIds: newAncestorOrgIds,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    },
  ];

  for (const descDoc of descendantsSnap.docs) {
    const descData = descDoc.data();
    const oldChain: string[] = descData.ancestorOrgIds || [];
    const idx = oldChain.indexOf(orgId);
    // idx should always be found since this doc matched the array-contains query, but
    // guard defensively rather than write a broken chain if data is ever inconsistent.
    if (idx === -1) continue;
    const descNewChain = [...newAncestorOrgIds, orgId, ...oldChain.slice(idx + 1)];
    allUpdates.push({
      ref: descDoc.ref,
      data: {
        ancestorOrgIds: descNewChain,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  }

  for (let i = 0; i < allUpdates.length; i += BATCH_SIZE) {
    const chunk = allUpdates.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { ref, data: updateData } of chunk) {
      batch.update(ref, updateData);
    }
    writes.push(() => batch.commit().then(() => undefined));
  }

  for (const write of writes) {
    await write();
  }

  console.log(
    `Org re-parented: ${orgId} -> ${parentOrgId || '(root)'} | cascaded to ${descendantsSnap.size} existing descendant(s)`
  );

  return { success: true, cascadedDescendantCount: descendantsSnap.size };
});

/**
 * Return usage stats for every organisation. Super-admin only.
 *
 * Returns per-org:
 *   partnerCount, submissionCount, releaseSentCount, totalEmailsSent, lastActivityAt
 *
 * Plus platform-wide totals.
 */
export const getSuperAdminReport = functions.https.onCall(async (_data, context) => {
  requireSuperAdmin(context);

  const orgsSnap = await db.collection('orgs').get();

  const orgStats = await Promise.all(
    orgsSnap.docs.map(async (orgDoc) => {
      const org = orgDoc.data();
      const orgId = orgDoc.id;

      const [usersSnap, submissionsSnap, releasesSnap] = await Promise.all([
        db.collection('orgs').doc(orgId).collection('users').get(),
        db.collection('orgs').doc(orgId).collection('submissions').get(),
        db.collection('orgs').doc(orgId).collection('releases').get(),
      ]);

      const partnerCount = usersSnap.docs.filter((u) => u.data().role === 'Partner').length;
      const adminUser = usersSnap.docs.find((u) => u.data().role === 'Admin');
      const adminEmail: string | null = adminUser?.data().email ?? null;
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

      // Federated-tenants escalation counters (submissions pushed INTO this org from
      // one of its own children, and how many of those got drafted into a release).
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
        vertical: org.vertical || 'dmo',
        maxPartners: org.maxPartners ?? null,
        maxUsers: org.maxUsers ?? null,
        tier: org.tier ?? null,
        createdAt: org.createdAt ?? null,
        adminEmail,
        partnerCount,
        submissionCount,
        releaseSentCount,
        totalEmailsSent,
        lastActivityAt: lastActivityAt ?? null,
        parentOrgId: org.parentOrgId ?? null,
        ancestorOrgIds: (org.ancestorOrgIds as string[] | undefined) ?? [],
        canProvisionChildOrgs: !!org.canProvisionChildOrgs,
        maxChildOrgs: org.maxChildOrgs ?? null,
        childOrgDefaultTier: org.childOrgDefaultTier ?? null,
        contractValueMonthly: org.contractValueMonthly ?? null,
        escalatedInCount,
        escalatedInUsedCount,
      };
    })
  );

  const totals = orgStats.reduce(
    (acc, o) => ({
      orgCount: acc.orgCount + 1,
      totalPartners: acc.totalPartners + o.partnerCount,
      totalReleasesSent: acc.totalReleasesSent + o.releaseSentCount,
      totalEmailsSent: acc.totalEmailsSent + o.totalEmailsSent,
    }),
    { orgCount: 0, totalPartners: 0, totalReleasesSent: 0, totalEmailsSent: 0 }
  );

  const networks = buildNetworkStats(orgStats);

  // Revenue segmentation: which orgs belong to a network (a root with children, or a
  // root explicitly flagged canProvisionChildOrgs) vs standalone. Tier price is a
  // display estimate only (see TIER_PRICE_MONTHLY doc comment) — real invoicing for
  // bespoke Enterprise deals is manual and tracked via the root org's
  // contractValueMonthly override, surfaced per-network above rather than folded into
  // this platform-wide total.
  const networkMemberIds = new Set<string>();
  for (const net of networks) {
    for (const m of net.members) networkMemberIds.add(m.id);
  }
  let standaloneMrr = 0;
  let networkMrr = 0;
  for (const o of orgStats) {
    const price = getTierPriceMonthly(o.tier);
    if (networkMemberIds.has(o.id)) {
      networkMrr += price;
    } else {
      standaloneMrr += price;
    }
  }

  return {
    orgs: orgStats,
    totals: { ...totals, standaloneMrr, networkMrr, totalMrr: standaloneMrr + networkMrr },
    networks,
  };
});

type OrgStatForNetwork = {
  id: string;
  name: string;
  tier: string | null;
  parentOrgId: string | null;
  ancestorOrgIds: string[];
  canProvisionChildOrgs: boolean;
  maxChildOrgs: number | null;
  contractValueMonthly: number | null;
  partnerCount: number;
  submissionCount: number;
  releaseSentCount: number;
  totalEmailsSent: number;
  escalatedInCount: number;
  escalatedInUsedCount: number;
};

/**
 * Group the flat org list into federated networks (a root org plus everything
 * beneath it) and compute the aggregate stats the platform admin "Networks" view
 * needs — member/seat counts, aggregate usage, MRR, and escalation health.
 *
 * A group only counts as a reportable "network" if it actually has more than one
 * org in it, or its root has been flagged canProvisionChildOrgs (so a
 * newly-signed network deal with zero daughters provisioned yet still shows up,
 * e.g. "0 of 10 seats used"). Plain standalone orgs are excluded — they're already
 * covered by the flat org list.
 */
function buildNetworkStats(orgStats: OrgStatForNetwork[]) {
  const byId = new Map(orgStats.map((o) => [o.id, o]));
  const groups = new Map<string, OrgStatForNetwork[]>();

  for (const o of orgStats) {
    const rootId = o.ancestorOrgIds.length > 0 ? o.ancestorOrgIds[0] : o.id;
    if (!groups.has(rootId)) groups.set(rootId, []);
    groups.get(rootId)!.push(o);
  }

  const networks = [];
  for (const [rootId, members] of groups.entries()) {
    const root = byId.get(rootId);
    if (!root) continue; // defensive — root should always exist in the same org set
    if (members.length <= 1 && !root.canProvisionChildOrgs) continue; // not a network

    const rootAncestorLen = root.ancestorOrgIds.length;
    const directChildCount = members.filter((m) => m.parentOrgId === rootId).length;
    const maxDepth = members.reduce((max, m) => Math.max(max, m.ancestorOrgIds.length - rootAncestorLen), 0);

    const agg = members.reduce(
      (acc, m) => ({
        totalPartners: acc.totalPartners + m.partnerCount,
        totalSubmissions: acc.totalSubmissions + m.submissionCount,
        totalReleasesSent: acc.totalReleasesSent + m.releaseSentCount,
        totalEmailsSent: acc.totalEmailsSent + m.totalEmailsSent,
        totalEscalated: acc.totalEscalated + m.escalatedInCount,
        totalEscalatedUsed: acc.totalEscalatedUsed + m.escalatedInUsedCount,
        tierDerivedMrr: acc.tierDerivedMrr + getTierPriceMonthly(m.tier),
      }),
      {
        totalPartners: 0,
        totalSubmissions: 0,
        totalReleasesSent: 0,
        totalEmailsSent: 0,
        totalEscalated: 0,
        totalEscalatedUsed: 0,
        tierDerivedMrr: 0,
      }
    );

    networks.push({
      rootOrgId: rootId,
      rootOrgName: root.name,
      memberCount: members.length,
      directChildCount,
      maxChildOrgs: root.maxChildOrgs,
      maxDepth, // 1 = root + one level of children (Auris Tech shape); 2+ = Visit England shape
      ...agg,
      escalationConversionRate: agg.totalEscalated > 0 ? agg.totalEscalatedUsed / agg.totalEscalated : 0,
      contractValueMonthly: root.contractValueMonthly,
      members: members.map((m) => ({ id: m.id, name: m.name })),
    });
  }

  return networks.sort((a, b) => b.tierDerivedMrr - a.tierDerivedMrr);
}

/**
 * Permanently delete an organisation and all associated data. Super-admin only.
 *
 * Deletes:
 *   1. All Firebase Auth users belonging to the org
 *   2. All Firestore data (org doc + all subcollections, recursively)
 *   3. All Storage files under orgs/{orgId}/
 */
export const deleteOrg = functions
  .runWith({ timeoutSeconds: 300 })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);

    const { orgId } = data;
    if (!orgId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required field: orgId');
    }

    const orgRef = db.collection('orgs').doc(orgId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) {
      throw new functions.https.HttpsError('not-found', `Organisation ${orgId} not found.`);
    }

    // 1. Delete all Firebase Auth users in this org
    const usersSnap = await orgRef.collection('users').get();
    const uids = usersSnap.docs.map((d) => d.id);

    if (uids.length > 0) {
      // deleteUsers accepts up to 1000 at a time
      for (let i = 0; i < uids.length; i += 1000) {
        await admin.auth().deleteUsers(uids.slice(i, i + 1000));
      }
      console.log(`[deleteOrg] Deleted ${uids.length} Auth user(s) for org ${orgId}`);
    }

    // 2. Recursively delete all Firestore data under the org
    await db.recursiveDelete(orgRef);
    console.log(`[deleteOrg] Deleted Firestore data for org ${orgId}`);

    // 3. Delete Storage files (best-effort — don't fail if storage is empty)
    try {
      const storage = admin.storage();
      const bucket = storage.bucket();
      await bucket.deleteFiles({ prefix: `orgs/${orgId}/` });
      console.log(`[deleteOrg] Deleted Storage files for org ${orgId}`);
    } catch (err: any) {
      console.warn(`[deleteOrg] Storage cleanup failed (non-fatal): ${err.message}`);
    }

    console.log(`[deleteOrg] Organisation ${orgId} fully deleted by ${context.auth!.uid}`);
    return { success: true };
  });

const DEFAULT_VERTICAL_CATEGORIES: Record<string, string[]> = {
  dmo: ['Accommodation', 'Attraction', 'Activity & Adventure', 'Food & Drink', 'Events & Festivals', 'Transport', 'Retail', 'Spa & Wellness', 'Arts & Culture', 'Nature & Outdoor', 'Sport', 'Other'],
  charity: ['Community Group', 'Health & Wellbeing', 'Education & Training', 'Social Care', 'Environment & Conservation', 'Arts & Culture', 'Housing & Homelessness', 'International Aid', 'Other'],
  'trade-body': ['Manufacturer', 'Retailer', 'Service Provider', 'Consultant & Advisory', 'Technology', 'Media & Communications', 'Professional Services', 'Start-up & SME', 'Enterprise', 'Other'],
  education: ['Primary School', 'Secondary School', 'Sixth Form / FE College', 'Special School', 'Multi-Academy Trust', 'Independent School', 'Early Years / Nursery', 'Other'],
};

/**
 * Get the current partner category lists for all verticals. Super-admin only.
 * Returns Firestore overrides merged with hardcoded defaults.
 */
export const getVerticalCategories = functions.https.onCall(async (_data, context) => {
  requireSuperAdmin(context);

  const doc = await db.collection('platform').doc('config').get();
  const stored = doc.exists ? (doc.data()?.verticals || {}) : {};

  const result: Record<string, string[]> = {};
  for (const verticalId of Object.keys(DEFAULT_VERTICAL_CATEGORIES)) {
    result[verticalId] = stored[verticalId]?.partnerCategories ?? DEFAULT_VERTICAL_CATEGORIES[verticalId];
  }

  return { verticals: result };
});

/**
 * Update the partner category list for a single vertical. Super-admin only.
 * Writes to /platform/config in Firestore.
 *
 * Input: { verticalId: string, categories: string[] }
 */
export const updateVerticalCategories = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { verticalId, categories } = data;

  if (!verticalId || !Object.keys(DEFAULT_VERTICAL_CATEGORIES).includes(verticalId)) {
    throw new functions.https.HttpsError('invalid-argument', 'verticalId must be one of: dmo, charity, trade-body, education.');
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'categories must be a non-empty array of strings.');
  }
  const clean = categories.map((c: any) => String(c).trim()).filter(Boolean);
  if (clean.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'categories must contain at least one non-empty string.');
  }

  await db.collection('platform').doc('config').set(
    { verticals: { [verticalId]: { partnerCategories: clean } } },
    { merge: true }
  );

  console.log(`[updateVerticalCategories] ${verticalId} updated by ${context.auth!.uid}: ${clean.join(', ')}`);
  return { success: true, categories: clean };
});

/**
 * Update partner/submission limits for an organisation. Super-admin only.
 *
 * Input:
 *   orgId: string
 *   maxPartners: number | null   — null removes the limit
 */
export const updateOrgLimits = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { orgId, maxPartners, maxUsers, tier, contractValueMonthly, canProvisionChildOrgs, maxChildOrgs, childOrgDefaultTier } = data;

  if (!orgId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required field: orgId');
  }

  const orgRef = db.collection('orgs').doc(orgId);
  const orgDoc = await orgRef.get();
  if (!orgDoc.exists) {
    throw new functions.https.HttpsError('not-found', `Organisation ${orgId} not found.`);
  }

  const update: Record<string, any> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (maxPartners === null || maxPartners === undefined) {
    update.maxPartners = admin.firestore.FieldValue.delete();
  } else if (maxPartners > 0) {
    update.maxPartners = maxPartners;
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'maxPartners must be a positive number or null.');
  }

  if (maxUsers === null || maxUsers === undefined) {
    update.maxUsers = admin.firestore.FieldValue.delete();
  } else if (maxUsers > 0) {
    update.maxUsers = maxUsers;
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'maxUsers must be a positive number or null.');
  }

  if (tier === null || tier === undefined || tier === '') {
    update.tier = admin.firestore.FieldValue.delete();
  } else if (['starter', 'professional', 'organisation', 'enterprise'].includes(tier)) {
    // 'enterprise' included here — this is the only path that ever sets it, for bespoke
    // manually-invoiced network-root deals (e.g. Auris Tech). Never offered via self-serve
    // signup (functions/src/billing.ts rejects it) or as a childOrgDefaultTier below.
    update.tier = tier;
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'tier must be starter, professional, organisation, enterprise, or null.');
  }

  // Optional manually-entered contract value, for network-root orgs where the actual
  // Enterprise invoice doesn't match the sum of member tier prices. Left untouched if
  // the caller doesn't send the field at all (older client) — explicit null clears it.
  if (contractValueMonthly !== undefined) {
    if (contractValueMonthly === null) {
      update.contractValueMonthly = admin.firestore.FieldValue.delete();
    } else if (typeof contractValueMonthly === 'number' && contractValueMonthly >= 0) {
      update.contractValueMonthly = contractValueMonthly;
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'contractValueMonthly must be a non-negative number or null.');
    }
  }

  // Federated-tenants seat licensing (step 5) — lets a network-root org's admins self-serve
  // create daughter orgs, capped at maxChildOrgs direct children, always at childOrgDefaultTier.
  // Only Press Pilot (super-admin, via this callable) can grant/revoke/resize the licence.
  if (canProvisionChildOrgs !== undefined) {
    if (typeof canProvisionChildOrgs !== 'boolean') {
      throw new functions.https.HttpsError('invalid-argument', 'canProvisionChildOrgs must be a boolean.');
    }
    update.canProvisionChildOrgs = canProvisionChildOrgs;
  }

  if (maxChildOrgs === null || maxChildOrgs === undefined) {
    if (maxChildOrgs === null) update.maxChildOrgs = admin.firestore.FieldValue.delete();
  } else if (typeof maxChildOrgs === 'number' && maxChildOrgs > 0) {
    update.maxChildOrgs = maxChildOrgs;
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'maxChildOrgs must be a positive number or null.');
  }

  // Deliberately excludes 'enterprise', unlike the main tier field above: a self-provisioned
  // daughter org is never itself a bespoke manually-invoiced deal, so it can only default to
  // one of the three self-serve tiers.
  if (childOrgDefaultTier === null || childOrgDefaultTier === undefined || childOrgDefaultTier === '') {
    if (childOrgDefaultTier === null || childOrgDefaultTier === '') update.childOrgDefaultTier = admin.firestore.FieldValue.delete();
  } else if (['starter', 'professional', 'organisation'].includes(childOrgDefaultTier)) {
    update.childOrgDefaultTier = childOrgDefaultTier;
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'childOrgDefaultTier must be starter, professional, organisation, or null.');
  }

  await orgRef.update(update);

  console.log(`Org limits updated: ${orgId} | maxPartners=${maxPartners ?? 'unlimited'} | maxUsers=${maxUsers ?? 'unlimited'} | tier=${tier ?? 'none'} | contractValueMonthly=${contractValueMonthly ?? 'unchanged/none'} | canProvisionChildOrgs=${canProvisionChildOrgs ?? 'unchanged'} | maxChildOrgs=${maxChildOrgs ?? 'unchanged/none'} | childOrgDefaultTier=${childOrgDefaultTier ?? 'unchanged/none'}`);

  return { success: true };
});
