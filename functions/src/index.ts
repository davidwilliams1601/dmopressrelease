import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { escapeHtml } from './html-utils';
import { sendWithRetry } from './sendgrid-retry';
import { resolveOrgColors } from './brand-utils';
import { emailFooter } from './email-branding';
import { getStorage } from 'firebase-admin/storage';

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

/**
 * Core sending logic extracted for reuse by both immediate and scheduled sends.
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

  // Fetch all recipients from selected outlet lists
  const recipients: any[] = [];
  for (const listId of sendJob.outletListIds) {
    const recipientsSnapshot = await db
      .collection('orgs')
      .doc(orgId)
      .collection('outletLists')
      .doc(listId)
      .collection('recipients')
      .get();

    recipientsSnapshot.docs.forEach((doc) => {
      recipients.push({ id: doc.id, ...doc.data() });
    });
  }

  // Filter to valid emails only
  const validRecipients = recipients.filter((r) => r.email && isValidEmail(r.email));
  const skippedCount = recipients.length - validRecipients.length;
  if (skippedCount > 0) {
    console.warn(`Skipped ${skippedCount} recipients with invalid emails`);
  }

  console.log(`Sending to ${validRecipients.length} recipients`);

  let sentCount = 0;
  let failedCount = 0;
  const failedRecipients: string[] = [];

  // Send emails in batches to avoid timeout
  const BATCH_SIZE = 50;
  for (let i = 0; i < validRecipients.length; i += BATCH_SIZE) {
    const batch = validRecipients.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (recipient) => {
        try {
          await sendEmail(recipient, release, orgId, org);
          sentCount++;
        } catch (error) {
          console.error(`Failed to send to ${recipient.email} (after retries):`, error);
          failedCount++;
          failedRecipients.push(recipient.email);
        }
      })
    );

    // Update progress periodically
    if (i + BATCH_SIZE < validRecipients.length) {
      await jobRef.update({
        sentCount,
        failedCount,
      });
    }
  }

  // Update send job with results
  await jobRef.update({
    status: 'completed',
    sentCount,
    failedCount,
    ...(failedRecipients.length > 0 ? { failedRecipients } : {}),
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
async function sendEmail(recipient: any, release: any, orgId: string, org: any) {
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

// Export super-admin functions
export * from './super-admin';

// Export partner notification functions
export * from './partner-notifications';

// Export org-user notification functions
export * from './org-user-notifications';

// Export approval notification functions
export * from './approval-notifications';

// Export demo functions
export * from './demo';
