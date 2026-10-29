import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { sendWithRetry } from './sendgrid-retry';
import { getSendGridKey, getFromEmail } from './sender';
import { escapeHtml } from './html-utils';
import { emailWrapper, getEmailColors } from './email-branding';
import {
  AdminEmailAudience,
  AdminEmailCategory,
  AudienceOrg,
  AudienceRecipient,
  AudienceUser,
  MAX_ADMIN_EMAIL_RECIPIENTS,
  applyMergeTags,
  buildAudience,
  selectOrgs,
  bodyToHtml,
  isValidEmail,
  validateComposition,
} from './admin-email-core';

/**
 * Super-admin emails to customer organisations (platform announcements, service
 * notices, product updates). See admin-email-core.ts for audience rules.
 *
 * Every real send is logged to /adminEmails/{id} with a per-recipient outcome in
 * /adminEmails/{id}/recipients, readable only by super-admins.
 */

const db = admin.firestore();

/** The platform's own identity for branding helpers. 'enterprise' suppresses the
 *  "via PressPilot" attribution, which would read oddly on mail from Press Pilot. */
const PLATFORM_BRAND = { name: 'Press Pilot', tier: 'enterprise', branding: null };

function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  if (!context.auth.token?.superAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
  }
}

function parseAudience(data: any): AdminEmailAudience {
  const a = data?.audience || {};
  const strList = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max) : [];
  return {
    orgIds: strList(a.orgIds, 500),
    tiers: strList(a.tiers, 10),
    verticals: strList(a.verticals, 10),
    includeDemo: a.includeDemo === true,
    roleScope: a.roleScope === 'admins' ? 'admins' : 'team',
  };
}

async function resolveAudience(audience: AdminEmailAudience, category: AdminEmailCategory) {
  const orgSnap = await db.collection('orgs').get();
  const orgs: AudienceOrg[] = orgSnap.docs.map((d) => ({
    id: d.id,
    name: d.get('name'),
    tier: d.get('tier') ?? null,
    vertical: d.get('vertical') ?? null,
    isDemo: d.get('isDemo') === true,
  }));
  const roles = audience.roleScope === 'admins' ? ['Admin'] : ['Admin', 'User'];
  // Only the orgs the audience could select are read, one query each. A collection-group
  // query would need its own index and would also have to skip non-org 'users' paths.
  const candidateIds = new Set(selectOrgs(orgs, audience).map((o) => o.id));
  const users: AudienceUser[] = [];
  const ids = [...candidateIds];
  for (let i = 0; i < ids.length; i += 20) {
    const snaps = await Promise.all(
      ids.slice(i, i + 20).map((orgId) =>
        db.collection('orgs').doc(orgId).collection('users').where('role', 'in', roles).get()
      )
    );
    snaps.forEach((snap, j) => {
      const orgId = ids[i + j];
      for (const d of snap.docs) {
        users.push({
          id: d.id,
          orgId,
          name: d.get('name'),
          email: d.get('email'),
          role: d.get('role'),
          notificationPrefs: d.get('notificationPrefs') ?? null,
        });
      }
    });
  }
  return buildAudience(orgs, users, audience, category);
}

function renderEmail(
  r: { name: string; orgName: string },
  subject: string,
  body: string,
  category: AdminEmailCategory
) {
  const { primary } = getEmailColors(PLATFORM_BRAND);
  const personalSubject = applyMergeTags(subject, r);
  const personalBody = applyMergeTags(body, r);
  // Merge values are escaped by bodyToHtml along with the rest of the text.
  const html = emailWrapper(PLATFORM_BRAND, escapeHtml(personalSubject), bodyToHtml(personalBody, primary), {
    showManageLink: category === 'product',
  });
  const footer =
    category === 'product'
      ? '\n\n--\nPress Pilot\nManage which emails you get: https://app.press-pilot.com/dashboard/settings'
      : '\n\n--\nPress Pilot';
  return { subject: personalSubject, html, text: personalBody.trim() + footer };
}

function parseComposition(data: any, context: functions.https.CallableContext) {
  const errors = validateComposition(data || {});
  if (errors.length) throw new functions.https.HttpsError('invalid-argument', errors.join(' '));
  const callerEmail = (context.auth?.token?.email as string | undefined) || '';
  const replyTo = typeof data.replyTo === 'string' && data.replyTo.trim() ? data.replyTo.trim() : callerEmail;
  return {
    subject: String(data.subject).trim(),
    body: String(data.body).trim(),
    category: data.category as AdminEmailCategory,
    replyTo: isValidEmail(replyTo) ? replyTo : null,
    fromName: typeof data.fromName === 'string' && data.fromName.trim() ? data.fromName.trim().slice(0, 60) : 'Press Pilot',
  };
}

function configureSendGrid(): string {
  const key = getSendGridKey();
  const fromEmail = getFromEmail();
  if (!key || !fromEmail) {
    throw new functions.https.HttpsError('failed-precondition', 'Email is not configured (missing SendGrid key or from-address).');
  }
  sgMail.setApiKey(key);
  return fromEmail;
}

/** Who would receive this email, without sending anything. */
export const previewOrgEmailAudience = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const audience = parseAudience(data);
  const category: AdminEmailCategory = data?.category === 'product' ? 'product' : 'service';
  const result = await resolveAudience(audience, category);
  return {
    recipientCount: result.recipients.length,
    overLimit: result.recipients.length > MAX_ADMIN_EMAIL_RECIPIENTS,
    maxRecipients: MAX_ADMIN_EMAIL_RECIPIENTS,
    orgs: result.orgs,
    skipped: result.skipped,
    recipients: result.recipients.slice(0, 300).map((r) => ({ orgName: r.orgName, name: r.name, email: r.email, role: r.role })),
  };
});

/** Send one copy to the signed-in super-admin, personalised as the first real recipient. */
export const sendOrgEmailTest = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const c = parseComposition(data, context);
  const to = (context.auth?.token?.email as string | undefined) || '';
  if (!isValidEmail(to)) throw new functions.https.HttpsError('failed-precondition', 'Your account has no email address.');
  const fromEmail = configureSendGrid();

  const audience = parseAudience(data);
  const sample = (await resolveAudience(audience, c.category)).recipients[0];
  const r = sample ? { name: sample.name, orgName: sample.orgName } : { name: 'Alex Example', orgName: 'Example Organisation' };
  const email = renderEmail(r, c.subject, c.body, c.category);

  await sendWithRetry({
    to,
    from: { email: fromEmail, name: c.fromName },
    ...(c.replyTo ? { replyTo: c.replyTo } : {}),
    subject: `[Test] ${email.subject}`,
    html: email.html,
    text: email.text,
    categories: ['admin-email', 'admin-email-test'],
  } as any);
  return { sentTo: to, personalisedAs: r };
});

/** Send to the whole audience and log the outcome. */
export const sendOrgEmail = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);
    const c = parseComposition(data, context);
    const audience = parseAudience(data);
    const expected = Number(data?.expectedRecipientCount);

    const { recipients, orgs, skipped } = await resolveAudience(audience, c.category);
    if (recipients.length === 0) {
      throw new functions.https.HttpsError('failed-precondition', 'Nobody matches this audience.');
    }
    if (recipients.length > MAX_ADMIN_EMAIL_RECIPIENTS) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `This audience has ${recipients.length} people. The limit is ${MAX_ADMIN_EMAIL_RECIPIENTS} per send.`
      );
    }
    // The confirm dialog showed a count. If the audience changed since, stop rather
    // than email people the sender didn't see.
    if (Number.isFinite(expected) && expected !== recipients.length) {
      throw new functions.https.HttpsError(
        'aborted',
        `The audience changed from ${expected} to ${recipients.length} people since you previewed it. Preview again before sending.`
      );
    }

    const fromEmail = configureSendGrid();
    const logRef = db.collection('adminEmails').doc();
    await logRef.set({
      subject: c.subject,
      body: c.body,
      category: c.category,
      fromName: c.fromName,
      replyTo: c.replyTo,
      audience,
      orgCount: orgs.filter((o) => o.recipientCount > 0).length,
      orgIds: orgs.filter((o) => o.recipientCount > 0).map((o) => o.id),
      recipientCount: recipients.length,
      skipped,
      status: 'sending',
      sentCount: 0,
      failedCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: context.auth!.uid,
      createdByEmail: (context.auth!.token?.email as string) || null,
    });

    let sentCount = 0;
    let failedCount = 0;
    const outcomes: Array<{ r: AudienceRecipient; ok: boolean; error?: string }> = [];
    const CONCURRENCY = 5;
    for (let i = 0; i < recipients.length; i += CONCURRENCY) {
      const chunk = recipients.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (r) => {
          const email = renderEmail(r, c.subject, c.body, c.category);
          try {
            await sendWithRetry({
              to: { email: r.email, name: r.name || undefined },
              from: { email: fromEmail, name: c.fromName },
              ...(c.replyTo ? { replyTo: c.replyTo } : {}),
              subject: email.subject,
              html: email.html,
              text: email.text,
              categories: ['admin-email', `admin-email-${c.category}`],
              customArgs: { adminEmailId: logRef.id, orgId: r.orgId },
            } as any);
            sentCount++;
            outcomes.push({ r, ok: true });
          } catch (err: any) {
            failedCount++;
            outcomes.push({ r, ok: false, error: String(err?.message || err).slice(0, 300) });
          }
        })
      );
    }

    for (let i = 0; i < outcomes.length; i += 400) {
      const batch = db.batch();
      for (const o of outcomes.slice(i, i + 400)) {
        batch.set(logRef.collection('recipients').doc(), {
          email: o.r.email,
          name: o.r.name,
          orgId: o.r.orgId,
          orgName: o.r.orgName,
          role: o.r.role,
          status: o.ok ? 'sent' : 'failed',
          error: o.error || null,
        });
      }
      await batch.commit();
    }

    const status = failedCount === 0 ? 'sent' : sentCount === 0 ? 'failed' : 'partial';
    await logRef.update({
      status,
      sentCount,
      failedCount,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[adminEmail] ${logRef.id} "${c.subject}" sent=${sentCount} failed=${failedCount}`);
    return { id: logRef.id, status, sentCount, failedCount };
  });

/** Recent sends for the history panel. */
export const listOrgEmails = functions.https.onCall(async (_data, context) => {
  requireSuperAdmin(context);
  const snap = await db.collection('adminEmails').orderBy('createdAt', 'desc').limit(25).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      subject: x.subject,
      category: x.category,
      status: x.status,
      recipientCount: x.recipientCount,
      orgCount: x.orgCount,
      sentCount: x.sentCount,
      failedCount: x.failedCount,
      createdAtMs: x.createdAt?.toMillis?.() ?? null,
      createdByEmail: x.createdByEmail ?? null,
    };
  });
});
