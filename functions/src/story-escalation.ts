import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Push a partner submission from a daughter org straight into its parent org's own
 * `submissions` subcollection — the exact same collection every ordinary partner
 * submission lands in. Once written, the parent's existing `analyzeSubmissionThemes`
 * Firestore trigger fires automatically and scores it using the PARENT org's own
 * vertical/editorial-priorities context (deliberately re-analysed, not copied, since
 * a network parent may have different scoring criteria than the daughter org).
 *
 * Callable by any signed-in team member of a daughter org (Admin or Editor) — this is
 * not super-admin gated. Authorisation is enforced by deriving the caller's own orgId
 * from their auth token (never trusted from the request body) and requiring that org's
 * own `parentOrgId` field to be set; a root org with no parent has nothing to escalate to.
 */
export const escalateSubmissionToParent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const orgId = context.auth.token.orgId as string | undefined;
  if (!orgId) {
    throw new functions.https.HttpsError('failed-precondition', 'No organisation found for this account.');
  }

  const submissionId = data?.submissionId as string | undefined;
  if (!submissionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required field: submissionId.');
  }

  // Confirm the caller is a real team member of orgId (mirrors the check other
  // org-scoped callables use — e.g. createBillingPortalSession in billing.ts).
  const callerSnap = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  if (!callerSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'You are not a member of this organisation.');
  }

  const orgRef = db.collection('orgs').doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Organisation not found.');
  }
  const orgData = orgSnap.data() || {};
  const parentOrgId = orgData.parentOrgId as string | undefined;
  if (!parentOrgId) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'This organisation has no parent network to escalate stories to.'
    );
  }

  const parentOrgSnap = await db.collection('orgs').doc(parentOrgId).get();
  if (!parentOrgSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Parent organisation no longer exists.');
  }
  const parentOrgName = (parentOrgSnap.data() || {}).name as string | undefined;

  const submissionRef = orgRef.collection('submissions').doc(submissionId);
  const submissionSnap = await submissionRef.get();
  if (!submissionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Submission not found.');
  }
  const submission = submissionSnap.data() || {};

  if (submission.escalatedToOrgId) {
    throw new functions.https.HttpsError(
      'already-exists',
      `This submission has already been pushed to ${parentOrgName || 'the parent organisation'}.`
    );
  }

  const orgName = (orgData.name as string | undefined) || orgId;
  const newSubmissionRef = db.collection('orgs').doc(parentOrgId).collection('submissions').doc();

  const escalatedCopy: Record<string, any> = {
    id: newSubmissionRef.id,
    orgId: parentOrgId,
    // Synthetic, stable-per-source-org id so the parent's reporting groups every story
    // escalated by the same daughter org together, without colliding with any real
    // partner uid in the parent's own users collection.
    partnerId: `escalated:${orgId}`,
    partnerName: `${orgName} — ${submission.partnerName || 'Partner'}`,
    partnerEmail: submission.partnerEmail || '',
    title: submission.title || '',
    bodyCopy: submission.bodyCopy || '',
    // Tag ids are org-scoped and meaningless across orgs — start untagged rather than
    // carry over ids that won't match any tag in the parent's own tag list.
    tagIds: [],
    imageUrls: submission.imageUrls || [],
    imageStoragePaths: submission.imageStoragePaths || [],
    imageMetadata: submission.imageMetadata || [],
    status: 'submitted',
    partnerSocialHandles: submission.partnerSocialHandles || {},
    subjectConsentConfirmed: submission.subjectConsentConfirmed ?? null,
    subjectConsentText: submission.subjectConsentText ?? null,
    sourceOrgId: orgId,
    sourceSubmissionId: submissionId,
    sourceOrgName: orgName,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.set(newSubmissionRef, escalatedCopy);
  batch.update(submissionRef, {
    escalatedAt: admin.firestore.FieldValue.serverTimestamp(),
    escalatedToOrgId: parentOrgId,
    escalatedToSubmissionId: newSubmissionRef.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();

  console.log(
    `[escalateSubmissionToParent] ${orgId}/${submissionId} -> ${parentOrgId}/${newSubmissionRef.id} by ${context.auth.uid}`
  );

  return {
    success: true,
    parentOrgId,
    parentOrgName: parentOrgName || parentOrgId,
    newSubmissionId: newSubmissionRef.id,
  };
});
