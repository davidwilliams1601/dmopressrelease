import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
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

// Escape HTML special characters to prevent XSS in email templates
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

    try {
      // Update status to processing
      await snap.ref.update({
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
              console.error(`Failed to send to ${recipient.email}:`, error);
              failedCount++;
            }
          })
        );

        // Update progress periodically
        if (i + BATCH_SIZE < validRecipients.length) {
          await snap.ref.update({
            sentCount,
            failedCount,
          });
        }
      }

      // Update send job with results
      await snap.ref.update({
        status: 'completed',
        sentCount,
        failedCount,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Send job completed: ${sentCount} sent, ${failedCount} failed`);
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

  const msg = {
    to: recipient.email,
    from: {
      email: fromEmail,
      name: org?.name || 'Press Release',
    },
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

  await sgMail.send(msg);
  console.log(`Email sent successfully to ${recipient.email}`);
}

/**
 * Format release content as HTML email
 */
function formatEmailHtml(release: any, recipient: any, org?: any): string {
  const headline = escapeHtml(release.headline || '');
  const bodyCopy = escapeHtml(release.bodyCopy || '');
  const recipientName = escapeHtml(recipient.name || '');
  const recipientEmail = escapeHtml(recipient.email || '');
  const recipientOutlet = escapeHtml(recipient.outlet || '');
  const orgName = escapeHtml(org?.name || '');
  const boilerplate = escapeHtml(org?.boilerplate || '');

  // Only include image if URL is valid
  const imageHtml = (release.imageUrl && isValidUrl(release.imageUrl))
    ? `<div style="margin-bottom: 20px;">
        <img src="${escapeHtml(release.imageUrl)}" alt="${headline}"
             style="max-width: 100%; height: auto; border-radius: 8px; display: block;" />
      </div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${headline}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
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

// Export user management functions
export * from './user-management';
export * from './debug-user';
export * from './recreate-user';

// Export partner invite functions
export * from './partner-invites';

// Export submission analysis functions
export * from './submission-analysis';
