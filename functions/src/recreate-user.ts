import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Admin function to recreate a broken user account
 * This deletes and recreates both the Auth account and Firestore document
 */
export const recreateUser = functions.https.onCall(async (data, context) => {
  // Verify the caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
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
        'Only organization admins can recreate users.'
      );
    }

    console.log(`Starting recreate user process for ${email}`);

    let existingUid: string | null = null;

    // Step 1: Check if user exists in Firebase Auth
    try {
      const existingUser = await admin.auth().getUserByEmail(email);
      existingUid = existingUser.uid;
      console.log(`Found existing auth user: ${existingUid}`);

      // Check if Firestore document exists
      const userDoc = await db
        .collection('orgs')
        .doc(orgId)
        .collection('users')
        .doc(existingUid)
        .get();

      console.log(`Firestore document exists: ${userDoc.exists}`);
      if (userDoc.exists) {
        console.log(`Document data:`, userDoc.data());
      }

      // Delete auth user
      await admin.auth().deleteUser(existingUid);
      console.log(`Deleted auth user ${existingUid}`);

      // Delete Firestore document if it exists
      if (userDoc.exists) {
        await userDoc.ref.delete();
        console.log(`Deleted Firestore document`);
      }

    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log('No existing user found - will create new');
      } else {
        throw error;
      }
    }

    // Step 2: Generate a temporary password
    const tempPassword = generateTempPassword();

    // Step 3: Create the Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: name,
    });

    console.log(`Created new auth user: ${userRecord.uid}`);

    // Step 4: Create initials from name
    const initials = name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    // Step 5: Create the Firestore user document
    const userData = {
      id: userRecord.uid,
      orgId,
      email,
      name,
      initials,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid,
      recreated: true, // Flag to indicate this was recreated
    };

    console.log(`Creating Firestore document at /orgs/${orgId}/users/${userRecord.uid}`);
    console.log(`Document data:`, JSON.stringify(userData, null, 2));

    await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(userRecord.uid)
      .set(userData);

    console.log(`Created Firestore document`);

    // Step 6: Verify the document was created
    const verifyDoc = await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(userRecord.uid)
      .get();

    if (!verifyDoc.exists) {
      throw new Error('Document verification failed - document does not exist after creation!');
    }

    console.log(`✅ Verified document exists:`, verifyDoc.data());

    console.log(`Successfully recreated user: ${email} (${userRecord.uid}) for org ${orgId}`);

    // Return the user details and temp password
    return {
      success: true,
      userId: userRecord.uid,
      email,
      tempPassword,
      message: 'User recreated successfully',
      verified: true,
    };

  } catch (error: any) {
    console.error('Error recreating user:', error);

    if (error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError(
        'already-exists',
        'A user with this email already exists and could not be deleted.'
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to recreate user: ${error.message}`
    );
  }
});

/**
 * Generate a random temporary password
 */
function generateTempPassword(): string {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}
