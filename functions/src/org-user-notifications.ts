import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { escapeHtml } from './html-utils';
import { emailWrapper, emailButton } from './email-branding';

const db = admin.firestore();

function getSendGridKey(): string | null {
  return functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY || null;
}

function getFromEmail(): string | null {
  return functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL || null;
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
      const orgData = orgDoc.data()!;
      const org = { name: orgData.name || 'Your organisation', branding: orgData.branding, tier: orgData.tier };

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
        ${emailButton(org, detailUrl, 'Review Submission →')}
      `;

      sgMail.setApiKey(key);

      await Promise.all(
        recipients.map((r) =>
          sgMail.send({
            to: r.email,
            from: { email: fromEmail, name: org.name },
            subject: `New submission from ${submission.partnerName || 'a partner'} — ${submission.title || 'Untitled'}`,
            html: emailWrapper(org, 'New partner submission', bodyHtml),
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
      const orgData = orgDoc.data()!;
      const org = { name: orgData.name || 'Your organisation', branding: orgData.branding, tier: orgData.tier };

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
        ${emailButton(org, detailUrl, 'View Request →')}
      `;

      sgMail.setApiKey(key);

      await Promise.all(
        recipients.map((r) =>
          sgMail.send({
            to: r.email,
            from: { email: fromEmail, name: org.name },
            subject: `New media request from ${request.name || 'a journalist'}, ${request.outlet || ''}`,
            html: emailWrapper(org, 'New media request', bodyHtml),
            text: `New media request from ${request.name} at ${request.outlet}.\n\nStory angle: ${request.topic}${deadline ? `\nDeadline: ${request.deadline}` : ''}\n\nView it here: ${detailUrl}`,
          })
        )
      );

      console.log(`[onNewMediaRequest] Notified ${recipients.length} user(s) for request ${requestId}`);
    } catch (error: any) {
      console.error('[onNewMediaRequest] Error:', error.message);
    }
  });
