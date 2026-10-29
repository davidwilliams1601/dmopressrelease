/**
 * Follow-ups: the one server-side action.
 *
 * When a journalist hasn't opened a release and nobody else at their outlet has
 * either, the follow-up view suggests one other contact at the same outlet. Sending
 * the release to that contact goes through here rather than the client, because it
 * is a real send: it creates a single-recipient send job (executeSendJob does the
 * rest, and simulates it for demo orgs) and records the approach so the same outlet
 * is not offered again.
 *
 * Personal follow-ups to journalists who opened are not sent by Press Pilot at all.
 * They go from the sender's own mailbox (a mailto draft) and are only logged.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { followUpKey, normaliseOutlet } from './follow-up-core';

const db = admin.firestore();

const RECIPIENT_REF = /^orgs\/([^/]+)\/outletLists\/([^/]+)\/recipients\/([^/]+)$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const approachAlternativeContact = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to send.');
  }
  const { orgId, releaseId, originalRecipientRef, alternativeRecipientRef, override } = data || {};
  if (typeof orgId !== 'string' || !orgId || typeof releaseId !== 'string' || !releaseId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and releaseId are required.');
  }
  const orig = typeof originalRecipientRef === 'string' ? RECIPIENT_REF.exec(originalRecipientRef) : null;
  const alt = typeof alternativeRecipientRef === 'string' ? RECIPIENT_REF.exec(alternativeRecipientRef) : null;
  if (!orig || !alt || orig[1] !== orgId || alt[1] !== orgId) {
    throw new functions.https.HttpsError('invalid-argument', 'Both contacts must belong to this organisation.');
  }
  if (originalRecipientRef === alternativeRecipientRef) {
    throw new functions.https.HttpsError('invalid-argument', 'Choose a different contact.');
  }

  // Team members only (Admin or User), matching who can send a release.
  const userDoc = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  const role = userDoc.data()?.role;
  if (!userDoc.exists || (role !== 'Admin' && role !== 'User')) {
    throw new functions.https.HttpsError('permission-denied', 'You do not belong to this organisation.');
  }

  const releaseRef = db.collection('orgs').doc(orgId).collection('releases').doc(releaseId);
  const [releaseSnap, origSnap, altSnap] = await Promise.all([
    releaseRef.get(),
    db.doc(originalRecipientRef).get(),
    db.doc(alternativeRecipientRef).get(),
  ]);
  if (!releaseSnap.exists) throw new functions.https.HttpsError('not-found', 'Release not found.');
  if (releaseSnap.data()?.status !== 'Sent') {
    throw new functions.https.HttpsError('failed-precondition', 'Only a sent release can go to an alternative contact.');
  }
  if (!origSnap.exists || !altSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'That contact is no longer in your lists.');
  }
  const original = origSnap.data()!;
  const alternative = altSnap.data()!;
  if (alternative.doNotContact === true) {
    throw new functions.https.HttpsError('failed-precondition', `${alternative.name || 'This contact'} is marked do not contact.`);
  }
  if (!alternative.email || !EMAIL.test(String(alternative.email))) {
    throw new functions.https.HttpsError('failed-precondition', 'That contact has no valid email address.');
  }
  const outletKey = normaliseOutlet(original.outlet);
  if (!outletKey || normaliseOutlet(alternative.outlet) !== outletKey) {
    throw new functions.https.HttpsError('failed-precondition', 'The alternative must work at the same outlet.');
  }

  // Never send the same release to the same person twice, including jobs still queued.
  const jobsSnap = await db.collection('orgs').doc(orgId).collection('sendJobs').where('releaseId', '==', releaseId).get();
  for (const job of jobsSnap.docs) {
    const j = job.data();
    if (j.status === 'failed' || j.status === 'cancelled') continue;
    if (Array.isArray(j.targetRecipientRefs)) {
      if (j.targetRecipientRefs.includes(alternativeRecipientRef)) {
        throw new functions.https.HttpsError('already-exists', `${alternative.name} has already been sent this release.`);
      }
      continue;
    }
    const inList = Array.isArray(j.outletListIds) && j.outletListIds.includes(alt[2]);
    const excluded = Array.isArray(j.excludedRecipientRefs) && j.excludedRecipientRefs.includes(alternativeRecipientRef);
    if (inList && !excluded) {
      throw new functions.https.HttpsError('already-exists', `${alternative.name} has already been sent this release.`);
    }
    const rows = await job.ref.collection('recipients').where('recipientRef', '==', alternativeRecipientRef).limit(1).get();
    if (!rows.empty) {
      throw new functions.https.HttpsError('already-exists', `${alternative.name} has already been sent this release.`);
    }
  }

  // One alternative per outlet per release, unless deliberately overridden.
  const followUpsRef = releaseRef.collection('followUps');
  if (override !== true) {
    const prior = await followUpsRef.where('outletKey', '==', outletKey).where('status', '==', 'alternative_sent').limit(1).get();
    if (!prior.empty) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `You have already tried another contact at ${original.outlet} for this release.`
      );
    }
  }

  const jobRef = await db.collection('orgs').doc(orgId).collection('sendJobs').add({
    orgId,
    releaseId,
    outletListIds: [alt[2]],
    targetRecipientRefs: [alternativeRecipientRef],
    kind: 'alternative_contact',
    followUpOf: { recipientRef: originalRecipientRef, name: original.name || '' },
    status: 'pending',
    totalRecipients: 1,
    sentCount: 0,
    failedCount: 0,
    includeSmartDistributionRecommendations: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: context.auth.uid,
  });

  await Promise.all([
    releaseRef.update({
      sends: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
    followUpsRef.doc(followUpKey(originalRecipientRef)).set(
      {
        orgId,
        releaseId,
        recipientRef: originalRecipientRef,
        name: original.name || '',
        outlet: original.outlet || '',
        outletKey,
        status: 'alternative_sent',
        alternativeRecipientRef,
        alternativeName: alternative.name || '',
        alternativeSendJobId: jobRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
      },
      { merge: true }
    ),
  ]);

  console.log(`[follow-ups] ${context.auth.uid} sent release ${releaseId} to an alternative contact at ${outletKey} (job ${jobRef.id})`);
  return { success: true, sendJobId: jobRef.id };
});
