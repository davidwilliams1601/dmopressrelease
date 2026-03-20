import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { sendWithRetry } from './sendgrid-retry';

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

/**
 * Firestore trigger: send a congratulations email to a partner when their
 * submission status changes to 'used'.
 */
export const onSubmissionUsed = functions.firestore
  .document('orgs/{orgId}/submissions/{submissionId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only fire when status transitions to 'used'
    if (before.status === 'used' || after.status !== 'used') return;

    // Avoid duplicate sends
    if (after.notifiedUsedAt) return;

    const { orgId } = context.params;

    const key = getSendGridKey();
    const fromEmail = getFromEmail();

    if (!key || !fromEmail) {
      console.warn('[onSubmissionUsed] SendGrid not configured — skipping email');
      return;
    }

    sgMail.setApiKey(key);

    try {
      // Get org details
      const orgDoc = await db.collection('orgs').doc(orgId).get();
      if (!orgDoc.exists) return;
      const org = orgDoc.data()!;
      const orgName = org.name || 'Your organisation';
      const orgSlug = org.slug || orgId;

      // Get the latest release this submission was used in
      const usedInReleaseIds: string[] = after.usedInReleaseIds || [];
      let releaseHeadline = '';
      let releaseUrl = '';

      if (usedInReleaseIds.length > 0) {
        const releaseId = usedInReleaseIds[usedInReleaseIds.length - 1];
        const releaseDoc = await db
          .collection('orgs').doc(orgId)
          .collection('releases').doc(releaseId)
          .get();
        if (releaseDoc.exists) {
          const release = releaseDoc.data()!;
          releaseHeadline = release.headline || '';
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';
          releaseUrl = `${appUrl}/releases/${orgSlug}/${release.slug}`;
        }
      }

      const partnerName = escapeHtml(after.partnerName || 'Partner');
      const submissionTitle = escapeHtml(after.title || 'Your submission');
      const safeOrgName = escapeHtml(orgName);
      const safeHeadline = escapeHtml(releaseHeadline);

      const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #2563eb; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; color: white; font-size: 22px;">Your content has been selected!</h1>
          </div>
          <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hi ${partnerName},</p>
            <p>Great news — your submission <strong>"${submissionTitle}"</strong> has been selected for inclusion in an upcoming press release from <strong>${safeOrgName}</strong>.</p>
            ${releaseHeadline ? `
            <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; font-size: 14px; color: #64748b;">Featured in</p>
              <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #0f172a;">${safeHeadline}</p>
              ${releaseUrl ? `<p style="margin: 8px 0 0;"><a href="${releaseUrl}" style="color: #2563eb; font-size: 14px;">Read the release →</a></p>` : ''}
            </div>
            ` : ''}
            <p>Your content helps ${safeOrgName} tell its story and reach journalists, travel writers, and media contacts across our target markets. Thank you for contributing.</p>
            <p style="color: #64748b; font-size: 14px;">If you have more news or stories to share, you can submit them anytime through the partner portal.</p>
          </div>
          <div style="text-align: center; padding: 20px; font-size: 12px; color: #94a3b8;">
            Sent by ${safeOrgName} via PressPilot
          </div>
        </body>
        </html>
      `;

      await sendWithRetry({
        to: after.partnerEmail,
        from: { email: fromEmail, name: orgName },
        subject: `Your content has been selected — ${orgName}`,
        html,
        text: `Hi ${after.partnerName},\n\nYour submission "${after.title}" has been selected for an upcoming press release from ${orgName}${releaseHeadline ? `: "${releaseHeadline}"` : ''}.\n\n${releaseUrl ? `Read it here: ${releaseUrl}\n\n` : ''}Thank you for contributing!\n\n${orgName}`,
      } as any);

      // Mark as notified to prevent duplicates
      await change.after.ref.update({
        notifiedUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[onSubmissionUsed] Notification sent to ${after.partnerEmail} for submission ${context.params.submissionId}`);
    } catch (error: any) {
      console.error('[onSubmissionUsed] Error sending notification:', error);
    }
  });

/**
 * Callable: send each partner their personalised quarterly report.
 * Org-admin only.
 *
 * Input: { orgId, year, quarter }  — quarter is 1–4
 */
export const sendQuarterlyPartnerReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const { orgId, year, quarter } = data;

  if (!orgId || !year || !quarter || quarter < 1 || quarter > 4) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, year and quarter (1–4) are required.');
  }

  // Verify caller is an admin of this org
  const callerDoc = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only organisation admins can send reports.');
  }

  const key = getSendGridKey();
  const fromEmail = getFromEmail();
  if (!key || !fromEmail) {
    throw new functions.https.HttpsError('failed-precondition', 'Email is not configured for this organisation.');
  }
  sgMail.setApiKey(key);

  // Quarter date range
  const quarterStartMonth = (quarter - 1) * 3; // 0, 3, 6, 9
  const quarterStart = new Date(year, quarterStartMonth, 1);
  const quarterEnd = new Date(year, quarterStartMonth + 3, 0, 23, 59, 59, 999); // last day of quarter

  const quarterLabel = `Q${quarter} ${year}`;
  const quarterStartLabel = quarterStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const quarterEndLabel = quarterEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Get org details
  const orgDoc = await db.collection('orgs').doc(orgId).get();
  if (!orgDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Organisation not found.');
  }
  const org = orgDoc.data()!;
  const orgName: string = org.name || 'Your organisation';
  const orgSlug: string = org.slug || orgId;

  // Get all partner users
  const partnersSnap = await db
    .collection('orgs').doc(orgId)
    .collection('users')
    .where('role', '==', 'Partner')
    .get();

  if (partnersSnap.empty) {
    return { sentCount: 0, partnerCount: 0, message: 'No partners found.' };
  }

  // Get all submissions for this org within the quarter
  const submissionsSnap = await db
    .collection('orgs').doc(orgId)
    .collection('submissions')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(quarterStart))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(quarterEnd))
    .get();

  const allSubmissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  // Get releases that partners' submissions appeared in (for headlines)
  const releaseIdSet = new Set<string>();
  allSubmissions.forEach((s: any) => {
    (s.usedInReleaseIds || []).forEach((id: string) => releaseIdSet.add(id));
  });

  const releaseMap = new Map<string, { headline: string; slug: string }>();
  await Promise.all(
    Array.from(releaseIdSet).map(async (releaseId) => {
      const releaseDoc = await db.collection('orgs').doc(orgId).collection('releases').doc(releaseId).get();
      if (releaseDoc.exists) {
        const r = releaseDoc.data()!;
        releaseMap.set(releaseId, { headline: r.headline || '', slug: r.slug || '' });
      }
    })
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

  let sentCount = 0;
  const failedRecipients: string[] = [];

  await Promise.all(
    partnersSnap.docs.map(async (partnerDoc) => {
      const partner = partnerDoc.data();
      const partnerEmail: string = partner.email;
      const partnerName: string = partner.name || 'Partner';
      const partnerId: string = partnerDoc.id;

      // Filter submissions for this partner
      const partnerSubs = allSubmissions.filter((s: any) => s.partnerId === partnerId);
      if (partnerSubs.length === 0) return; // Nothing to report — skip

      const usedSubs = partnerSubs.filter((s: any) => s.status === 'used');
      const featuredReleaseIds = new Set<string>();
      usedSubs.forEach((s: any) => {
        (s.usedInReleaseIds || []).forEach((id: string) => featuredReleaseIds.add(id));
      });

      // Build featured releases list
      const featuredReleases = Array.from(featuredReleaseIds)
        .map((id) => releaseMap.get(id))
        .filter(Boolean) as Array<{ headline: string; slug: string }>;

      const safeOrgName = escapeHtml(orgName);
      const safePartnerName = escapeHtml(partnerName);

      const featuredReleasesHtml = featuredReleases.length > 0
        ? `
          <h3 style="font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 12px;">Featured in</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${featuredReleases.map((r) => `
              <li style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                <a href="${appUrl}/releases/${orgSlug}/${escapeHtml(r.slug)}" style="color: #2563eb; text-decoration: none; font-size: 14px;">${escapeHtml(r.headline)}</a>
              </li>
            `).join('')}
          </ul>
        `
        : '';

      const submissionsHtml = `
        <h3 style="font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 12px;">Your submissions this quarter</h3>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${partnerSubs.map((s: any) => `
            <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; display: flex; align-items: center; gap: 8px;">
              <span style="color: ${s.status === 'used' ? '#16a34a' : '#64748b'}; font-weight: 700;">${s.status === 'used' ? '✓' : '→'}</span>
              <span>${escapeHtml(s.title)}${s.status === 'used' ? ' <span style="font-size: 12px; color: #16a34a; margin-left: 6px;">Featured</span>' : ''}</span>
            </li>
          `).join('')}
        </ul>
      `;

      const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #2563eb; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 13px;">${safeOrgName}</p>
            <h1 style="margin: 4px 0 0; color: white; font-size: 22px;">Your ${quarterLabel} report</h1>
          </div>
          <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hi ${safePartnerName},</p>
            <p>Here's a summary of your contributions to ${safeOrgName} during ${quarterLabel} (${quarterStartLabel} – ${quarterEndLabel}).</p>

            <div style="display: flex; gap: 16px; margin: 24px 0;">
              <div style="flex: 1; background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 32px; font-weight: 700; color: #2563eb; line-height: 1;">${partnerSubs.length}</div>
                <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Submission${partnerSubs.length !== 1 ? 's' : ''} made</div>
              </div>
              <div style="flex: 1; background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 32px; font-weight: 700; color: #16a34a; line-height: 1;">${usedSubs.length}</div>
                <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Featured in releases</div>
              </div>
            </div>

            ${featuredReleasesHtml}
            ${submissionsHtml}

            <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
              ${usedSubs.length > 0
                ? `Your stories helped ${safeOrgName} reach journalists and media contacts this quarter. Thank you for your contributions — keep them coming.`
                : `Your submissions are in our queue and will be considered for upcoming press releases. Thank you for contributing to ${safeOrgName}'s press activity.`
              }
            </p>
          </div>
          <div style="text-align: center; padding: 20px; font-size: 12px; color: #94a3b8;">
            Sent by ${safeOrgName} via PressPilot
          </div>
        </body>
        </html>
      `;

      const text = [
        `Hi ${partnerName},`,
        '',
        `Here's your ${quarterLabel} summary for ${orgName} (${quarterStartLabel} – ${quarterEndLabel}).`,
        '',
        `Submissions made: ${partnerSubs.length}`,
        `Featured in releases: ${usedSubs.length}`,
        '',
        featuredReleases.length > 0
          ? `Featured in:\n${featuredReleases.map((r) => `- ${r.headline} — ${appUrl}/releases/${orgSlug}/${r.slug}`).join('\n')}`
          : '',
        '',
        `Thank you for contributing to ${orgName}.`,
      ].filter((l) => l !== undefined).join('\n');

      try {
        await sendWithRetry({
          to: partnerEmail,
          from: { email: fromEmail, name: orgName },
          subject: `Your ${quarterLabel} submissions report — ${orgName}`,
          html,
          text,
        } as any);

        sentCount++;
        console.log(`[sendQuarterlyPartnerReport] Sent ${quarterLabel} report to ${partnerEmail}`);
      } catch (error: any) {
        console.error(`[sendQuarterlyPartnerReport] Failed to send to ${partnerEmail} after retries:`, error);
        failedRecipients.push(partnerEmail);
      }
    })
  );

  return {
    sentCount,
    failedCount: failedRecipients.length,
    ...(failedRecipients.length > 0 ? { failedRecipients } : {}),
    partnerCount: partnersSnap.size,
    quarter: quarterLabel,
  };
});

/**
 * Callable: send a custom ad-hoc email to one or all partners.
 * Org-admin only. Each recipient receives an individual email.
 *
 * Input: { orgId, subject, body, partnerIds?: string[] }
 *   - partnerIds omitted / empty = send to all partners
 */
export const sendPartnerEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const { orgId, subject, body, partnerIds } = data;

  if (!orgId || !subject?.trim() || !body?.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, subject, and body are required.');
  }

  // Verify caller is an admin of this org
  const callerDoc = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only organisation admins can send partner emails.');
  }

  const key = getSendGridKey();
  const fromEmail = getFromEmail();
  if (!key || !fromEmail) {
    throw new functions.https.HttpsError('failed-precondition', 'Email is not configured for this organisation.');
  }
  sgMail.setApiKey(key);

  const orgDoc = await db.collection('orgs').doc(orgId).get();
  if (!orgDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Organisation not found.');
  }
  const org = orgDoc.data()!;
  const orgName: string = org.name || 'Your organisation';

  // Fetch target partners
  let partnersSnap;
  if (partnerIds && partnerIds.length > 0) {
    const docs = await Promise.all(
      partnerIds.map((id: string) =>
        db.collection('orgs').doc(orgId).collection('users').doc(id).get()
      )
    );
    partnersSnap = docs.filter((d) => d.exists && d.data()?.role === 'Partner');
  } else {
    const snap = await db
      .collection('orgs').doc(orgId)
      .collection('users')
      .where('role', '==', 'Partner')
      .get();
    partnersSnap = snap.docs;
  }

  if (partnersSnap.length === 0) {
    return { sentCount: 0 };
  }

  // Create a partnerEmails record before sending so we have an ID for tracking
  const emailRef = db.collection('orgs').doc(orgId).collection('partnerEmails').doc();
  const partnerEmailId = emailRef.id;
  const recipients = partnersSnap
    .map((d: any) => ({ id: d.id, name: d.data()?.name || '', email: d.data()?.email || '' }))
    .filter((r: any) => r.email);

  await emailRef.set({
    id: partnerEmailId,
    orgId,
    subject: subject.trim(),
    sentBy: context.auth.uid,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    recipientCount: recipients.length,
    sentCount: 0,
    opens: 0,
    clicks: 0,
    recipients,
  });

  const safeOrgName = escapeHtml(orgName);
  const safeSubject = escapeHtml(subject.trim());

  // Convert plain-text body to simple HTML paragraphs
  const bodyHtml = body
    .trim()
    .split(/\n\n+/)
    .map((para: string) => `<p>${escapeHtml(para.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');

  let sentCount = 0;
  const failedRecipients: string[] = [];

  await Promise.all(
    partnersSnap.map(async (partnerDoc: any) => {
      const partner = partnerDoc.data();
      if (!partner?.email) return;

      const safePartnerName = escapeHtml(partner.name || 'Partner');

      const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #2563eb; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 13px;">${safeOrgName}</p>
            <h1 style="margin: 4px 0 0; color: white; font-size: 22px;">${safeSubject}</h1>
          </div>
          <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hi ${safePartnerName},</p>
            ${bodyHtml}
          </div>
          <div style="text-align: center; padding: 20px; font-size: 12px; color: #94a3b8;">
            Sent by ${safeOrgName} via PressPilot
          </div>
        </body>
        </html>
      `;

      const text = `Hi ${partner.name || 'Partner'},\n\n${body.trim()}\n\n${orgName}`;

      try {
        await sendWithRetry({
          to: partner.email,
          from: { email: fromEmail, name: orgName },
          subject: subject.trim(),
          html,
          text,
          customArgs: { orgId, partnerEmailId },
          trackingSettings: {
            clickTracking: { enable: true },
            openTracking: { enable: true },
          },
        } as any);

        sentCount++;
      } catch (error: any) {
        console.error(`[sendPartnerEmail] Failed to send to ${partner.email} after retries:`, error);
        failedRecipients.push(partner.email);
      }
    })
  );

  // Update the record with actual sent/failed counts
  await emailRef.update({
    sentCount,
    failedCount: failedRecipients.length,
    ...(failedRecipients.length > 0 ? { failedRecipients } : {}),
  });

  return {
    sentCount,
    failedCount: failedRecipients.length,
    ...(failedRecipients.length > 0 ? { failedRecipients } : {}),
    recipientCount: partnersSnap.length,
  };
});
