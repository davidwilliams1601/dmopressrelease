import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { sendWithRetry } from './sendgrid-retry';
import { escapeHtml } from './html-utils';
import { emailFooter, emailCallout, emailLink, emailMetric, emailMetricSmall, getEmailColors } from './email-branding';

const db = admin.firestore();

function getSendGridKey(): string | null {
  return functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY || null;
}

function getFromEmail(): string | null {
  return functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL || null;
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
      const orgData = orgDoc.data()!;
      const orgName = orgData.name || 'Your organisation';
      const orgSlug = orgData.slug || orgId;
      const brandedOrg = { name: orgName, branding: orgData.branding, tier: orgData.tier };
      const colors = getEmailColors(brandedOrg);

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
          <div style="background-color: ${colors.primary}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; color: ${colors.textOnPrimary}; font-size: 22px;">Your content has been selected!</h1>
          </div>
          <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hi ${partnerName},</p>
            <p>Great news — your submission <strong>"${submissionTitle}"</strong> has been selected for inclusion in an upcoming press release from <strong>${safeOrgName}</strong>.</p>
            ${releaseHeadline ? `
            ${emailCallout(brandedOrg, `
              <p style="margin: 0; font-size: 14px; color: #64748b;">Featured in</p>
              <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #0f172a;">${safeHeadline}</p>
              ${releaseUrl ? `<p style="margin: 8px 0 0;">${emailLink(brandedOrg, releaseUrl, 'Read the release →')}</p>` : ''}
            `)}
            ` : ''}
            <p>Your content helps ${safeOrgName} tell its story and reach journalists, travel writers, and media contacts across our target markets. Thank you for contributing.</p>
            <p style="color: #64748b; font-size: 14px;">If you have more news or stories to share, you can submit them anytime through the partner portal.</p>
          </div>
          ${emailFooter(brandedOrg, { showManageLink: false })}
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
 * Firestore trigger: send a notification email to a partner when their
 * submission status changes to 'approved'.
 */
export const onSubmissionApproved = functions.firestore
  .document('orgs/{orgId}/submissions/{submissionId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only fire when status transitions to 'approved'
    if (before.status === 'approved' || after.status !== 'approved') return;

    // Avoid duplicate sends
    if (after.notifiedApprovedAt) return;

    const { orgId } = context.params;

    const key = getSendGridKey();
    const fromEmail = getFromEmail();

    if (!key || !fromEmail) {
      console.warn('[onSubmissionApproved] SendGrid not configured — skipping email');
      return;
    }

    sgMail.setApiKey(key);

    try {
      // Get org details
      const orgDoc = await db.collection('orgs').doc(orgId).get();
      if (!orgDoc.exists) return;
      const orgData = orgDoc.data()!;
      const orgName = orgData.name || 'Your organisation';
      const brandedOrg = { name: orgName, branding: orgData.branding, tier: orgData.tier };
      const colors = getEmailColors(brandedOrg);

      const partnerName = escapeHtml(after.partnerName || 'Partner');
      const submissionTitle = escapeHtml(after.title || 'Your submission');
      const safeOrgName = escapeHtml(orgName);

      const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: ${colors.primary}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; color: ${colors.textOnPrimary}; font-size: 22px;">Your submission has been approved!</h1>
          </div>
          <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hi ${partnerName},</p>
            <p>Good news — your submission <strong>"${submissionTitle}"</strong> has been approved by <strong>${safeOrgName}</strong> and is being considered for upcoming press releases.</p>
            <p>We'll let you know if your content is selected for a release. In the meantime, feel free to submit more stories through the partner portal.</p>
            <p style="color: #64748b; font-size: 14px;">Thank you for your contribution!</p>
          </div>
          ${emailFooter(brandedOrg, { showManageLink: false })}
        </body>
        </html>
      `;

      await sendWithRetry({
        to: after.partnerEmail,
        from: { email: fromEmail, name: orgName },
        subject: `Submission approved — ${orgName}`,
        html,
        text: `Hi ${after.partnerName},

Your submission "${after.title}" has been approved by ${orgName} and is being considered for upcoming press releases.

We'll let you know if your content is selected. Thank you for your contribution!

${orgName}`,
      } as any);

      // Mark as notified to prevent duplicates
      await change.after.ref.update({
        notifiedApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[onSubmissionApproved] Notification sent to ${after.partnerEmail} for submission ${context.params.submissionId}`);
    } catch (error: any) {
      console.error('[onSubmissionApproved] Error sending notification:', error);
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
  const orgData = orgDoc.data()!;
  const orgName: string = orgData.name || 'Your organisation';
  const orgSlug: string = orgData.slug || orgId;
  const brandedOrg = { name: orgName, branding: orgData.branding, tier: orgData.tier };
  const colors = getEmailColors(brandedOrg);

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
                ${emailLink(brandedOrg, `${appUrl}/releases/${orgSlug}/${escapeHtml(r.slug)}`, escapeHtml(r.headline))}
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
          <div style="background-color: ${colors.primary}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <p style="margin: 0; color: ${colors.textOnPrimary}; opacity: 0.8; font-size: 13px;">${safeOrgName}</p>
            <h1 style="margin: 4px 0 0; color: ${colors.textOnPrimary}; font-size: 22px;">Your ${quarterLabel} report</h1>
          </div>
          <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hi ${safePartnerName},</p>
            <p>Here's a summary of your contributions to ${safeOrgName} during ${quarterLabel} (${quarterStartLabel} – ${quarterEndLabel}).</p>

            <div style="display: flex; gap: 16px; margin: 24px 0;">
              <div style="flex: 1; background: ${colors.primaryLight}; border-radius: 8px; padding: 16px; text-align: center;">
                ${emailMetric(brandedOrg, partnerSubs.length)}
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
          ${emailFooter(brandedOrg, { showManageLink: false })}
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
 * Callable: preview a quarterly partner report without sending.
 * Org-admin only. Returns rendered HTML for a sample partner.
 *
 * Input: { orgId, year, quarter }  — quarter is 1–4
 * Output: { html, partnerCount, partnerName }
 */
export const previewQuarterlyPartnerReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const { orgId, year, quarter } = data;

  if (!orgId || !year || !quarter || quarter < 1 || quarter > 4) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId, year and quarter (1-4) are required.');
  }

  // Verify caller is an admin of this org
  const callerDoc = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only organisation admins can preview reports.');
  }

  // Quarter date range
  const quarterStartMonth = (quarter - 1) * 3;
  const quarterStart = new Date(year, quarterStartMonth, 1);
  const quarterEnd = new Date(year, quarterStartMonth + 3, 0, 23, 59, 59, 999);

  const quarterLabel = `Q${quarter} ${year}`;
  const quarterStartLabel = quarterStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const quarterEndLabel = quarterEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Get org details
  const orgDoc = await db.collection('orgs').doc(orgId).get();
  if (!orgDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Organisation not found.');
  }
  const orgData = orgDoc.data()!;
  const orgName: string = orgData.name || 'Your organisation';
  const orgSlug: string = orgData.slug || orgId;
  const brandedOrg = { name: orgName, branding: orgData.branding, tier: orgData.tier };
  const colors = getEmailColors(brandedOrg);

  // Get all partner users
  const partnersSnap = await db
    .collection('orgs').doc(orgId)
    .collection('users')
    .where('role', '==', 'Partner')
    .get();

  if (partnersSnap.empty) {
    throw new functions.https.HttpsError('not-found', 'No partners found in this organisation.');
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

  // Pick the first partner that has submissions this quarter, or fall back to the first partner
  let samplePartnerDoc = partnersSnap.docs[0];
  let samplePartnerSubs: any[] = [];

  for (const partnerDoc of partnersSnap.docs) {
    const subs = allSubmissions.filter((s: any) => s.partnerId === partnerDoc.id);
    if (subs.length > 0) {
      samplePartnerDoc = partnerDoc;
      samplePartnerSubs = subs;
      break;
    }
  }

  const partner = samplePartnerDoc.data();
  const partnerName: string = partner.name || 'Partner';

  const partnerSubs = samplePartnerSubs;
  const usedSubs = partnerSubs.filter((s: any) => s.status === 'used');
  const featuredReleaseIds = new Set<string>();
  usedSubs.forEach((s: any) => {
    (s.usedInReleaseIds || []).forEach((id: string) => featuredReleaseIds.add(id));
  });

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
            ${emailLink(brandedOrg, `${appUrl}/releases/${orgSlug}/${escapeHtml(r.slug)}`, escapeHtml(r.headline))}
          </li>
        `).join('')}
      </ul>
    `
    : '';

  const submissionsHtml = partnerSubs.length > 0
    ? `
      <h3 style="font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 12px;">Your submissions this quarter</h3>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${partnerSubs.map((s: any) => `
          <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; display: flex; align-items: center; gap: 8px;">
            <span style="color: ${s.status === 'used' ? '#16a34a' : '#64748b'}; font-weight: 700;">${s.status === 'used' ? '\u2713' : '\u2192'}</span>
            <span>${escapeHtml(s.title)}${s.status === 'used' ? ' <span style="font-size: 12px; color: #16a34a; margin-left: 6px;">Featured</span>' : ''}</span>
          </li>
        `).join('')}
      </ul>
    `
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${colors.primary}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <p style="margin: 0; color: ${colors.textOnPrimary}; opacity: 0.8; font-size: 13px;">${safeOrgName}</p>
        <h1 style="margin: 4px 0 0; color: ${colors.textOnPrimary}; font-size: 22px;">Your ${quarterLabel} report</h1>
      </div>
      <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
        <p style="margin-top: 0;">Hi ${safePartnerName},</p>
        <p>Here's a summary of your contributions to ${safeOrgName} during ${quarterLabel} (${quarterStartLabel} \u2013 ${quarterEndLabel}).</p>

        <div style="display: flex; gap: 16px; margin: 24px 0;">
          <div style="flex: 1; background: ${colors.primaryLight}; border-radius: 8px; padding: 16px; text-align: center;">
            ${emailMetric(brandedOrg, partnerSubs.length)}
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
            ? `Your stories helped ${safeOrgName} reach journalists and media contacts this quarter. Thank you for your contributions \u2014 keep them coming.`
            : `Your submissions are in our queue and will be considered for upcoming press releases. Thank you for contributing to ${safeOrgName}'s press activity.`
          }
        </p>
      </div>
      ${emailFooter(brandedOrg, { showManageLink: false })}
    </body>
    </html>
  `;

  return {
    html,
    partnerCount: partnersSnap.size,
    partnerName,
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
  const orgData = orgDoc.data()!;
  const orgName: string = orgData.name || 'Your organisation';
  const brandedOrg = { name: orgName, branding: orgData.branding, tier: orgData.tier };
  const colors = getEmailColors(brandedOrg);

  // Fetch target partners
  let partnersSnap;
  if (partnerIds && partnerIds.length > 0) {
    const refs = partnerIds.map((id: string) =>
      db.collection('orgs').doc(orgId).collection('users').doc(id)
    );
    const docs = await db.getAll(...refs);
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
          <div style="background-color: ${colors.primary}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <p style="margin: 0; color: ${colors.textOnPrimary}; opacity: 0.8; font-size: 13px;">${safeOrgName}</p>
            <h1 style="margin: 4px 0 0; color: ${colors.textOnPrimary}; font-size: 22px;">${safeSubject}</h1>
          </div>
          <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hi ${safePartnerName},</p>
            ${bodyHtml}
          </div>
          ${emailFooter(brandedOrg, { showManageLink: false })}
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


/**
 * Build the HTML email for a partner's monthly impact report.
 */
function buildMonthlyImpactHtml(opts: {
  partnerName: string;
  orgName: string;
  orgBranding: { name: string; branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string } | null; tier?: string | null };
  monthLabel: string;
  submissionCount: number;
  usedSubmissions: Array<{
    title: string;
    releaseHeadline: string;
    releaseUrl: string;
    sends: number;
    opens: number;
    clicks: number;
  }>;
  totalJournalistsReached: number;
  overallOpenRate: number;
}): string {
  const {
    partnerName,
    orgName,
    orgBranding,
    monthLabel,
    submissionCount,
    usedSubmissions,
    totalJournalistsReached,
    overallOpenRate,
  } = opts;

  const colors = getEmailColors(orgBranding);
  const safePartnerName = escapeHtml(partnerName);
  const safeOrgName = escapeHtml(orgName);

  const hasUsedSubmissions = usedSubmissions.length > 0;

  const summaryText = hasUsedSubmissions
    ? `Your stories reached <strong>${totalJournalistsReached.toLocaleString()}</strong> journalist${totalJournalistsReached !== 1 ? 's' : ''} last month with a <strong>${overallOpenRate}%</strong> open rate.`
    : submissionCount > 0
      ? `You made ${submissionCount} submission${submissionCount !== 1 ? 's' : ''} last month. They&#39;re in our queue and will be considered for upcoming press releases.`
      : `We didn&#39;t receive any submissions from you last month. We&#39;d love to hear your latest news — submit a story anytime through the partner portal.`;

  const submissionBreakdownHtml = usedSubmissions.map((s) => {
    const openRate = s.sends > 0 ? Math.round((s.opens / s.sends) * 100) : 0;
    return `
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
        <p style="margin: 0 0 4px; font-size: 13px; color: #64748b;">Your submission</p>
        <p style="margin: 0 0 8px; font-weight: 600; color: #0f172a;">${escapeHtml(s.title)}</p>
        <p style="margin: 0 0 4px; font-size: 13px; color: #64748b;">Featured in</p>
        <p style="margin: 0 0 12px;">
          ${emailLink(orgBranding, s.releaseUrl, escapeHtml(s.releaseHeadline))}
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="text-align: center; padding: 8px; background: ${colors.primaryLight}; border-radius: 6px 0 0 6px;">
              ${emailMetricSmall(orgBranding, s.sends.toLocaleString())}
              <div style="font-size: 11px; color: #64748b;">Journalists</div>
            </td>
            <td style="text-align: center; padding: 8px; background: #f0fdf4;">
              <div style="font-size: 20px; font-weight: 700; color: #16a34a;">${openRate}%</div>
              <div style="font-size: 11px; color: #64748b;">Open rate</div>
            </td>
            <td style="text-align: center; padding: 8px; background: #fefce8; border-radius: 0 6px 6px 0;">
              <div style="font-size: 20px; font-weight: 700; color: #ca8a04;">${s.clicks}</div>
              <div style="font-size: 11px; color: #64748b;">Clicks</div>
            </td>
          </tr>
        </table>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${colors.primary}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <p style="margin: 0; color: ${colors.textOnPrimary}; opacity: 0.8; font-size: 13px;">${safeOrgName}</p>
        <h1 style="margin: 4px 0 0; color: ${colors.textOnPrimary}; font-size: 22px;">Your ${escapeHtml(monthLabel)} Impact Report</h1>
      </div>
      <div style="background: white; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
        <p style="margin-top: 0;">Hi ${safePartnerName},</p>
        <p>${summaryText}</p>

        ${hasUsedSubmissions ? `
          <div style="display: flex; gap: 16px; margin: 24px 0;">
            <div style="flex: 1; background: ${colors.primaryLight}; border-radius: 8px; padding: 16px; text-align: center;">
              ${emailMetric(orgBranding, submissionCount)}
              <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Submission${submissionCount !== 1 ? 's' : ''}</div>
            </div>
            <div style="flex: 1; background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #16a34a; line-height: 1;">${totalJournalistsReached.toLocaleString()}</div>
              <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Journalists reached</div>
            </div>
            <div style="flex: 1; background: #fefce8; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #ca8a04; line-height: 1;">${overallOpenRate}%</div>
              <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Open rate</div>
            </div>
          </div>

          <h3 style="font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 12px;">Submission breakdown</h3>
          ${submissionBreakdownHtml}
        ` : ''}

        <div style="text-align: center; margin-top: 32px;">
          <a href="#" style="display: inline-block; background: ${colors.primary}; color: ${colors.textOnPrimary}; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Submit your next story</a>
        </div>
      </div>
      ${emailFooter(orgBranding, { showManageLink: false })}
    </body>
    </html>
  `;
}

/**
 * Core logic: generate and send monthly impact reports for a single org.
 * Extracted so it can be called by both the scheduled function and the manual trigger.
 */
async function sendMonthlyImpactForOrg(
  orgId: string,
  monthStart: Date,
  monthEnd: Date,
  monthLabel: string
): Promise<{ sentCount: number; failedCount: number; skippedCount: number; partnerCount: number }> {
  const key = getSendGridKey();
  const fromEmail = getFromEmail();

  if (!key || !fromEmail) {
    console.warn(`[sendMonthlyImpactForOrg] SendGrid not configured for org ${orgId} — skipping`);
    return { sentCount: 0, failedCount: 0, skippedCount: 0, partnerCount: 0 };
  }

  sgMail.setApiKey(key);

  const orgDoc = await db.collection('orgs').doc(orgId).get();
  if (!orgDoc.exists) {
    console.warn(`[sendMonthlyImpactForOrg] Org ${orgId} not found`);
    return { sentCount: 0, failedCount: 0, skippedCount: 0, partnerCount: 0 };
  }
  const orgData = orgDoc.data()!;
  const orgName: string = orgData.name || 'Your organisation';
  const orgSlug: string = orgData.slug || orgId;
  const senderEmail: string = orgData.pressContact?.email || fromEmail;
  const brandedOrg = { name: orgName, branding: orgData.branding, tier: orgData.tier };

  // Get all partner users
  const partnersSnap = await db
    .collection('orgs').doc(orgId)
    .collection('users')
    .where('role', '==', 'Partner')
    .get();

  if (partnersSnap.empty) {
    return { sentCount: 0, failedCount: 0, skippedCount: 0, partnerCount: 0 };
  }

  // Get all submissions from the target month
  const submissionsSnap = await db
    .collection('orgs').doc(orgId)
    .collection('submissions')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(monthStart))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(monthEnd))
    .get();

  const allSubmissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  // Collect all release IDs referenced by submissions
  const releaseIdSet = new Set<string>();
  allSubmissions.forEach((s: any) => {
    (s.usedInReleaseIds || []).forEach((id: string) => releaseIdSet.add(id));
  });

  // Fetch release data (headline, slug, sends, opens, clicks)
  const releaseMap = new Map<string, { headline: string; slug: string; sends: number; opens: number; clicks: number }>();
  const releaseIds = Array.from(releaseIdSet);
  // Batch in groups of 10 for Firestore getAll limit
  for (let i = 0; i < releaseIds.length; i += 10) {
    const batch = releaseIds.slice(i, i + 10);
    const refs = batch.map((id) => db.collection('orgs').doc(orgId).collection('releases').doc(id));
    const docs = await db.getAll(...refs);
    docs.forEach((doc) => {
      if (doc.exists) {
        const r = doc.data()!;
        releaseMap.set(doc.id, {
          headline: r.headline || '',
          slug: r.slug || '',
          sends: r.sends || 0,
          opens: r.opens || 0,
          clicks: r.clicks || 0,
        });
      }
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // Process partners sequentially to avoid overwhelming SendGrid
  for (const partnerDoc of partnersSnap.docs) {
    const partner = partnerDoc.data();
    const partnerEmail: string = partner.email;
    const partnerName: string = partner.name || 'Partner';
    const partnerId: string = partnerDoc.id;

    if (!partnerEmail) {
      skippedCount++;
      continue;
    }

    // Filter submissions for this partner
    const partnerSubs = allSubmissions.filter((s: any) => s.partnerId === partnerId);

    // Build used-submissions detail with release stats
    const usedSubmissions: Array<{
      title: string;
      releaseHeadline: string;
      releaseUrl: string;
      sends: number;
      opens: number;
      clicks: number;
    }> = [];

    for (const sub of partnerSubs) {
      if (sub.status !== 'used' || !sub.usedInReleaseIds?.length) continue;
      for (const releaseId of sub.usedInReleaseIds) {
        const release = releaseMap.get(releaseId);
        if (release) {
          usedSubmissions.push({
            title: sub.title || 'Untitled submission',
            releaseHeadline: release.headline || 'Untitled release',
            releaseUrl: `${appUrl}/releases/${orgSlug}/${release.slug}`,
            sends: release.sends,
            opens: release.opens,
            clicks: release.clicks,
          });
        }
      }
    }

    const totalJournalistsReached = usedSubmissions.reduce((sum, s) => sum + s.sends, 0);
    const totalOpens = usedSubmissions.reduce((sum, s) => sum + s.opens, 0);
    const overallOpenRate = totalJournalistsReached > 0 ? Math.round((totalOpens / totalJournalistsReached) * 100) : 0;

    // Skip partners with zero submissions and zero used content
    if (partnerSubs.length === 0 && usedSubmissions.length === 0) {
      skippedCount++;
      continue;
    }

    const html = buildMonthlyImpactHtml({
      partnerName,
      orgName,
      orgBranding: brandedOrg,
      monthLabel,
      submissionCount: partnerSubs.length,
      usedSubmissions,
      totalJournalistsReached,
      overallOpenRate,
    });

    const summaryLine = usedSubmissions.length > 0
      ? `Your stories reached ${totalJournalistsReached} journalists last month with a ${overallOpenRate}% open rate.`
      : partnerSubs.length > 0
        ? `You made ${partnerSubs.length} submission${partnerSubs.length !== 1 ? 's' : ''} last month. They're in our queue.`
        : `We'd love to hear your latest news — submit a story anytime.`;

    const text = [
      `Hi ${partnerName},`,
      '',
      `Here's your ${monthLabel} impact report for ${orgName}.`,
      '',
      summaryLine,
      '',
      ...(usedSubmissions.length > 0
        ? [
            'Submissions featured in releases:',
            ...usedSubmissions.map((s) => `- "${s.title}" in "${s.releaseHeadline}" (${s.sends} journalists, ${s.sends > 0 ? Math.round((s.opens / s.sends) * 100) : 0}% opens)`),
            '',
          ]
        : []),
      `Thank you for contributing to ${orgName}.`,
    ].join('\n');

    try {
      await sendWithRetry({
        to: partnerEmail,
        from: { email: senderEmail, name: orgName },
        subject: `Your ${monthLabel} Impact Report — ${orgName}`,
        html,
        text,
      } as any);

      sentCount++;
      console.log(`[monthlyImpact] Sent ${monthLabel} report to ${partnerEmail}`);
    } catch (error: any) {
      console.error(`[monthlyImpact] Failed to send to ${partnerEmail}:`, error);
      failedCount++;
    }
  }

  return { sentCount, failedCount, skippedCount, partnerCount: partnersSnap.size };
}

/**
 * Scheduled function: send monthly partner impact reports.
 * Runs at 9am on the 1st of each month.
 */
export const sendMonthlyPartnerImpact = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .pubsub.schedule('0 9 1 * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    // Calculate previous month date range
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const monthLabel = monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    console.log(`[sendMonthlyPartnerImpact] Running for ${monthLabel}`);

    // Get all orgs that have at least one partner
    const orgsSnap = await db.collection('orgs').get();

    let totalSent = 0;
    let totalFailed = 0;

    // Process orgs sequentially to avoid overwhelming SendGrid
    for (const orgDoc of orgsSnap.docs) {
      const orgId = orgDoc.id;

      try {
        const result = await sendMonthlyImpactForOrg(orgId, monthStart, monthEnd, monthLabel);
        totalSent += result.sentCount;
        totalFailed += result.failedCount;

        if (result.partnerCount > 0) {
          console.log(
            `[sendMonthlyPartnerImpact] Org ${orgId}: ${result.sentCount} sent, ${result.failedCount} failed, ${result.skippedCount} skipped of ${result.partnerCount} partners`
          );
        }
      } catch (error: any) {
        console.error(`[sendMonthlyPartnerImpact] Error processing org ${orgId}:`, error);
      }
    }

    console.log(`[sendMonthlyPartnerImpact] Complete: ${totalSent} sent, ${totalFailed} failed across all orgs`);
  });

/**
 * Callable: manually trigger the monthly impact report for a specific org.
 * Org-admin only.
 *
 * Input: { orgId }
 */
export const triggerPartnerImpactReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const { orgId } = data;

  if (!orgId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');
  }

  // Verify caller is an admin of this org
  const callerDoc = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only organisation admins can trigger impact reports.');
  }

  // Calculate previous month date range
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const monthLabel = monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const result = await sendMonthlyImpactForOrg(orgId, monthStart, monthEnd, monthLabel);

  return {
    ...result,
    monthLabel,
  };
});
