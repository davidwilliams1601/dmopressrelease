import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as sgMail from '@sendgrid/mail';

admin.initializeApp();

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

/**
 * Cloud Function to process send jobs
 * Triggered when a new sendJob document is created
 */
export const processSendJob = functions.firestore
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

      const release = releaseDoc.data();

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

      console.log(`Sending to ${recipients.length} recipients`);

      let sentCount = 0;
      let failedCount = 0;

      // Send emails to each recipient
      for (const recipient of recipients) {
        try {
          await sendEmail(recipient, release, orgId);
          sentCount++;
        } catch (error) {
          console.error(`Failed to send to ${recipient.email}:`, error);
          failedCount++;
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
async function sendEmail(recipient: any, release: any, orgId: string) {
  if (!sendgridApiKey) {
    console.log(`[MOCK] Would send email to ${recipient.email}`);
    console.log(`Subject: ${release.headline}`);
    return;
  }

  // Fetch organization data for sender info
  const orgDoc = await db.collection('orgs').doc(orgId).get();
  const org = orgDoc.data();

  // Configure from email - use your verified sender
  const fromEmail = functions.config().sendgrid?.from_email ||
                    process.env.SENDGRID_FROM_EMAIL ||
                    'noreply@yourdomain.com';

  const msg = {
    to: recipient.email,
    from: {
      email: fromEmail,
      name: org?.name || 'Press Release',
    },
    subject: release.headline,
    text: release.bodyCopy || 'No content',
    html: formatEmailHtml(release, recipient, org),
  };

  await sgMail.send(msg);
  console.log(`Email sent successfully to ${recipient.email}`);
}

/**
 * Format release content as HTML email
 */
function formatEmailHtml(release: any, recipient: any, org?: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${release.headline}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="margin: 0; color: #1a1a1a; font-size: 24px;">${release.headline}</h1>
      </div>

      <div style="background-color: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
        <div style="white-space: pre-wrap; margin-bottom: 20px;">
          ${release.bodyCopy || ''}
        </div>

        ${org?.boilerplate ? `
          <div style="border-top: 2px solid #e5e7eb; padding-top: 20px; margin-top: 20px; font-size: 14px; color: #666;">
            <strong>About ${org.name}:</strong><br>
            ${org.boilerplate}
          </div>
        ` : ''}
      </div>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; text-align: center;">
        <p>This email was sent to ${recipient.name} (${recipient.email}) at ${recipient.outlet}.</p>
        <p>If you no longer wish to receive these emails, please contact us.</p>
      </div>
    </body>
    </html>
  `;
}
