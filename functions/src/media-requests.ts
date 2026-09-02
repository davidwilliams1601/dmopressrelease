import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Simple email format validation (mirrors index.ts helper)
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Public callable Cloud Function to submit a journalist story request.
 * No authentication required — this is a public-facing endpoint.
 *
 * Spam mitigations:
 *   1. Honeypot field check (must be empty)
 *   2. Server-side rate limit: max 5 requests per email per hour
 *   3. Required field + email format validation
 *   4. No direct Firestore write from client — only this function can create documents
 */
export const submitStoryRequest = functions.https.onCall(async (data) => {
  const {
    orgSlug,
    name,
    email,
    outlet,
    topic,
    destinations,
    deadline,
    additionalInfo,
    honeypot,
  } = data || {};

  // 1. Honeypot check — bots fill hidden fields, humans leave them empty
  if (honeypot) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Submission rejected.'
    );
  }

  // 2. Validate required fields
  if (!orgSlug || typeof orgSlug !== 'string' || orgSlug.trim().length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Organisation is required.');
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Name is required.');
  }
  if (!email || typeof email !== 'string' || !isValidEmail(email.trim())) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid email address is required.');
  }
  if (!outlet || typeof outlet !== 'string' || outlet.trim().length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Publication / outlet is required.');
  }
  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Story topic / angle is required.');
  }

  const cleanEmail = email.trim().toLowerCase();

  // 3. Resolve orgSlug to orgId
  const orgQuery = await db
    .collection('orgs')
    .where('slug', '==', orgSlug.trim())
    .limit(1)
    .get();

  if (orgQuery.empty) {
    throw new functions.https.HttpsError('not-found', 'Organisation not found.');
  }

  const orgId: string = orgQuery.docs[0].id;

  // 4. Rate limit: max 5 submissions from the same email in the last hour.
  // Single equality filter only — avoids requiring a composite index.
  // Time filtering is done in code after the query.
  const emailSnapshot = await db
    .collection('orgs')
    .doc(orgId)
    .collection('mediaRequests')
    .where('email', '==', cleanEmail)
    .get();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = emailSnapshot.docs.filter((d) => {
    const createdAt: FirebaseFirestore.Timestamp | undefined = d.data().createdAt;
    const submittedAt = createdAt?.toDate ? createdAt.toDate() : new Date(0);
    return submittedAt >= oneHourAgo;
  }).length;

  if (recentCount >= 5) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Too many requests from this email address. Please try again later.'
    );
  }

  // 5. Write to Firestore
  const requestRef = db.collection('orgs').doc(orgId).collection('mediaRequests').doc();
  const requestData: Record<string, any> = {
    id: requestRef.id,
    orgId,
    name: name.trim(),
    email: cleanEmail,
    outlet: outlet.trim(),
    topic: topic.trim(),
    status: 'new',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (destinations && typeof destinations === 'string' && destinations.trim()) {
    requestData.destinations = destinations.trim();
  }
  if (deadline && typeof deadline === 'string' && deadline.trim()) {
    requestData.deadline = deadline.trim();
  }
  if (additionalInfo && typeof additionalInfo === 'string' && additionalInfo.trim()) {
    requestData.additionalInfo = additionalInfo.trim();
  }

  await requestRef.set(requestData);
  console.log(`Media request created: ${requestRef.id} for org ${orgId} from ${cleanEmail}`);

  // 6. Notification is handled by the `onNewMediaRequest` Firestore trigger in
  // org-user-notifications.ts, which fires on the write above. This function used
  // to also send its own email to the org's press contact, which meant a single
  // journalist enquiry produced two differently-templated emails — and, where the
  // press contact was also an org user with media-request notifications on (the
  // normal case), both landed on the same person. The trigger now covers the press
  // contact explicitly, so this send has been removed rather than deduplicated.

  return { success: true };
});

