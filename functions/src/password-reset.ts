import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { sendWithRetry } from './sendgrid-retry';
import { escapeHtml } from './html-utils';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

function getSendGridKey(): string | null {
  return functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY || null;
}

function getFromEmail(): string | null {
  return functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL || null;
}

const BRAND_PRIMARY = '#2563eb';

/**
 * Sends a Press Pilot password reset email via SendGrid instead of relying on
 * Firebase Auth's built-in template.
 *
 * Firebase Auth's default password reset email is sent from a shared
 * noreply@<project-id>.firebaseapp.com address with a bare, unbranded template
 * ("Reset your password for project-XXXXXXXXX") — mail providers routinely
 * flag this as spam because that shared sending domain has no reputation tied
 * to Press Pilot specifically. This generates the actual reset action link
 * with the Admin SDK, then sends it ourselves through the same
 * domain-authenticated SendGrid sender used for every other Press Pilot email,
 * so it lands in the inbox and reads as coming from Press Pilot.
 *
 * Public (no auth required) — the user is signed out when requesting a reset.
 * Deliberately does not reveal whether an account exists for the given email
 * (returns success either way) to avoid account enumeration.
 *
 * Input: { email: string }
 */
export const sendPressPilotPasswordReset = functions.https.onCall(async (data) => {
  const email = (data?.email || '').trim();
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email is required.');
  }

  const key = getSendGridKey();
  const fromEmail = getFromEmail();
  if (!key || !fromEmail) {
    throw new functions.https.HttpsError('failed-precondition', 'Email is not configured.');
  }

  let resetLink: string;
  try {
    resetLink = await admin.auth().generatePasswordResetLink(email, {
      url: `${appUrl}/login`,
    });
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      // Don't reveal whether the account exists — behave the same as a successful send.
      return { success: true };
    }
    console.error('[sendPressPilotPasswordReset] Failed to generate reset link:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate reset link. Please try again.');
  }

  sgMail.setApiKey(key);
  const safeEmail = escapeHtml(email);

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:${BRAND_PRIMARY};padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Press Pilot</h1>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 8px 8px;">
        <p style="margin-top:0;">Hi there,</p>
        <p>We received a request to reset the password for your Press Pilot account (${safeEmail}).</p>
        <div style="margin:24px 0;">
          <a href="${resetLink}" style="display:inline-block;background:${BRAND_PRIMARY};color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Reset your password</a>
        </div>
        <p style="font-size:13px;color:#6b7280;">Or copy and paste this link into your browser:<br>
          <a href="${resetLink}" style="color:${BRAND_PRIMARY};word-break:break-all;">${resetLink}</a>
        </p>
        <p style="font-size:13px;color:#6b7280;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>
      </div>
      <div style="text-align:center;padding:20px;font-size:12px;color:#94a3b8;">
        Press Pilot &middot; <a href="${appUrl}/login" style="color:#94a3b8;">app.press-pilot.com</a>
      </div>
    </body>
    </html>
  `;

  const text = `Hi there,\n\nWe received a request to reset the password for your Press Pilot account (${email}).\n\nReset your password: ${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.\n\nPress Pilot`;

  try {
    await sendWithRetry({
      to: email,
      from: { email: fromEmail, name: 'Press Pilot' },
      subject: 'Reset your Press Pilot password',
      html,
      text,
      trackingSettings: {
        // Leave the one-time reset link untouched — some corporate mail-security
        // scanners pre-fetch/"click" links in transit, and rewriting this one
        // through a SendGrid tracking redirect can burn the single-use token
        // before the real user ever clicks it.
        clickTracking: { enable: false },
        openTracking: { enable: true },
      },
    } as any);
  } catch (error: any) {
    console.error(`[sendPressPilotPasswordReset] Failed to send to ${email} after retries:`, error);
    throw new functions.https.HttpsError('internal', 'Failed to send the reset email. Please try again.');
  }

  return { success: true };
});
