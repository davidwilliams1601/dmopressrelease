import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Debug function to check a user's document structure
 * This helps diagnose permission issues
 */
export const debugUser = functions.https.onCall(async (data, context) => {
  // Allow any authenticated user to debug their own account
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Must be authenticated to debug user'
    );
  }

  const { orgId, userId } = data;
  const targetUserId = userId || context.auth.uid; // Default to caller's ID

  console.log(`Debugging user: orgId=${orgId}, userId=${targetUserId}`);

  try {
    // Check if user document exists
    const userDoc = await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(targetUserId)
      .get();

    if (!userDoc.exists) {
      return {
        exists: false,
        message: `User document does NOT exist at path: /orgs/${orgId}/users/${targetUserId}`,
        requestedPath: `/orgs/${orgId}/users/${targetUserId}`,
      };
    }

    const userData = userDoc.data();
    console.log('User document data:', JSON.stringify(userData, null, 2));

    // Check all required fields
    const requiredFields = ['id', 'orgId', 'email', 'role'];
    const missingFields: string[] = [];
    const fieldValues: Record<string, any> = {};

    for (const field of requiredFields) {
      if (userData && field in userData) {
        fieldValues[field] = userData[field];
      } else {
        missingFields.push(field);
      }
    }

    // Check if orgId matches
    const orgIdMatches = userData?.orgId === orgId;

    return {
      exists: true,
      path: `/orgs/${orgId}/users/${targetUserId}`,
      data: userData,
      requiredFields: {
        present: Object.keys(fieldValues),
        missing: missingFields,
        values: fieldValues,
      },
      orgIdCheck: {
        expected: orgId,
        actual: userData?.orgId,
        matches: orgIdMatches,
        type: typeof userData?.orgId,
      },
      allFields: Object.keys(userData || {}),
    };
  } catch (error: any) {
    console.error('Error debugging user:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to debug user: ${error.message}`
    );
  }
});
