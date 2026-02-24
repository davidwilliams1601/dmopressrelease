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
    await orgRef.set({
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
    });

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
