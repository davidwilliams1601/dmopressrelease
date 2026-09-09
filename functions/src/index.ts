import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { escapeHtml } from './html-utils';
import { sendWithRetry } from './sendgrid-retry';
import { orgSender } from './sender';
import { formatEmailHtml, formatEmailText } from './email-template';
import { getStorage } from 'firebase-admin/storage';

// QA fix (2026-08-20): admin.initializeApp() must run before ANY module that calls
// admin.firestore() at its own top level is required. send-distribution.ts and
// credits.ts both do this (`const db = admin.firestore();` at module scope), and
// TypeScript compiles `import` to an in-place `require()` for this CommonJS target
// — it does NOT hoist requires above other statements the way native ESM hoists
// imports. Previously both were imported above this line, so requiring this file at
// all (including Firebase CLI's own deploy-time codebase analysis) always threw
// "The default Firebase app does not exist", independent of any QA branch changes
// (reproduces identically on a clean `main` checkout). Moving the imports below the
// initializeApp() call fixes the ordering; everything else in this file already
// requires modules after this line.
admin.initializeApp();

import { resolveSmartDistributionRecipientsForSend } from './send-distribution';
import {
  reserveSmartDistributionCredit,
  finalizeSmartDistributionCreditReservation,
  releaseSmartDistributionCreditReservation,
} from './credits';
import { resolveNetworkContactRef } from './network-contact-refs';
import { applyExclusions, parseExcludedRecipientRefs } from './send-exclusions';

// Export webhook handlers
export * from './webhooks';

const db = admin.firestore();

// Initialize SendGrid
// The API key will be set from environment variables
const sendgridApiKey = functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY;
if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
  console.log('SendGrid initialized');
} else {
  console.warn('SendGrid API key not configured. Emails will not be sent.');
}

// Simple email format validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


/** Normalises a name/email pair into a single lowercase key for identity dedupe.
 *  Must mirror the same helper duplicated in recommendations.ts / send-distribution.ts. */
function normaliseIdentity(name?: string, email?: string): string {
  return `${(name || '').trim().toLowerCase()}|${(email || '').trim().toLowerCase()}`;
}

/** A single entry in the unified, merged send list executeSendJob dispatches to —
 *  either a plain outlet-list recipient or a Smart Distribution recommendation that
 *  passed the send-time eligibility recheck. */
type MergedSendEntry = {
  sendJobRecipientId: string;
  source: 'customer_contact' | 'smart_distribution_recommendation';
  recipientRef?: string;
  // QA fix (H1): opaque reference only — see network-contact-refs.ts. Never the real
  // mediaNetworkContacts document ID.
  networkContactRef?: string;
  recommendationSnapshotId?: string;
  name?: string;
  email: string;
  outlet?: string;
};

/**
 * Core sending logic extracted for reuse by both immediate and scheduled sends.
 *
 * Smart Distribution (Phase 4): when `sendJob.includeSmartDistributionRecommendations
 * === true`, this also merges in the release's currently-`included` recommendations
 * (re-validated at send time via `resolveSmartDistributionRecipientsForSend`), writes
 * a full `SendJobRecipient` row per recipient — including a `suppressed` row for every
 * recommendation rejected by the recheck — and debits exactly one credit per
 * successfully-delivered network-sourced recipient, never for a rejected or failed one.
 */
async function executeSendJob(
  orgId: string,
  jobId: string,
  jobRef: FirebaseFirestore.DocumentReference,
  sendJob: any
): Promise<void> {
  // Update status to processing
  await jobRef.update({
    status: 'processing',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Fetch the release
  const releaseDoc = await db
    .collection('orgs')
    .doc(orgId)
    .collection('releases')
    .doc(sendJob.releaseId)
    .get();

  if (!releaseDoc.exists) {
    throw new Error('Release not found');
  }

  const release = { ...releaseDoc.data(), id: releaseDoc.id };

  // Fetch organization data for sender info
  const orgDoc = await db.collection('orgs').doc(orgId).get();
  if (!orgDoc.exists) {
    throw new Error(`Organization ${orgId} not found`);
  }
  const org = orgDoc.data();

  // Fetch all recipients from selected outlet lists, tracking each one's full document
  // path (recipientRef) and identity so Smart Distribution merging/dedupe below can use them.
  const recipients: any[] = [];
  const seenIdentities = new Set<string>();
  for (const listId of sendJob.outletListIds) {
    const recipientsSnapshot = await db
      .collection('orgs')
      .doc(orgId)
      .collection('outletLists')
      .doc(listId)
      .collection('recipients')
      .get();

    recipientsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      recipients.push({ id: doc.id, ...data, recipientRef: doc.ref.path });
    });
  }

  // Drop recipients the sender deliberately unticked in the send dialog (see
  // send-exclusions.ts). Done before identity tracking so an excluded customer contact
  // doesn't also suppress a matching Smart Distribution recommendation.
  const { kept: includedRecipients, excluded: excludedRecipients } = applyExclusions(
    recipients,
    Array.isArray(sendJob.excludedRecipientRefs) ? sendJob.excludedRecipientRefs : []
  );
  if (excludedRecipients.length > 0) {
    console.log(`Send job ${jobId}: ${excludedRecipients.length} recipient(s) excluded by sender`);
  }
  includedRecipients.forEach((r) => seenIdentities.add(normaliseIdentity(r.name, r.email)));

  // Filter to valid emails only
  const validRecipients = includedRecipients.filter((r) => r.email && isValidEmail(r.email));
  const skippedCount = includedRecipients.length - validRecipients.length;
  if (skippedCount > 0) {
    console.warn(`Skipped ${skippedCount} recipients with invalid emails`);
  }

  // --- Smart Distribution merge (Phase 4) ---
  let smartDistributionMergedCount = 0;
  const mergedEntries: MergedSendEntry[] = validRecipients.map((r) => ({
    sendJobRecipientId: '', // filled in once the SendJobRecipient doc is created below
    source: 'customer_contact' as const,
    recipientRef: r.recipientRef,
    name: r.name,
    email: r.email,
    outlet: r.outlet,
  }));

  const suppressedEntries: Array<{
    source: 'customer_contact' | 'smart_distribution_recommendation';
    recipientRef?: string;
    networkContactRef?: string;
    recommendationSnapshotId: string;
    skipReason: string;
  }> = [];

  if (sendJob.includeSmartDistributionRecommendations === true) {
    const { eligible, rejected } = await resolveSmartDistributionRecipientsForSend(
      orgId,
      sendJob.releaseId,
      seenIdentities
    );

    for (const entry of eligible) {
      smartDistributionMergedCount++;
      mergedEntries.push({
        sendJobRecipientId: '',
        source: entry.source,
        recipientRef: entry.recipientRef,
        networkContactRef: entry.networkContactRef,
        recommendationSnapshotId: entry.snapshotId,
        name: entry.name,
        email: entry.email || '',
        outlet: entry.outlet,
      });
    }
    for (const entry of rejected) {
      smartDistributionMergedCount++; // "merged into consideration" even though suppressed
      suppressedEntries.push({
        source: entry.source,
        recipientRef: entry.recipientRef,
        networkContactRef: entry.networkContactRef,
        recommendationSnapshotId: entry.snapshotId,
        skipReason: entry.rejectedReason,
      });
    }
  }

  const sendableEntries = mergedEntries.filter((e) => e.email && isValidEmail(e.email));

  console.log(
    `Sending to ${sendableEntries.length} recipients (${validRecipients.length} outlet-list, ` +
      `${sendableEntries.length - validRecipients.length} Smart Distribution) for job ${jobId}`
  );

  // --- Pre-create a SendJobRecipient row for every recipient before any send attempt ---
  // (both dispatchable entries as 'pending' and pre-send-rejected recommendations as
  // 'suppressed' with no send attempt and no charge) so the recipients subcollection is a
  // complete per-send record from the very start, per data-model-and-security.md §4.
  const recipientsCollection = jobRef.collection('recipients');
  const now = admin.firestore.FieldValue.serverTimestamp();
  let writeBatch = db.batch();
  let opsInBatch = 0;
  const flushIfNeeded = async () => {
    if (opsInBatch >= 400) {
      await writeBatch.commit();
      writeBatch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const entry of sendableEntries) {
    const ref = recipientsCollection.doc();
    entry.sendJobRecipientId = ref.id;
    writeBatch.set(ref, {
      orgId,
      sendJobId: jobId,
      source: entry.source,
      ...(entry.recipientRef ? { recipientRef: entry.recipientRef } : {}),
      // QA fix (H1): recipients rows only ever store the opaque reference here — the
      // real ID is resolved server-side, on demand, from networkContactRef via
      // resolveNetworkContactRef, never written onto this client-readable row.
      ...(entry.networkContactRef ? { networkContactRef: entry.networkContactRef } : {}),
      ...(entry.recommendationSnapshotId ? { recommendationSnapshotId: entry.recommendationSnapshotId } : {}),
      deliveryStatus: 'pending',
      createdAt: now,
    });
    opsInBatch++;
    await flushIfNeeded();
  }
  for (const entry of suppressedEntries) {
    const ref = recipientsCollection.doc();
    writeBatch.set(ref, {
      orgId,
      sendJobId: jobId,
      source: entry.source,
      ...(entry.recipientRef ? { recipientRef: entry.recipientRef } : {}),
      ...(entry.networkContactRef ? { networkContactRef: entry.networkContactRef } : {}),
      recommendationSnapshotId: entry.recommendationSnapshotId,
      deliveryStatus: 'suppressed',
      skipReason: entry.skipReason,
      createdAt: now,
    });
    opsInBatch++;
    await flushIfNeeded();
  }
  if (opsInBatch > 0) {
    await writeBatch.commit();
  }

  let sentCount = 0;
  let failedCount = 0;
  let smartDistributionCreditsUsed = 0;
  const failedRecipients: string[] = [];

  // Send emails in batches to avoid timeout
  const BATCH_SIZE = 50;
  for (let i = 0; i < sendableEntries.length; i += BATCH_SIZE) {
    const batch = sendableEntries.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (entry) => {
        const recipientDocRef = recipientsCollection.doc(entry.sendJobRecipientId);
        const isNetworkContact =
          entry.source === 'smart_distribution_recommendation' && !!entry.networkContactRef;
        // QA fix (2026-08-20): reserve the credit BEFORE sending, not after. Previously
        // the code sent first and debited afterwards, so a losing balance race meant a
        // network contact could be emailed for free (see credits.ts reservation system
        // for the full rationale).
        let reservation: { reservationId: string; reserved: boolean } | null = null;

        try {
          // QA fix (H1): resolve the opaque networkContactRef back to the real,
          // stable mediaNetworkContacts ID exactly here — credits.ts legitimately
          // needs the real, stable ID for its idempotency keys (creditReservations is
          // already server-only per the earlier C4 fix, so storing the real ID there
          // is unchanged/fine). The real ID never leaves this scope onto any
          // client-readable field.
          const realNetworkContactId = isNetworkContact
            ? await resolveNetworkContactRef(orgId, entry.networkContactRef)
            : undefined;
          if (isNetworkContact && !realNetworkContactId) {
            // Reference somehow didn't resolve (should not happen) — treat like any
            // other send-time eligibility failure rather than risk an unbilled or
            // mis-keyed credit reservation.
            await recipientDocRef.update({
              deliveryStatus: 'suppressed',
              skipReason: 'network_contact_ref_unresolved',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return;
          }
          if (isNetworkContact) {
            reservation = await reserveSmartDistributionCredit({
              orgId,
              campaignId: jobId,
              networkContactId: realNetworkContactId!,
            });
            if (!reservation.reserved) {
              // No credit available for this recipient — skip the send entirely rather
              // than emailing a network contact for free.
              await recipientDocRef.update({
                deliveryStatus: 'suppressed',
                skipReason: 'insufficient_balance',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              return;
            }
          }

          // QA fix (Low): for a network-sourced recipient, log a non-identifying
          // label (the sendJobRecipientId) instead of the real email everywhere a
          // send is logged, so raw network-contact addresses stop appearing in
          // ordinary Cloud Function logs on successful sends, failures, and retries.
          // Customer-owned contacts keep their real email in logs, since it's already
          // visible to their own org.
          const recipientLogLabel = isNetworkContact
            ? `networkContact:${entry.sendJobRecipientId}`
            : entry.email;
          await sendEmail(
            { name: entry.name, email: entry.email, outlet: entry.outlet },
            release,
            orgId,
            org,
            { sendJobId: jobId, sendJobRecipientId: entry.sendJobRecipientId },
            recipientLogLabel
          );
          sentCount++;

          if (isNetworkContact && reservation) {
            const debit = await finalizeSmartDistributionCreditReservation({
              orgId,
              campaignId: jobId,
              networkContactId: realNetworkContactId!,
              reservationId: reservation.reservationId,
            });
            if (debit) {
              smartDistributionCreditsUsed++;
              await recipientDocRef.update({
                deliveryStatus: 'delivered',
                creditTransactionId: debit.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            } else {
              // Should not happen — the reservation already confirmed availability — but
              // never leave a delivered recipient silently uncharged without a flag.
              await recipientDocRef.update({
                deliveryStatus: 'delivered',
                skipReason: 'reservation_finalize_failed',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          } else {
            await recipientDocRef.update({
              deliveryStatus: 'delivered',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        } catch (error) {
          // QA fix (Low): use the same non-identifying label here as in sendEmail —
          // this catch previously always logged the raw entry.email regardless of
          // isNetworkContact.
          const failureLogLabel = isNetworkContact
            ? `networkContact:${entry.sendJobRecipientId}`
            : entry.email;
          console.error(`Failed to send to ${failureLogLabel} (after retries):`, error);
          failedCount++;
          if (isNetworkContact) {
            // QA fix (2026-08-20): never record a network contact's raw email address on
            // the team-readable send-job document — keep the anonymity guarantee intact
            // even on a failed dispatch. Customer-owned contacts are already visible to
            // their own org, so their address is fine to keep here for triage.
            if (reservation?.reserved) {
              await releaseSmartDistributionCreditReservation({
                orgId,
                reservationId: reservation.reservationId,
              });
            }
          } else {
            failedRecipients.push(entry.email);
          }
          await recipientDocRef.update({
            deliveryStatus: 'failed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      })
    );

    // Update progress periodically
    if (i + BATCH_SIZE < sendableEntries.length) {
      await jobRef.update({
        sentCount,
        failedCount,
      });
    }
  }

  // Update send job with results — server is the source of truth for totalRecipients
  // once Smart Distribution merging has happened, overriding the client's list-only estimate.
  await jobRef.update({
    status: 'completed',
    totalRecipients: sendableEntries.length,
    sentCount,
    failedCount,
    ...(failedRecipients.length > 0 ? { failedRecipients } : {}),
    ...(sendJob.includeSmartDistributionRecommendations === true
      ? {
          smartDistributionRecipientCount: smartDistributionMergedCount,
          smartDistributionCreditsUsed,
        }
      : {}),
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Send job ${jobId} completed: ${sentCount} sent, ${failedCount} failed`);

  // Notify org admins if any emails failed
  if (failedCount > 0) {
    try {
      const adminUsersSnap = await db
        .collection('orgs')
        .doc(orgId)
        .collection('users')
        .where('role', '==', 'Admin')
        .get();

      const adminEmails = adminUsersSnap.docs
        .map((d) => d.data().email)
        .filter((e): e is string => !!e && isValidEmail(e));

      if (adminEmails.length > 0) {
        const fromEmail =
          functions.config().sendgrid?.from_email ||
          process.env.SENDGRID_FROM_EMAIL;

        if (fromEmail) {
          const releaseTitle = escapeHtml((release as any).headline || 'Untitled release');
          const failedListHtml = failedRecipients
            .map((e: string) => `<li>${escapeHtml(e)}</li>`)
            .join('\n');

          const notificationHtml = `
            <h2>Email Send Failures</h2>
            <p><strong>${failedCount}</strong> email(s) failed to send for the release &ldquo;${releaseTitle}&rdquo;.</p>
            <p><strong>Failed recipients:</strong></p>
            <ul>${failedListHtml}</ul>
            <p>${sentCount} email(s) were sent successfully.</p>
          `;

          await Promise.all(
            adminEmails.map((adminEmail) =>
              sendWithRetry({
                to: adminEmail,
                from: { email: fromEmail, name: org?.name || 'PressPilot' },
                subject: `${failedCount} emails failed to send for ${(release as any).headline || 'Untitled release'}`,
                html: notificationHtml,
              } as sgMail.MailDataRequired)
            )
          );

          console.log(`Admin failure notification sent to ${adminEmails.length} admin(s)`);
        } else {
          console.warn('Cannot send admin notification: SENDGRID_FROM_EMAIL not configured');
        }
      } else {
        console.warn('No admin users with valid emails found for failure notification');
      }
    } catch (notifyError) {
      // Don't let notification failures break the main flow
      console.error('Failed to send admin failure notification:', notifyError);
    }
  }
}

/**
 * Cloud Function to process send jobs
 * Triggered when a new sendJob document is created
 */
export const processSendJob = functions
  .runWith({ timeoutSeconds: 540 }) // 9 minute max timeout
  .firestore
  .document('orgs/{orgId}/sendJobs/{jobId}')
  .onCreate(async (snap, context) => {
    const { orgId, jobId } = context.params;
    const sendJob = snap.data();

    console.log(`Processing send job ${jobId} for org ${orgId}`);

    // Skip scheduled jobs — they will be picked up by processScheduledSendJobs
    if (sendJob.status === 'scheduled') {
      console.log('SendJob is scheduled for later, skipping immediate processing.');
      return;
    }

    // QA fix (H6): atomically claim this job before dispatching, mirroring the
    // compare-and-set transaction processScheduledSendJobs already uses below.
    // Without this, any retry/redelivery of the same .onCreate trigger invocation
    // (Cloud Functions gives no exactly-once guarantee) would re-run executeSendJob
    // and double-send every recipient with no protection.
    try {
      const claimed = await db.runTransaction(async (txn) => {
        const freshDoc = await txn.get(snap.ref);
        if (freshDoc.data()?.status !== 'pending') {
          console.log(`Job ${jobId} already claimed or not pending, skipping`);
          return false;
        }
        txn.update(snap.ref, { status: 'processing' });
        return true;
      });
      if (!claimed) return;
    } catch (err) {
      console.warn(`Failed to claim job ${jobId}, skipping:`, err);
      return;
    }

    try {
      await executeSendJob(orgId, jobId, snap.ref, sendJob);
    } catch (error: any) {
      console.error('Error processing send job:', error);

      // Update send job with error
      await snap.ref.update({
        status: 'failed',
        error: error.message || 'Unknown error',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

/**
 * Scheduled Cloud Function that runs every minute to pick up due scheduled send jobs.
 * Uses a transaction to atomically claim each job and prevent double-processing.
 */
export const processScheduledSendJobs = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    // Query all scheduled sendJobs that are due
    const dueJobs = await db.collectionGroup('sendJobs')
      .where('status', '==', 'scheduled')
      .where('scheduledAt', '<=', now)
      .limit(5)
      .get();

    if (dueJobs.empty) return;

    console.log(`Found ${dueJobs.size} scheduled jobs to process`);

    for (const doc of dueJobs.docs) {
      const jobRef = doc.ref;
      const jobData = doc.data();
      const orgId = jobData.orgId;

      // Atomically claim the job to prevent double-processing
      try {
        await db.runTransaction(async (txn) => {
          const freshDoc = await txn.get(jobRef);
          if (freshDoc.data()?.status !== 'scheduled') {
            console.log(`Job ${doc.id} already claimed, skipping`);
            return;
          }
          txn.update(jobRef, { status: 'processing' });
        });
      } catch (err) {
        console.warn(`Failed to claim job ${doc.id}, skipping:`, err);
        continue;
      }

      // Execute the send
      try {
        await executeSendJob(orgId, doc.id, jobRef, jobData);
      } catch (err) {
        console.error(`Failed to execute scheduled job ${doc.id}:`, err);
        await jobRef.update({ status: 'failed', error: (err as Error).message });
      }
    }
  });

/**
 * Callable Cloud Function to cancel a scheduled send job.
 * Verifies the caller is authenticated and the job belongs to their org.
 */
export const cancelScheduledSend = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in to cancel a send.');
  }

  const { orgId, sendJobId } = data;
  if (!orgId || !sendJobId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and sendJobId are required.');
  }

  // Verify the caller belongs to this org
  const userDoc = await db
    .collection('orgs')
    .doc(orgId)
    .collection('users')
    .doc(context.auth.uid)
    .get();

  if (!userDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'You do not belong to this organization.');
  }

  const jobRef = db
    .collection('orgs')
    .doc(orgId)
    .collection('sendJobs')
    .doc(sendJobId);

  // QA fix (Medium): cancellation race. This previously read the job's status with a
  // plain (non-transactional) .get() and then wrote 'cancelled' with a plain .update(),
  // with no atomicity between the two. processScheduledSendJobs (and processSendJob's
  // H6 claim) runs its own compare-and-set transaction that flips 'scheduled' -> 
  // 'processing' right before dispatching. If that transaction commits in the window
  // between this function's read and its write, the plain update here would stomp
  // 'processing' back to 'cancelled' — the UI shows "cancelled" and zero credits were
  // meant to be spent, but the scheduler has already claimed the job and executeSendJob
  // is (or is about to start) actively dispatching and charging credits underneath it.
  // Wrapping the read-check-write in the same kind of transaction the scheduler uses
  // makes this a real compare-and-set: whichever side's transaction commits first wins
  // the 'scheduled' status atomically, and the loser sees a status that is no longer
  // 'scheduled' and fails cleanly instead of overwriting an in-flight dispatch.
  let jobData: FirebaseFirestore.DocumentData;
  try {
    jobData = await db.runTransaction(async (txn) => {
      const freshDoc = await txn.get(jobRef);
      if (!freshDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Send job not found.');
      }
      const data = freshDoc.data()!;
      if (data.status !== 'scheduled') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Cannot cancel a send job with status "${data.status}". Only scheduled jobs can be cancelled ` +
            '(it may have already started dispatching).'
        );
      }
      txn.update(jobRef, {
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return data;
    });
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('internal', 'Failed to cancel send job.');
  }

  // Revert release status to Ready if it was set to Scheduled
  const releaseRef = db
    .collection('orgs')
    .doc(orgId)
    .collection('releases')
    .doc(jobData.releaseId);

  const releaseDoc = await releaseRef.get();
  if (releaseDoc.exists && releaseDoc.data()?.status === 'Scheduled') {
    await releaseRef.update({ status: 'Ready' });
  }

  console.log(`Send job ${sendJobId} cancelled by user ${context.auth.uid}`);
  return { success: true };
});

/**
 * QA fix (H2): validating callable Cloud Function for creating a Send Job.
 *
 * Previously the client wrote sendJobs documents directly (firestore.rules allowed
 * any team member to create/update/delete them) and processSendJob only checked
 * that the referenced release existed — nothing verified the release was approved,
 * validated the shape of the request, or confirmed the caller had actually seen and
 * accepted the Smart Distribution recipient count/credit cost before a billable job
 * was created. This callable is now the *only* supported way to create a sendJob;
 * firestore.rules denies direct client writes to the collection (see rule below).
 *
 * Mirrors the exact fields the client previously wrote directly in
 * send-release-dialog.tsx, but every value is re-validated/recomputed server-side
 * rather than trusted from the client payload.
 */
export const createSendJob = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in to send a release.');
  }

  const { orgId, releaseId, outletListIds, sendMode, scheduledAt, includeSmartDistributionRecommendations, confirmedSmartDistributionSelection, excludedRecipientRefs } = data || {};

  // --- Shape validation ---
  if (!orgId || typeof orgId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');
  }
  if (!releaseId || typeof releaseId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'releaseId is required.');
  }
  if (!Array.isArray(outletListIds) || outletListIds.length === 0 || outletListIds.some((id: any) => typeof id !== 'string' || !id)) {
    throw new functions.https.HttpsError('invalid-argument', 'outletListIds must be a non-empty array of outlet list IDs.');
  }
  if (sendMode !== 'now' && sendMode !== 'scheduled') {
    throw new functions.https.HttpsError('invalid-argument', "sendMode must be 'now' or 'scheduled'.");
  }
  const exclusions = parseExcludedRecipientRefs(excludedRecipientRefs, orgId, outletListIds);
  if (!exclusions.ok) {
    throw new functions.https.HttpsError('invalid-argument', exclusions.error);
  }
  let scheduledDate: Date | null = null;
  if (sendMode === 'scheduled') {
    if (!scheduledAt || typeof scheduledAt !== 'number') {
      throw new functions.https.HttpsError('invalid-argument', 'scheduledAt (epoch millis) is required for a scheduled send.');
    }
    scheduledDate = new Date(scheduledAt);
    if (scheduledDate.getTime() < Date.now() + 5 * 60 * 1000) {
      throw new functions.https.HttpsError('failed-precondition', 'Scheduled time must be at least 5 minutes in the future.');
    }
  }

  // --- Authorization: caller must belong to this org ---
  const userDoc = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'You do not belong to this organization.');
  }

  // --- Release must exist and belong to this org ---
  const releaseRef = db.collection('orgs').doc(orgId).collection('releases').doc(releaseId);
  const releaseDoc = await releaseRef.get();
  if (!releaseDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Release not found.');
  }
  const release = releaseDoc.data()!;

  // --- Outlet lists must exist and belong to this org (ownership/shape check) ---
  const listDocs = await Promise.all(
    outletListIds.map((id: string) => db.collection('orgs').doc(orgId).collection('outletLists').doc(id).get())
  );
  const missingListIds = listDocs.filter((d) => !d.exists).map((d) => d.id);
  if (missingListIds.length > 0) {
    throw new functions.https.HttpsError('invalid-argument', `Outlet list(s) not found: ${missingListIds.join(', ')}`);
  }

  const wantsSmartDistribution = includeSmartDistributionRecommendations === true;

  // --- Smart Distribution gating: release must be approved, and the caller must have
  //     explicitly confirmed the recipient count/credit cost (see H3 fix in the send
  //     dialog) — this cannot be inferred from the checkbox state alone, since a
  //     malicious or buggy client could otherwise send that flag without the user ever
  //     seeing the confirmation step. ---
  //
  // Approval is an optional, org-level review step (see approvalWorkflowEnabled in
  // Settings) — mirrors the same org-level gate used in recommendations.ts and in the
  // frontend's SendReleaseDialog/RecommendationList. Orgs that haven't enabled it should
  // not be blocked here: previously this checked release.approvalStatus unconditionally,
  // so any org without the approval workflow turned on (whose releases never get an
  // approvalStatus at all) had every Smart Distribution send rejected server-side with
  // no warning in the UI, since the client's approvalBlocked gate was already scoped to
  // approvalWorkflowEnabled and never caught this case.
  if (wantsSmartDistribution) {
    const orgSnap = await db.collection('orgs').doc(orgId).get();
    const approvalRequired = orgSnap.exists && orgSnap.data()?.approvalWorkflowEnabled === true;
    if (approvalRequired && release.approvalStatus !== 'approved') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This release must be approved before Press Pilot network recipients can be included.'
      );
    }
    // Confirmation is only required when the send would actually include a billable
    // Press Pilot network contact — mirrors the same networkCount > 0 condition that
    // gates the frontend's confirmation step (smartDistributionConfirmationNeeded in
    // send-release-dialog.tsx). Previously this was enforced whenever ANY Smart
    // Distribution contacts were requested, including sends made up entirely of free,
    // customer-owned recommendations (source: 'customer_contact') — the client never
    // shows a confirmation step (and so never sets this flag) when there is nothing
    // billable to confirm, so those sends were always rejected here.
    const recommendationsSnap = await db
      .collection('orgs')
      .doc(orgId)
      .collection('recommendationSnapshots')
      .where('storyId', '==', releaseId)
      .where('decision', '==', 'included')
      .get();
    const networkContactCount = recommendationsSnap.docs.filter(
      (d) => d.data().source === 'network_contact'
    ).length;

    if (networkContactCount > 0 && confirmedSmartDistributionSelection !== true) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Press Pilot network recipients must be explicitly confirmed before sending.'
      );
    }
  }

  // --- Count recipients server-side; never trust a client-supplied total. Excluded
  //     recipients are only counted out if they actually exist in a selected list. ---
  let totalRecipients = 0;
  let excludedCount = 0;
  const excludedSet = new Set(exclusions.refs);
  for (const listId of outletListIds) {
    const recipientsSnap = await db
      .collection('orgs')
      .doc(orgId)
      .collection('outletLists')
      .doc(listId)
      .collection('recipients')
      .get();
    for (const recipientDoc of recipientsSnap.docs) {
      if (excludedSet.has(recipientDoc.ref.path)) excludedCount++;
      else totalRecipients++;
    }
  }
  if (totalRecipients === 0 && excludedCount === 0) {
    throw new functions.https.HttpsError('failed-precondition', 'The selected lists have no recipients.');
  }
  if (totalRecipients === 0 && !wantsSmartDistribution) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Every recipient in the selected lists has been excluded. Tick at least one contact to send.'
    );
  }

  const status = sendMode === 'scheduled' ? 'scheduled' : 'pending';
  const jobData: Record<string, any> = {
    orgId,
    releaseId,
    outletListIds,
    status,
    totalRecipients,
    sentCount: 0,
    failedCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: context.auth.uid,
    includeSmartDistributionRecommendations: wantsSmartDistribution,
  };
  if (exclusions.refs.length > 0) {
    jobData.excludedRecipientRefs = exclusions.refs;
    jobData.excludedCount = excludedCount;
  }
  if (sendMode === 'scheduled') {
    jobData.scheduledAt = admin.firestore.Timestamp.fromDate(scheduledDate!);
  }

  const jobRef = await db.collection('orgs').doc(orgId).collection('sendJobs').add(jobData);

  if (sendMode === 'scheduled') {
    await releaseRef.update({ status: 'Scheduled', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  } else {
    await releaseRef.update({
      status: 'Sent',
      sends: (release.sends || 0) + totalRecipients,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  console.log(`Send job ${jobRef.id} created by ${context.auth.uid} for release ${releaseId} (${totalRecipients} recipients, ${excludedCount} excluded, mode=${sendMode})`);

  return { success: true, sendJobId: jobRef.id, totalRecipients, excludedCount };
});

/**
 * Send email to a recipient using SendGrid
 *
 * QA fix (Low): accepts an optional `logLabel` used in place of the recipient's real
 * email in this function's own log lines and in sendWithRetry's retry/exhaustion
 * logs. Callers dispatching to a Press Pilot network contact should pass a
 * non-identifying label (e.g. a sendJobRecipientId) so that contact's raw email
 * never appears in ordinary Cloud Function logs outside the superadmin audit trail;
 * callers sending to a customer-owned contact can omit it, since that address is
 * already visible to its own org.
 */
async function sendEmail(
  recipient: any,
  release: any,
  orgId: string,
  org: any,
  sendJobContext?: { sendJobId: string; sendJobRecipientId: string },
  logLabel?: string
) {
  const displayTarget = logLabel || recipient.email;
  if (!sendgridApiKey) {
    console.log(`[MOCK] Would send email to ${displayTarget}`);
    console.log(`Subject: ${release.headline}`);
    return;
  }

  // Configure from email - must be a SendGrid verified sender
  const fromEmail = functions.config().sendgrid?.from_email ||
                    process.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) {
    console.error('[EMAIL] SENDGRID_FROM_EMAIL is not configured. Cannot send email.');
    throw new Error('Missing sendgrid.from_email config. Set it with: firebase functions:config:set sendgrid.from_email="you@yourdomain.com"');
  }

  const msg: any = {
    to: recipient.email,
    // Journalists see the org's name as the sender and replies route to the
    // org's press contact. See ./sender for why `from.email` stays platform-owned.
    ...orgSender(org, fromEmail, { fallbackName: 'Press Release' }),
    subject: release.headline,
    text: formatEmailText(release, org),
    html: formatEmailHtml(release, recipient, org),
    customArgs: {
      orgId: orgId,
      releaseId: release.id || '',
      ...(sendJobContext
        ? { sendJobId: sendJobContext.sendJobId, sendJobRecipientId: sendJobContext.sendJobRecipientId }
        : {}),
    },
    trackingSettings: {
      clickTracking: {
        enable: true,
      },
      openTracking: {
        enable: true,
      },
    },
  };

  await sendWithRetry(msg, 3, logLabel);
  console.log(`Email sent successfully to ${displayTarget}`);
}

/**
 * Cloud Function to clean up release images from Storage
 * Triggered when a release document is deleted
 */
export const cleanupReleaseImages = functions.firestore
  .document('orgs/{orgId}/releases/{releaseId}')
  .onDelete(async (snap, context) => {
    const { orgId, releaseId } = context.params;
    const release = snap.data();

    // Check if the release had an image
    if (!release.imageStoragePath) {
      console.log('No image to clean up');
      return;
    }

    // Validate the storage path belongs to this org/release
    const expectedPrefix = `orgs/${orgId}/releases/${releaseId}`;
    if (!release.imageStoragePath.startsWith(expectedPrefix)) {
      console.error(`Invalid image path: ${release.imageStoragePath} (expected prefix: ${expectedPrefix})`);
      return;
    }

    try {
      const storage = getStorage();
      const bucket = storage.bucket();
      const file = bucket.file(release.imageStoragePath);

      // Delete the file
      await file.delete();
      console.log(`Successfully deleted image: ${release.imageStoragePath}`);
    } catch (error: any) {
      // If the file doesn't exist (404), that's fine - it's already deleted
      if (error.code === 404) {
        console.log(`Image already deleted: ${release.imageStoragePath}`);
      } else {
        console.error('Error deleting image:', error);
        // Don't throw - we don't want to fail the release deletion if image cleanup fails
      }
    }
  });


/**
 * Cloud Function to clean up submission images from Storage
 * Triggered when a submission status is changed to archived
 */
export const cleanupArchivedSubmissionImages = functions.firestore
  .document('orgs/{orgId}/submissions/{submissionId}')
  .onUpdate(async (change, context) => {
    const { orgId, submissionId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    // Only fire when status changes TO archived
    if (before.status === 'archived' || after.status !== 'archived') {
      return;
    }

    console.log(`Cleaning up images for archived submission ${submissionId} in org ${orgId}`);

    try {
      const storage = getStorage();
      const bucket = storage.bucket();
      const prefix = `orgs/${orgId}/submissions/${submissionId}/`;

      const [files] = await bucket.getFiles({ prefix });

      if (files.length === 0) {
        console.log(`No files found at ${prefix}`);
        return;
      }

      // Releases can reference a submission's assets directly (the video picker and
      // the image picker both point a release at the submission's own storage path
      // rather than copying the file). Archiving is what you do AFTER using a
      // submission in a release, so a blind prefix wipe would silently break the
      // download link in a press release that has already gone out to journalists.
      // Anything still referenced by a release is therefore kept.
      const referencedPaths = new Set<string>();
      try {
        const releasesSnap = await admin
          .firestore()
          .collection('orgs')
          .doc(orgId)
          .collection('releases')
          .get();

        releasesSnap.forEach((doc) => {
          const data = doc.data();
          if (data.videoStoragePath) referencedPaths.add(data.videoStoragePath);
          if (data.imageStoragePath) referencedPaths.add(data.imageStoragePath);
        });
      } catch (err: any) {
        // If we cannot establish what is still in use, deleting is the unsafe
        // choice: keeping an orphaned file costs pennies, breaking a live press
        // release costs credibility. Bail out and leave everything in place.
        console.warn(
          `Could not check release references for ${submissionId}; skipping cleanup:`,
          err?.message || err
        );
        return;
      }

      const deletable = files.filter((file) => !referencedPaths.has(file.name));
      const keptCount = files.length - deletable.length;

      if (deletable.length === 0) {
        console.log(`All ${files.length} file(s) at ${prefix} are still used by releases; nothing deleted`);
        return;
      }

      await Promise.all(deletable.map((file) => file.delete()));
      console.log(
        `Deleted ${deletable.length} file(s) from ${prefix}` +
          (keptCount > 0 ? ` (kept ${keptCount} still referenced by a release)` : '')
      );
    } catch (error: any) {
      // Best-effort: log warning but do not throw
      console.warn(`Failed to clean up images for submission ${submissionId}:`, error?.message || error);
    }
  });
// Export user management functions
export * from './user-management';
export * from './debug-user';
export * from './recreate-user';

// Export partner invite functions
export * from './partner-invites';

// Export submission analysis functions
export * from './submission-analysis';
export * from './video-transcription';

// Export media request functions
export * from './media-requests';

// Export story escalation (federated tenants — push a daughter org's story into its parent's inbox)
export * from './story-escalation';
export * from './org-rollup';
export * from './child-org-provisioning';
export * from './theme-trends';
export * from './media-taxonomy';
export * from './media-network';
export * from './credits';
export * from './recommendations';

// Export super-admin functions
export * from './super-admin';

// Export billing / self-serve signup functions
export * from './billing';

// Export partner notification functions
export * from './partner-notifications';

// Export org-user notification functions
export * from './org-user-notifications';

// Export approval notification functions
export * from './approval-notifications';

// Export demo functions
export * from './demo';

// Export password reset functions
export * from './password-reset';
export * from './support';
