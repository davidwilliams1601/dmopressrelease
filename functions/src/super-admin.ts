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
        createdAt: org.createdAt ?? null,
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
 * Update partner/submission limits for an organisation. Super-admin only.
 *
 * Input:
 *   orgId: string
 *   maxPartners: number | null   — null removes the limit
 */
export const updateOrgLimits = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { orgId, maxPartners } = data;

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

  await orgRef.update(update);

  console.log(`Org limits updated: ${orgId} | maxPartners=${maxPartners ?? 'unlimited'}`);

  return { success: true };
});
