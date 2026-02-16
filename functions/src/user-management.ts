import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Cloud Function to create a new user
 * Called by organization admins to add users to their org
 */
export const createOrgUser = functions.https.onCall(async (data, context) => {
  // Verify the caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to create users.'
    );
  }

  const { orgId, email, name, role } = data;

  // Validate input
  if (!orgId || !email || !name || !role) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: orgId, email, name, role'
    );
  }

  if (!['Admin', 'User'].includes(role)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Role must be either "Admin" or "User"'
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
        'Only organization admins can create users.'
      );
    }

    // Generate a temporary password
    const tempPassword = generateTempPassword();

    // Create the Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: name,
    });

    // Create initials from name
    const initials = name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    // Set custom claims so the client can read orgId from the auth token
    await admin.auth().setCustomUserClaims(userRecord.uid, { orgId });

    // Create the Firestore user document
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
        role,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth.uid,
      });

    console.log(`User created: ${email} (${userRecord.uid}) for org ${orgId}`);

    // Return the user details and temp password
    return {
      success: true,
      userId: userRecord.uid,
      email,
      tempPassword,
      message: 'User created successfully',
    };
  } catch (error: any) {
    console.error('Error creating user:', error);
    
    if (error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError(
        'already-exists',
        'A user with this email already exists.'
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to create user: ${error.message}`
    );
  }
});

/**
 * Cloud Function to delete a user
 * Called by organization admins to remove users from their org
 */
export const deleteOrgUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to delete users.'
    );
  }

  const { orgId, userId } = data;

  if (!orgId || !userId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: orgId, userId'
    );
  }

  try {
    // Verify the caller is an admin
    const callerUserDoc = await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(context.auth.uid)
      .get();

    if (!callerUserDoc.exists || callerUserDoc.data()?.role !== 'Admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only organization admins can delete users.'
      );
    }

    // Prevent deleting yourself
    if (userId === context.auth.uid) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'You cannot delete your own account.'
      );
    }

    // Delete Auth user first (harder to recreate), then Firestore doc
    await admin.auth().deleteUser(userId);

    // Delete the Firestore document
    await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(userId)
      .delete();

    console.log(`User deleted: ${userId} from org ${orgId}`);

    return {
      success: true,
      message: 'User deleted successfully',
    };
  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to delete user: ${error.message}`
    );
  }
});

/**
 * Cloud Function to update a user's role
 */
export const updateOrgUserRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to update users.'
    );
  }

  const { orgId, userId, role } = data;

  if (!orgId || !userId || !role) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: orgId, userId, role'
    );
  }

  if (!['Admin', 'User'].includes(role)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Role must be either "Admin" or "User"'
    );
  }

  try {
    // Verify the caller is an admin
    const callerUserDoc = await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(context.auth.uid)
      .get();

    if (!callerUserDoc.exists || callerUserDoc.data()?.role !== 'Admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only organization admins can update user roles.'
      );
    }

    // Update the user's role
    await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(userId)
      .update({
        role,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
      });

    console.log(`User role updated: ${userId} to ${role} in org ${orgId}`);

    return {
      success: true,
      message: 'User role updated successfully',
    };
  } catch (error: any) {
    console.error('Error updating user role:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to update user role: ${error.message}`
    );
  }
});

/**
 * Generate a cryptographically secure random temporary password
 */
function generateTempPassword(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('base64').slice(0, 16);
}
