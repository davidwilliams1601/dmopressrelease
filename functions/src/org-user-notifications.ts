import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';

const db = admin.firestore();

function getSendGridKey(): string | null {
  return functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY || null;
}

function getFromEmail(): string | null {
  return functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL || null;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

/**
 * Returns all Admin/User members of an org who have opted in to a given
 * notification type. Treats a missing notificationPrefs field as opted-in
 * (opt-out model — notify by default).
 */
async function getOptedInUsers(
  orgId: string,
  pref: 'partnerSubmissions' | 'mediaRequests'
): Promise<Array<{ name: string; email: string }>> {
  const snap = await db
    .collection('orgs')
    .doc(orgId)
    .collection('users')
    .where('role', 'in', ['Admin', 'User'])
    .get();

  return snap.docs
    .map((d) => d.data())
    .filter((u) => {
      // No prefs saved → opted in by default
      if (!u.notificationPrefs) return true;
      return u.notificationPrefs[pref] !== false;
    })
    .filter((u) => u.email)
    .map((u) => ({ name: u.name || 'Team member', email: u.email as string }));
}

function emailButton(href: string, label: string): string {
  return `<div style="margin:24px 0;">
    <a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">${label}</a>
  </div>`;
}

function emailWrapper(orgName: string, headerTitle: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#2563eb;padding:24px 32px;border-radius:8px 8px 0 0;">
    <p style="margin:0;color:rgba(255,255,255,0.8);font-size:13px;">${escapeHtml(orgName)}</p>
    <h1 style="margin:4px 0 0;color:#fff;font-size:20px;">${headerTitle}</h1>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 8px 8px;">
    ${body}
  </div>
  <div style="text-align:center;padding:20px;font-size:12px;color:#94a3b8;">
    Sent by ${escapeHtml(orgName)} via PressPilot &middot;
    <a href="${appUrl}/dashboard/settings" style="color:#94a3b8;">Manage notifications</a>
  </div>
</body>
</html>`;
}

/**
 * Firestore trigger: notify opted-in org users when a partner submits content.
 */
export const onNewPartnerSubmission = functions.firestore
  .document('orgs/{orgId}/submissions/{submissionId}')
  .onCreate(async (snap, context) => {
    const { orgId, submissionId } = context.params;
    const submission = snap.data();

    const key = getSendGridKey();
    const fromEmail = getFromEmail();
    if (!key || !fromEmail) {
      console.warn('[onNewPartnerSubmission] SendGrid not configured — skipping');
      return;
    }

    try {
      const orgDoc = await db.collection('orgs').doc(orgId).get();
      if (!orgDoc.exists) return;
      const orgName: string = orgDoc.data()!.name || 'Your organisation';

      const recipients = await getOptedInUsers(orgId, 'partnerSubmissions');
      if (recipients.length === 0) {
        console.log('[onNewPartnerSubmission] No opted-in users — skipping');
        return;
      }

      // Fetch tag names
      let tagLine = '';
      if (submission.tagIds?.length) {
        const tagDocs = await Promise.all(
          submission.tagIds.map((id: string) =>
            db.collection('orgs').doc(orgId).collection('tags').doc(id).get()
          )
        );
        const tagNames = tagDocs
          .filter((d) => d.exists)
          .map((d) => d.data()!.name as string);
        if (tagNames.length) tagLine = tagNames.join(', ');
      }

      const partnerName = escapeHtml(submission.partnerName || 'A partner');
      const title = escapeHtml(submission.title || 'Untitled');
      const detailUrl = `${appUrl}/dashboard/submissions/${submissionId}`;

      const bodyHtml = `
        <p style="margin-top:0;"><strong>${partnerName}</strong> has submitted new content for review.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:80px;vertical-align:top;">Title</td>
            <td style="padding:6px 0;font-weight:600;">${title}</td>
          </tr>
          ${tagLine ? `<tr>
            <td style="padding:6px 0;color:#64748b;vertical-align:top;">Tags</td>
            <td style="padding:6px 0;">${escapeHtml(tagLine)}</td>
          </tr>` : ''}
        </table>
        ${emailButton(detailUrl, 'Review Submission →')}
      `;

      sgMail.setApiKey(key);

      await Promise.all(
        recipients.map((r) =>
          sgMail.send({
            to: r.email,
            from: { email: fromEmail, name: orgName },
            subject: `New submission from ${submission.partnerName || 'a partner'} — ${submission.title || 'Untitled'}`,
            html: emailWrapper(orgName, 'New partner submission', bodyHtml),
            text: `${partnerName} has submitted "${submission.title}" for review.\n\n${tagLine ? `Tags: ${tagLine}\n\n` : ''}Review it here: ${detailUrl}`,
          })
        )
      );

      console.log(`[onNewPartnerSubmission] Notified ${recipients.length} user(s) for submission ${submissionId}`);
    } catch (error: any) {
      console.error('[onNewPartnerSubmission] Error:', error.message);
    }
  });

/**
 * Firestore trigger: notify opted-in org users when a journalist submits a media request.
 */
export const onNewMediaRequest = functions.firestore
  .document('orgs/{orgId}/mediaRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const { orgId, requestId } = context.params;
    const request = snap.data();

    const key = getSendGridKey();
    const fromEmail = getFromEmail();
    if (!key || !fromEmail) {
      console.warn('[onNewMediaRequest] SendGrid not configured — skipping');
      return;
    }

    try {
      const orgDoc = await db.collection('orgs').doc(orgId).get();
      if (!orgDoc.exists) return;
      const orgName: string = orgDoc.data()!.name || 'Your organisation';

      const recipients = await getOptedInUsers(orgId, 'mediaRequests');
      if (recipients.length === 0) {
        console.log('[onNewMediaRequest] No opted-in users — skipping');
        return;
      }

      const name = escapeHtml(request.name || '');
      const outlet = escapeHtml(request.outlet || '');
      const topic = escapeHtml(request.topic || '');
      const destinations = request.destinations ? escapeHtml(request.destinations) : null;
      const deadline = request.deadline ? escapeHtml(request.deadline) : null;
      const detailUrl = `${appUrl}/dashboard/media-requests/${requestId}`;

      const optionalRows = [
        destinations
          ? `<tr><td style="padding:6px 0;color:#64748b;width:100px;vertical-align:top;">Destinations</td><td style="padding:6px 0;">${destinations}</td></tr>`
          : '',
        deadline
          ? `<tr><td style="padding:6px 0;color:#64748b;vertical-align:top;">Deadline</td><td style="padding:6px 0;font-weight:600;color:#dc2626;">${deadline}</td></tr>`
          : '',
      ].join('');

      const bodyHtml = `
        <p style="margin-top:0;">A journalist has submitted a story request.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:100px;vertical-align:top;">From</td>
            <td style="padding:6px 0;"><strong>${name}</strong>, ${outlet}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;vertical-align:top;">Story angle</td>
            <td style="padding:6px 0;">${topic}</td>
          </tr>
          ${optionalRows}
        </table>
        <p style="font-size:13px;color:#64748b;margin:0 0 16px;">Journalists often work to tight deadlines — respond promptly.</p>
        ${emailButton(detailUrl, 'View Request →')}
      `;

      sgMail.setApiKey(key);

      await Promise.all(
        recipients.map((r) =>
          sgMail.send({
            to: r.email,
            from: { email: fromEmail, name: orgName },
            subject: `New media request from ${request.name || 'a journalist'}, ${request.outlet || ''}`,
            html: emailWrapper(orgName, 'New media request', bodyHtml),
            text: `New media request from ${request.name} at ${request.outlet}.\n\nStory angle: ${request.topic}${deadline ? `\nDeadline: ${request.deadline}` : ''}\n\nView it here: ${detailUrl}`,
          })
        )
      );

      console.log(`[onNewMediaRequest] Notified ${recipients.length} user(s) for request ${requestId}`);
    } catch (error: any) {
      console.error('[onNewMediaRequest] Error:', error.message);
    }
  });
