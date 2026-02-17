import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

/**
 * Cloud Function to create a partner invite link.
 * Only organization admins can create invites.
 */
export const createPartnerInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to create invites.'
    );
  }

  const { orgId, label, expiresAt, maxUses } = data;

  if (!orgId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required field: orgId'
    );
  }

  try {
    // Verify the caller is an admin of the organization
    const callerUserDoc = await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(context.auth.uid)
      .get();

    if (!callerUserDoc.exists || callerUserDoc.data()?.role !== 'Admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only organization admins can create partner invites.'
      );
    }

    // Get org slug for the invite code prefix
    const orgDoc = await db.collection('orgs').doc(orgId).get();
    const orgSlug = orgDoc.data()?.slug || orgId;
    const prefix = orgSlug.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Generate a unique invite code
    const randomPart = crypto.randomBytes(4).toString('hex');
    const code = `${prefix}-${randomPart}`;

    // Create the invite document
    const inviteRef = db.collection('orgs').doc(orgId).collection('invites').doc();
    const inviteData: Record<string, any> = {
      id: inviteRef.id,
      orgId,
      code,
      createdBy: context.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      useCount: 0,
      status: 'active',
    };

    if (label) inviteData.label = label;
    if (expiresAt) inviteData.expiresAt = new Date(expiresAt);
    if (maxUses && maxUses > 0) inviteData.maxUses = maxUses;

    await inviteRef.set(inviteData);

    console.log(`Partner invite created: ${code} for org ${orgId}`);

    return {
      success: true,
      inviteId: inviteRef.id,
      code,
      message: 'Partner invite created successfully',
    };
  } catch (error: any) {
    console.error('Error creating partner invite:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError(
      'internal',
      `Failed to create partner invite: ${error.message}`
    );
  }
});

/**
 * Cloud Function to redeem a partner invite.
 * Creates a new user account with the Partner role.
 * This function does NOT require authentication (new users calling it).
 */
export const redeemPartnerInvite = functions.https.onCall(async (data) => {
  const { code, email, password, name } = data;

  if (!code || !email || !password || !name) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: code, email, password, name'
    );
  }

  if (password.length < 6) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Password must be at least 6 characters.'
    );
  }

  try {
    // Find the invite by code across all orgs
    const inviteQuery = await db
      .collectionGroup('invites')
      .where('code', '==', code)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (inviteQuery.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        'Invalid or expired invite code.'
      );
    }

    const inviteDoc = inviteQuery.docs[0];
    const invite = inviteDoc.data();
    const orgId = invite.orgId;

    // Check if invite has expired
    if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
      await inviteDoc.ref.update({ status: 'expired' });
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This invite link has expired.'
      );
    }

    // Check if invite has reached max uses
    if (invite.maxUses && invite.useCount >= invite.maxUses) {
      await inviteDoc.ref.update({ status: 'expired' });
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This invite link has reached its maximum number of uses.'
      );
    }

    // Create the Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // Create initials from name
    const initials = name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    // Set custom claims with orgId
    await admin.auth().setCustomUserClaims(userRecord.uid, { orgId });

    // Create the Firestore user document with Partner role
    await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(userRecord.uid)
      .set({
        id: userRecord.uid,
        orgId,
        email,
        name,
        initials,
        role: 'Partner',
        inviteId: inviteDoc.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Increment the invite use count
    await inviteDoc.ref.update({
      useCount: admin.firestore.FieldValue.increment(1),
    });

    console.log(`Partner registered: ${email} (${userRecord.uid}) for org ${orgId} via invite ${code}`);

    return {
      success: true,
      userId: userRecord.uid,
      orgId,
      message: 'Partner account created successfully',
    };
  } catch (error: any) {
    console.error('Error redeeming partner invite:', error);

    if (error instanceof functions.https.HttpsError) throw error;

    if (error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError(
        'already-exists',
        'An account with this email already exists.'
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to create partner account: ${error.message}`
    );
  }
});
