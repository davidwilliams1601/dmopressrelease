import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { escapeHtml } from './html-utils';
import { sendWithRetry } from './sendgrid-retry';
import { resolveOrgColors } from './brand-utils';
import { emailFooter } from './email-branding';
import { getStorage } from 'firebase-admin/storage';
import { resolveSmartDistributionRecipientsForSend } from './send-distribution';
import {
  reserveSmartDistributionCredit,
  finalizeSmartDistributionCreditReservation,
  releaseSmartDistributionCreditReservation,
} from './credits';

admin.initializeApp();

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


/**
 * Convert bare http/https URLs in already-escaped HTML text into clickable anchor tags.
 * Must be called AFTER escapeHtml so that & in query strings is already &amp; (valid in href).
 */
function linkifyHtml(escapedText: string, linkColor?: string): string {
  const color = linkColor || '#2563eb';
  return escapedText.replace(
    /https?:\/\/[^\s<>"']+/g,
    (url) => `<a href="${url}" style="color: ${color};">${url}</a>`
  );
}

// Validate that a URL is safe for use in email templates
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
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
  networkContactId?: string;
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
      seenIdentities.add(normaliseIdentity(data.name, data.email));
    });
  }

  // Filter to valid emails only
  const validRecipients = recipients.filter((r) => r.email && isValidEmail(r.email));
  const skippedCount = recipients.length - validRecipients.length;
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
    networkContactId?: string;
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
        networkContactId: entry.networkContactId,
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
        networkContactId: entry.networkContactId,
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
      ...(entry.networkContactId ? { networkContactId: entry.networkContactId } : {}),
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
      ...(entry.networkContactId ? { networkContactId: entry.networkContactId } : {}),
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
          entry.source === 'smart_distribution_recommendation' && !!entry.networkContactId;
        // QA fix (2026-08-20): reserve the credit BEFORE sending, not after. Previously
        // the code sent first and debited afterwards, so a losing balance race meant a
        // network contact could be emailed for free (see credits.ts reservation system
        // for the full rationale).
        let reservation: { reservationId: string; reserved: boolean } | null = null;

        try {
          if (isNetworkContact) {
            reservation = await reserveSmartDistributionCredit({
              orgId,
              campaignId: jobId,
              networkContactId: entry.networkContactId!,
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

          await sendEmail(
            { name: entry.name, email: entry.email, outlet: entry.outlet },
            release,
            orgId,
            org,
            { sendJobId: jobId, sendJobRecipientId: entry.sendJobRecipientId }
          );
          sentCount++;

          if (isNetworkContact && reservation) {
            const debit = await finalizeSmartDistributionCreditReservation({
              orgId,
              campaignId: jobId,
              networkContactId: entry.networkContactId!,
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
          console.error(`Failed to send to ${entry.email} (after retries):`, error);
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

  const jobDoc = await jobRef.get();
  if (!jobDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Send job not found.');
  }

  const jobData = jobDoc.data()!;
  if (jobData.status !== 'scheduled') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Cannot cancel a send job with status "${jobData.status}". Only scheduled jobs can be cancelled.`
    );
  }

  // Cancel the send job
  await jobRef.update({
    status: 'cancelled',
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
  });

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
 * Send email to a recipient using SendGrid
 */
async function sendEmail(
  recipient: any,
  release: any,
  orgId: string,
  org: any,
  sendJobContext?: { sendJobId: string; sendJobRecipientId: string }
) {
  if (!sendgridApiKey) {
    console.log(`[MOCK] Would send email to ${recipient.email}`);
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

  const replyToEmail = org?.pressContact?.email;

  const msg: any = {
    to: recipient.email,
    from: {
      email: fromEmail,
      name: org?.name || 'Press Release',
    },
    ...(replyToEmail ? { replyTo: { email: replyToEmail, name: org?.name || '' } } : {}),
    subject: release.headline,
    text: release.bodyCopy || 'No content',
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

  await sendWithRetry(msg);
  console.log(`Email sent successfully to ${recipient.email}`);
}

/**
 * Format release content as HTML email
 */
function formatEmailHtml(release: any, recipient: any, org?: any): string {
  const colors = resolveOrgColors(org?.branding);
  const headline = escapeHtml(release.headline || '');
  const bodyCopy = linkifyHtml(escapeHtml(release.bodyCopy || ''), colors.primary);
  const recipientName = escapeHtml(recipient.name || '');
  const recipientEmail = escapeHtml(recipient.email || '');
  const recipientOutlet = escapeHtml(recipient.outlet || '');
  const orgName = escapeHtml(org?.name || '');
  const boilerplate = escapeHtml(org?.boilerplate || '');
  const logoHtml = org?.branding?.logoUrl
    ? `<img src="${org.branding.logoUrl}" alt="${orgName}" height="32" style="height:32px;width:auto;margin-bottom:12px;display:block;" />`
    : '';

  // Only include image if URL is valid
  const imageHtml = (release.imageUrl && isValidUrl(release.imageUrl))
    ? `<div style="margin-bottom: 20px;">
        <img src="${escapeHtml(release.imageUrl)}" alt="${headline}"
             style="max-width: 100%; height: auto; border-radius: 8px; display: block;" />
      </div>`
    : '';

  const orgLike = { name: org?.name, branding: org?.branding, tier: org?.tier };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${headline}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${colors.primaryLight}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        ${logoHtml}
        <h1 style="margin: 0; color: #1a1a1a; font-size: 24px;">${headline}</h1>
      </div>

      <div style="background-color: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
        ${imageHtml}

        <div style="white-space: pre-wrap; margin-bottom: 20px;">
          ${bodyCopy}
        </div>

        ${boilerplate ? `
          <div style="border-top: 2px solid #e5e7eb; padding-top: 20px; margin-top: 20px; font-size: 14px; color: #666;">
            <strong>About ${orgName}:</strong><br>
            ${boilerplate}
          </div>
        ` : ''}
      </div>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; text-align: center;">
        <p>This email was sent to ${recipientName} (${recipientEmail}) at ${recipientOutlet}.</p>
        <p>If you no longer wish to receive these emails, please contact us.</p>
      </div>
      ${emailFooter(orgLike, { showManageLink: false })}
    </body>
    </html>
  `;
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

      await Promise.all(files.map((file) => file.delete()));
      console.log(`Deleted ${files.length} file(s) from ${prefix}`);
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
