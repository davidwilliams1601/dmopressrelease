import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

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

  return { orgs: orgStats, totals };
});

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
    throw new functions.https.HttpsError('invalid-argument', 'verticalId must be one of: dmo, charity, trade-body.');
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

  const { orgId, maxPartners, maxUsers, tier } = data;

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
  } else if (['starter', 'professional', 'organisation'].includes(tier)) {
    update.tier = tier;
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'tier must be starter, professional, organisation, or null.');
  }

  await orgRef.update(update);

  console.log(`Org limits updated: ${orgId} | maxPartners=${maxPartners ?? 'unlimited'} | maxUsers=${maxUsers ?? 'unlimited'} | tier=${tier ?? 'none'}`);

  return { success: true };
});
