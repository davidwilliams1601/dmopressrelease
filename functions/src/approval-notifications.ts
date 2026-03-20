import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { escapeHtml } from './html-utils';

const db = admin.firestore();

function getSendGridKey(): string | null {
  return functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY || null;
}

function getFromEmail(): string | null {
  return functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL || null;
}


const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

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
 * Fires when a release's approvalStatus transitions to 'pending'.
 * Sends a review-request email to the approver.
 */
export const onApprovalRequested = functions.firestore
  .document('orgs/{orgId}/releases/{releaseId}')
  .onUpdate(async (change, context) => {
    const { orgId, releaseId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    // Only fire when transitioning into pending
    if (before.approvalStatus === 'pending' || after.approvalStatus !== 'pending') return;

    // Guard against duplicate sends
    if (after.approvalNotifiedAt) return;

    const key = getSendGridKey();
    const fromEmail = getFromEmail();
    if (!key || !fromEmail) {
      console.warn('[onApprovalRequested] SendGrid not configured — skipping');
      return;
    }

    const approverEmail: string | undefined = after.approverEmail;
    if (!approverEmail) {
      console.warn('[onApprovalRequested] No approverEmail on release — skipping');
      return;
    }

    try {
      const orgDoc = await db.collection('orgs').doc(orgId).get();
      const orgName: string = orgDoc.exists ? (orgDoc.data()!.name || 'Your organisation') : 'Your organisation';

      const headline = escapeHtml(after.headline || 'Untitled');
      const requestedByName = escapeHtml(after.approvalRequestedByName || 'A team member');
      const detailUrl = `${appUrl}/dashboard/releases/${releaseId}`;

      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

      const bodyHtml = `
        <p style="margin-top:0;"><strong>${requestedByName}</strong> has asked you to review a press release before it's sent.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;vertical-align:top;">Headline</td>
            <td style="padding:6px 0;font-weight:600;">${headline}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;vertical-align:top;">Requested by</td>
            <td style="padding:6px 0;">${requestedByName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;vertical-align:top;">Date</td>
            <td style="padding:6px 0;">${dateStr}</td>
          </tr>
        </table>
        ${emailButton(detailUrl, 'Review Release →')}
      `;

      sgMail.setApiKey(key);
      await sgMail.send({
        to: approverEmail,
        from: { email: fromEmail, name: orgName },
        subject: `Approval requested: "${after.headline || 'Untitled'}" — ${orgName}`,
        html: emailWrapper(orgName, 'Approval requested', bodyHtml),
        text: `${requestedByName} has asked you to review a press release before it's sent.\n\nHeadline: ${after.headline}\nRequested by: ${requestedByName}\nDate: ${dateStr}\n\nReview it here: ${detailUrl}`,
      });

      // Mark notified to prevent duplicates
      await change.after.ref.update({
        approvalNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[onApprovalRequested] Notified ${approverEmail} for release ${releaseId}`);
    } catch (error: any) {
      console.error('[onApprovalRequested] Error:', error.message);
    }
  });

/**
 * Fires when a release's approvalStatus transitions from 'pending' to 'approved' or 'rejected'.
 * Notifies the person who originally requested approval.
 */
export const onApprovalResolved = functions.firestore
  .document('orgs/{orgId}/releases/{releaseId}')
  .onUpdate(async (change, context) => {
    const { orgId, releaseId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    // Only fire when transitioning out of pending to approved/rejected
    if (before.approvalStatus !== 'pending') return;
    if (after.approvalStatus !== 'approved' && after.approvalStatus !== 'rejected') return;

    // Guard against duplicate sends
    if (after.approvalResolvedNotifiedAt) return;

    const key = getSendGridKey();
    const fromEmail = getFromEmail();
    if (!key || !fromEmail) {
      console.warn('[onApprovalResolved] SendGrid not configured — skipping');
      return;
    }

    const requestedByEmail: string | undefined = after.approvalRequestedByEmail;
    if (!requestedByEmail) {
      console.warn('[onApprovalResolved] No approvalRequestedByEmail on release — skipping');
      return;
    }

    try {
      const orgDoc = await db.collection('orgs').doc(orgId).get();
      const orgName: string = orgDoc.exists ? (orgDoc.data()!.name || 'Your organisation') : 'Your organisation';

      const headline = after.headline || 'Untitled';
      const detailUrl = `${appUrl}/dashboard/releases/${releaseId}`;
      const isApproved = after.approvalStatus === 'approved';

      let subject: string;
      let headerTitle: string;
      let bodyText: string;
      let bodyHtml: string;

      if (isApproved) {
        subject = `"${headline}" has been approved`;
        headerTitle = 'Release approved';
        bodyText = `Your press release has been approved and is now ready to send.\n\nHeadline: ${headline}\n\nView it here: ${detailUrl}`;
        bodyHtml = `
          <p style="margin-top:0;">Your press release has been approved and is now ready to send.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr>
              <td style="padding:6px 0;color:#64748b;width:100px;vertical-align:top;">Headline</td>
              <td style="padding:6px 0;font-weight:600;">${escapeHtml(headline)}</td>
            </tr>
          </table>
          ${emailButton(detailUrl, 'View Release →')}
        `;
      } else {
        const notes = after.approvalNotes ? escapeHtml(after.approvalNotes) : null;
        subject = `Changes requested on "${headline}"`;
        headerTitle = 'Changes requested';
        bodyText = `Your press release has been returned for changes before it can be sent.\n\nHeadline: ${headline}${after.approvalNotes ? `\n\nNotes: ${after.approvalNotes}` : ''}\n\nView it here: ${detailUrl}`;
        bodyHtml = `
          <p style="margin-top:0;">Your press release has been returned for changes before it can be sent.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr>
              <td style="padding:6px 0;color:#64748b;width:100px;vertical-align:top;">Headline</td>
              <td style="padding:6px 0;font-weight:600;">${escapeHtml(headline)}</td>
            </tr>
            ${notes ? `<tr>
              <td style="padding:6px 0;color:#64748b;vertical-align:top;">Notes</td>
              <td style="padding:6px 0;">${notes}</td>
            </tr>` : ''}
          </table>
          ${emailButton(detailUrl, 'View Release →')}
        `;
      }

      sgMail.setApiKey(key);
      await sgMail.send({
        to: requestedByEmail,
        from: { email: fromEmail, name: orgName },
        subject,
        html: emailWrapper(orgName, headerTitle, bodyHtml),
        text: bodyText,
      });

      // Mark notified to prevent duplicates
      await change.after.ref.update({
        approvalResolvedNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[onApprovalResolved] Notified ${requestedByEmail} for release ${releaseId} — ${after.approvalStatus}`);
    } catch (error: any) {
      console.error('[onApprovalResolved] Error:', error.message);
    }
  });
