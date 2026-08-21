import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { escapeHtml } from './html-utils';

const db = admin.firestore();

const SUPPORT_INBOX = 'david@press-pilot.com';

function getSendgridKey(): string | null {
  return functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY || null;
}

function getFromEmail(): string | null {
  return functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL || null;
}

/**
 * Support ticket submission from the in-app "Help & Support" button (both the
 * team dashboard sidebar and the partner-portal sidebar). Requires auth — no
 * public entry point, since it's only ever triggered from a signed-in nav item.
 *
 * Fires a single email to the Press Pilot support inbox with the reporter's
 * name/email/org context, and sets Reply-To to the reporter's own email so
 * David can reply straight from his inbox without any ticket-tracking system.
 */
export const submitSupportTicket = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const subject: string = (data?.subject || '').trim();
  const message: string = (data?.message || '').trim();
  if (!subject || !message) {
    throw new functions.https.HttpsError('invalid-argument', 'Subject and message are required.');
  }
  if (subject.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Subject is too long.');
  }
  if (message.length > 5000) {
    throw new functions.https.HttpsError('invalid-argument', 'Message is too long (5000 character limit).');
  }

  const uid = context.auth.uid;
  const authEmail = context.auth.token.email as string | undefined;
  const orgId = context.auth.token.orgId as string | undefined;

  // Best-effort context lookups — a support ticket should still send even if
  // an org/user doc lookup fails or the account predates one of these fields.
  let reporterName = authEmail || 'Unknown user';
  let orgName = orgId || 'Unknown organisation';
  try {
    if (orgId) {
      const [userSnap, orgSnap] = await Promise.all([
        db.collection('orgs').doc(orgId).collection('users').doc(uid).get(),
        db.collection('orgs').doc(orgId).get(),
      ]);
      reporterName = userSnap.data()?.name || reporterName;
      orgName = orgSnap.data()?.name || orgName;
    }
  } catch (err) {
    console.warn('submitSupportTicket: context lookup failed, sending with partial info', err);
  }

  const key = getSendgridKey();
  const fromEmail = getFromEmail();
  if (!key || !fromEmail) {
    console.error('submitSupportTicket: SendGrid not configured (missing key or from_email)');
    throw new functions.https.HttpsError('internal', 'Support email is not configured. Please try again later.');
  }
  sgMail.setApiKey(key);

  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message);
  const safeName = escapeHtml(reporterName);
  const safeOrg = escapeHtml(orgName);
  const safeEmail = authEmail ? escapeHtml(authEmail) : 'unknown';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1a1a1a;">New support ticket</h2>
      </div>
      <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #e5e7eb;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#666;width:120px;vertical-align:top;">From</td><td style="padding:6px 0;"><strong>${safeName}</strong> (${safeEmail})</td></tr>
          <tr><td style="padding:6px 0;color:#666;vertical-align:top;">Organisation</td><td style="padding:6px 0;">${safeOrg}</td></tr>
          <tr><td style="padding:6px 0;color:#666;vertical-align:top;">Subject</td><td style="padding:6px 0;">${safeSubject}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
        <p style="white-space:pre-wrap;margin:0;">${safeMessage}</p>
      </div>
    </body>
    </html>
  `;

  await sgMail.send({
    to: SUPPORT_INBOX,
    from: { email: fromEmail, name: 'PressPilot Support' },
    ...(authEmail ? { replyTo: authEmail } : {}),
    subject: `[Support] ${subject} — ${orgName}`,
    text: `From: ${reporterName} (${authEmail || 'unknown'})\nOrganisation: ${orgName}\nSubject: ${subject}\n\n${message}`,
    html,
  });

  console.log(`Support ticket sent to ${SUPPORT_INBOX} from ${authEmail || uid} (org ${orgId || 'none'})`);
  return { success: true };
});
