import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { sendWithRetry } from './sendgrid-retry';
import { escapeHtml } from './html-utils';
import { emailWrapper, emailButton } from './email-branding';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

function getSendGridKey(): string | null {
  return functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY || null;
}

function getFromEmail(): string | null {
  return functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL || null;
}

type OrgLike = {
  name?: string;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
  } | null;
  tier?: string | null;
};

/**
 * Sends a welcome email to a newly-created Press Pilot user, whether they're
 * the first admin of a brand-new org (provisionNewOrg) or an additional user
 * added to an existing org (createOrgUser).
 *
 * Deliberately does NOT email the raw temporary password generated at account
 * creation — instead it mints a genuine Firebase "set your password" action
 * link (the same mechanism as sendPressPilotPasswordReset) so the plaintext
 * temp password never travels over email. The temp password is still shown
 * once in the admin UI at creation time as a fallback.
 *
 * Non-throwing by design at the call sites: email delivery failures should
 * never roll back an already-created org/user. Callers should wrap this in
 * try/catch and surface `welcomeEmailSent: false` in their response rather
 * than letting a SendGrid outage fail the whole provisioning flow.
 */
export async function sendWelcomeEmail(params: {
  org: OrgLike;
  toEmail: string;
  toName: string;
  isNewOrg: boolean;
}): Promise<void> {
  const { org, toEmail, toName, isNewOrg } = params;

  const key = getSendGridKey();
  const fromEmail = getFromEmail();
  if (!key || !fromEmail) {
    throw new Error('Email is not configured (missing SendGrid key or from-address).');
  }
  sgMail.setApiKey(key);

  const setPasswordLink = await admin.auth().generatePasswordResetLink(toEmail, {
    url: `${appUrl}/login`,
  });

  const orgName = escapeHtml(org.name || 'your organisation');
  const safeName = escapeHtml(toName || '');

  const introLine = isNewOrg
    ? `Your organisation, <strong>${orgName}</strong>, has just been set up on Press Pilot, and you've been added as an Admin.`
    : `You've been added as an Admin on <strong>${orgName}</strong>'s Press Pilot account.`;

  const body = `
    <p style="margin-top:0;">Hi ${safeName || 'there'},</p>
    <p>${introLine}</p>
    <p>Set your password to get started:</p>
    ${emailButton(org, setPasswordLink, 'Set your password')}
    <p style="font-size:13px;color:#6b7280;">Or copy and paste this link into your browser:<br>
      <a href="${setPasswordLink}" style="color:#6b7280;word-break:break-all;">${setPasswordLink}</a>
    </p>
    <p style="font-size:13px;color:#6b7280;">This link expires in 1 hour. Once it's set, log in at <a href="${appUrl}/login">${appUrl.replace(/^https?:\/\//, '')}/login</a> with ${escapeHtml(toEmail)}.</p>
  `;

  const html = emailWrapper(org, 'Welcome to Press Pilot', body);

  const text = `Hi ${toName || 'there'},\n\n${isNewOrg
    ? `Your organisation, ${org.name || 'your organisation'}, has just been set up on Press Pilot, and you've been added as an Admin.`
    : `You've been added as an Admin on ${org.name || 'your organisation'}'s Press Pilot account.`
  }\n\nSet your password: ${setPasswordLink}\n\nThis link expires in 1 hour. Once it's set, log in at ${appUrl}/login with ${toEmail}.\n\nPress Pilot`;

  await sendWithRetry({
    to: toEmail,
    from: { email: fromEmail, name: 'Press Pilot' },
    subject: `Welcome to Press Pilot${org.name ? ` — ${org.name}` : ''}`,
    html,
    text,
    trackingSettings: {
      // Same reasoning as the password-reset email: don't rewrite the
      // one-time action link through a click-tracking redirect.
      clickTracking: { enable: false },
      openTracking: { enable: true },
    },
  } as any);
}
