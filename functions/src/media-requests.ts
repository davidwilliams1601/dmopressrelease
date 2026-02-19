import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';

const db = admin.firestore();

// Simple email format validation (mirrors index.ts helper)
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
  const orgId: string = functions.config().org?.id || 'visit-kent';

  // 3. Rate limit: max 5 submissions from the same email in the last hour.
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

  // 4. Write to Firestore
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

  // 5. Send email notification to org's press contact (best-effort — don't fail the request)
  try {
    await sendNotificationEmail(orgId, requestData);
  } catch (err) {
    console.error('Failed to send notification email (non-fatal):', err);
  }

  return { success: true };
});

async function sendNotificationEmail(orgId: string, request: Record<string, any>) {
  const sendgridApiKey = functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY;
  if (!sendgridApiKey) {
    console.log('[MOCK] Would send story request notification email');
    return;
  }

  const fromEmail = functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) {
    console.warn('sendgrid.from_email not configured — skipping notification email');
    return;
  }

  // Fetch org to get pressContact.email
  const orgDoc = await db.collection('orgs').doc(orgId).get();
  const org = orgDoc.data();
  const toEmail = org?.pressContact?.email;
  if (!toEmail) {
    console.warn(`Org ${orgId} has no pressContact.email — skipping notification`);
    return;
  }

  sgMail.setApiKey(sendgridApiKey);

  const name = escapeHtml(request.name);
  const email = escapeHtml(request.email);
  const outlet = escapeHtml(request.outlet);
  const topic = escapeHtml(request.topic);
  const destinations = request.destinations ? escapeHtml(request.destinations) : null;
  const deadline = request.deadline ? escapeHtml(request.deadline) : null;
  const additionalInfo = request.additionalInfo ? escapeHtml(request.additionalInfo) : null;
  const orgName = escapeHtml(org?.name || 'Your Organisation');

  const optionalRows = [
    destinations ? `<tr><td style="padding:6px 0;color:#666;width:140px;vertical-align:top;">Destinations</td><td style="padding:6px 0;">${destinations}</td></tr>` : '',
    deadline ? `<tr><td style="padding:6px 0;color:#666;width:140px;vertical-align:top;">Deadline</td><td style="padding:6px 0;">${deadline}</td></tr>` : '',
    additionalInfo ? `<tr><td style="padding:6px 0;color:#666;width:140px;vertical-align:top;">Additional Info</td><td style="padding:6px 0;">${additionalInfo}</td></tr>` : '',
  ].join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1a1a1a;">New Story Request — ${orgName}</h2>
      </div>
      <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #e5e7eb;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#666;width:140px;vertical-align:top;">From</td><td style="padding:6px 0;"><strong>${name}</strong> (${email})</td></tr>
          <tr><td style="padding:6px 0;color:#666;vertical-align:top;">Publication</td><td style="padding:6px 0;">${outlet}</td></tr>
          <tr><td style="padding:6px 0;color:#666;vertical-align:top;">Story Angle</td><td style="padding:6px 0;">${topic}</td></tr>
          ${optionalRows}
        </table>
      </div>
      <p style="margin-top:20px;font-size:13px;color:#666;">
        Log in to PressPilot to view and manage this request.
      </p>
    </body>
    </html>
  `;

  await sgMail.send({
    to: toEmail,
    from: { email: fromEmail, name: orgName },
    subject: `New story request from ${request.name} (${request.outlet})`,
    text: `New story request from ${request.name} at ${request.outlet}.\n\nStory angle: ${request.topic}\n\nLog in to PressPilot to view details.`,
    html,
  });

  console.log(`Notification email sent to ${toEmail}`);
}
