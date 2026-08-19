import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import sgMail from '@sendgrid/mail';
import { callWithRetry } from './ai-helpers';
import { GEMINI_MODEL } from './ai-config';
import { sendWithRetry } from './sendgrid-retry';
import { escapeHtml } from './html-utils';
import { emailHeader, emailFooter, emailButton, emailCallout, getEmailColors } from './email-branding';

const db = admin.firestore();
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

function getSendGridKey(): string | null {
  return functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY || null;
}

function getFromEmail(): string | null {
  return functions.config().sendgrid?.from_email || process.env.SENDGRID_FROM_EMAIL || null;
}

/**
 * Cloud Function to create a partner invite link.
 * Only organization admins can create invites.
 */
export const createPartnerInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to create invites.'
    );
  }

  const { orgId, label, expiresAt, maxUses } = data;

  if (!orgId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required field: orgId'
    );
  }

  try {
    // Verify the caller is an admin of the organization
    const callerUserDoc = await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(context.auth.uid)
      .get();

    if (!callerUserDoc.exists || callerUserDoc.data()?.role !== 'Admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only organization admins can create partner invites.'
      );
    }

    // Get org slug for the invite code prefix
    const orgDoc = await db.collection('orgs').doc(orgId).get();
    const orgSlug = orgDoc.data()?.slug || orgId;
    const prefix = orgSlug.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Generate a unique invite code
    const randomPart = crypto.randomBytes(4).toString('hex');
    const code = `${prefix}-${randomPart}`;

    // Create the invite document
    const inviteRef = db.collection('orgs').doc(orgId).collection('invites').doc();
    const inviteData: Record<string, any> = {
      id: inviteRef.id,
      orgId,
      code,
      createdBy: context.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      useCount: 0,
      status: 'active',
    };

    if (label) inviteData.label = label;
    if (expiresAt) inviteData.expiresAt = new Date(expiresAt);
    if (maxUses && maxUses > 0) inviteData.maxUses = maxUses;

    await inviteRef.set(inviteData);

    console.log(`Partner invite created: ${code} for org ${orgId}`);

    return {
      success: true,
      inviteId: inviteRef.id,
      code,
      message: 'Partner invite created successfully',
    };
  } catch (error: any) {
    console.error('Error creating partner invite:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError(
      'internal',
      `Failed to create partner invite: ${error.message}`
    );
  }
});

/**
 * Cloud Function to look up an invite code before redeeming it.
 * Read-only, public (no auth) — lets the signup form show the right
 * organisation name and vertical-specific copy before the partner submits.
 * Does not increment use count or expose sensitive org data.
 *
 * Input: { code: string }
 */
export const getPartnerInviteInfo = functions.https.onCall(async (data) => {
  const { code } = data;
  if (!code) {
    throw new functions.https.HttpsError('invalid-argument', 'code is required.');
  }

  const inviteQuery = await db
    .collectionGroup('invites')
    .where('code', '==', code)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (inviteQuery.empty) {
    return { valid: false, reason: 'not-found' as const };
  }

  const invite = inviteQuery.docs[0].data();

  if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
    return { valid: false, reason: 'expired' as const };
  }
  if (invite.maxUses && invite.useCount >= invite.maxUses) {
    return { valid: false, reason: 'maxed-out' as const };
  }

  const orgDoc = await db.collection('orgs').doc(invite.orgId).get();
  if (!orgDoc.exists) {
    return { valid: false, reason: 'not-found' as const };
  }
  const orgData = orgDoc.data()!;

  return {
    valid: true as const,
    orgName: orgData.name || null,
    vertical: (orgData.vertical as string | undefined) || 'dmo',
  };
});

/**
 * Cloud Function to send (or resend) a partner invite by email directly from the system,
 * with an optional personal note from the org admin.
 * Only organization admins can send invite emails.
 *
 * Input: { orgId, inviteId, partnerEmail, partnerName?, note? }
 */
export const sendPartnerInviteEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to send partner invites.'
    );
  }

  const { orgId, inviteId, partnerEmail, partnerName, note } = data;

  if (!orgId || !inviteId || !partnerEmail?.trim()) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'orgId, inviteId, and partnerEmail are required.'
    );
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(partnerEmail.trim())) {
    throw new functions.https.HttpsError('invalid-argument', 'Please provide a valid email address.');
  }

  // Verify the caller is an admin of the organization
  const callerUserDoc = await db
    .collection('orgs')
    .doc(orgId)
    .collection('users')
    .doc(context.auth.uid)
    .get();

  if (!callerUserDoc.exists || callerUserDoc.data()?.role !== 'Admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only organization admins can send partner invites.'
    );
  }

  const inviteRef = db.collection('orgs').doc(orgId).collection('invites').doc(inviteId);
  const inviteDoc = await inviteRef.get();
  if (!inviteDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Invite not found.');
  }
  const invite = inviteDoc.data()!;

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
  const replyToEmail: string | undefined = orgData.pressContact?.email;

  const inviteLink = `${appUrl}/partner-signup?code=${invite.code}`;
  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  const safePartnerName = escapeHtml((partnerName || invite.label || '').trim());
  const greetingName = safePartnerName || 'there';
  const safeOrgName = escapeHtml(orgName);

  const noteHtml = trimmedNote
    ? emailCallout(
        brandedOrg,
        `<p style="margin:0;font-size:14px;"><strong>A note from ${safeOrgName}:</strong></p>
         <p style="margin:8px 0 0;font-size:14px;">${escapeHtml(trimmedNote).replace(/\n/g, '<br>')}</p>`
      )
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      ${emailHeader(brandedOrg, "You're invited")}
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 8px 8px;">
        <p style="margin-top:0;">Hi ${greetingName},</p>
        <p>${safeOrgName} has invited you to become a partner on Press Pilot, so you can submit stories and updates directly for press coverage.</p>
        ${noteHtml}
        ${emailButton(brandedOrg, inviteLink, 'Create your account')}
        <p style="font-size:13px;color:#6b7280;">Or copy and paste this link into your browser:<br>
          <a href="${inviteLink}" style="color:${getEmailColors(brandedOrg).primary};word-break:break-all;">${inviteLink}</a>
        </p>
      </div>
      ${emailFooter(brandedOrg, { showManageLink: false })}
    </body>
    </html>
  `;

  const text = `Hi ${safePartnerName || 'there'},\n\n${orgName} has invited you to become a partner on Press Pilot, so you can submit stories and updates directly for press coverage.\n${trimmedNote ? `\nA note from ${orgName}: ${trimmedNote}\n` : ''}\nCreate your account: ${inviteLink}\n\n${orgName}`;

  try {
    await sendWithRetry({
      to: partnerEmail.trim(),
      from: { email: fromEmail, name: orgName },
      ...(replyToEmail ? { replyTo: { email: replyToEmail, name: orgName } } : {}),
      subject: `You're invited to join ${orgName} on Press Pilot`,
      html,
      text,
      customArgs: { orgId, inviteId },
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
    } as any);
  } catch (error: any) {
    console.error(`[sendPartnerInviteEmail] Failed to send to ${partnerEmail} after retries:`, error);
    throw new functions.https.HttpsError('internal', 'Failed to send the invite email. Please try again.');
  }

  await inviteRef.update({
    sentTo: partnerEmail.trim(),
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    sentBy: context.auth.uid,
    sentNote: trimmedNote || null,
    sendCount: admin.firestore.FieldValue.increment(1),
  });

  return { success: true };
});

/**
 * Cloud Function to redeem a partner invite.
 * Creates a new user account with the Partner role.
 * This function does NOT require authentication (new users calling it).
 */
async function classifyPartnerBusiness(
  description: string,
  categories: string[],
  geminiApiKey: string
): Promise<string[]> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are categorising a business based on a short description. Choose one or more categories from the list below that best describe this business. Return ONLY a JSON array of strings, e.g. ["Accommodation", "Food & Drink"]. Do not include any other text.

Categories: ${categories.join(', ')}

Business description: "${description}"`;

    const result = await callWithRetry(
      () => model.generateContent(prompt),
      null,
      'classifyPartnerBusiness',
    );

    if (!result) return ['Other'];

    const text = result.response.text().trim();

    // Extract JSON array from response
    const match = text.match(/\[.*\]/s);
    if (!match) return ['Other'];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return ['Other'];

    // Filter to only valid categories
    const valid = parsed.filter((c: any) => typeof c === 'string' && categories.includes(c));
    return valid.length > 0 ? valid : ['Other'];
  } catch (err) {
    console.warn('[classifyPartnerBusiness] Classification failed, defaulting to Other:', err);
    return ['Other'];
  }
}

export const redeemPartnerInvite = functions.https.onCall(async (data) => {
  const { code, email, password, name, consentContentUsage, consentMarketing, businessDescription } = data;

  if (!code || !email || !password || !name) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: code, email, password, name'
    );
  }

  if (!consentContentUsage) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'You must agree to the content usage terms to create a partner account.'
    );
  }

  if (password.length < 6) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Password must be at least 6 characters.'
    );
  }

  try {
    // Find the invite by code across all orgs
    const inviteQuery = await db
      .collectionGroup('invites')
      .where('code', '==', code)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (inviteQuery.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        'Invalid or expired invite code.'
      );
    }

    const inviteDoc = inviteQuery.docs[0];
    const invite = inviteDoc.data();
    const orgId = invite.orgId;

    // Check org partner limit
    const orgDoc = await db.collection('orgs').doc(orgId).get();
    const maxPartners = orgDoc.data()?.maxPartners;
    if (maxPartners && maxPartners > 0) {
      const partnerSnap = await db
        .collection('orgs')
        .doc(orgId)
        .collection('users')
        .where('role', '==', 'Partner')
        .get();
      if (partnerSnap.size >= maxPartners) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'This organisation has reached its partner capacity. Please contact them directly.'
        );
      }
    }

    // Check if invite has expired
    if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
      await inviteDoc.ref.update({ status: 'expired' });
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This invite link has expired.'
      );
    }

    // Check if invite has reached max uses
    if (invite.maxUses && invite.useCount >= invite.maxUses) {
      await inviteDoc.ref.update({ status: 'expired' });
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This invite link has reached its maximum number of uses.'
      );
    }

    // Create the Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // Create initials from name
    const initials = name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    // Set custom claims with orgId
    await admin.auth().setCustomUserClaims(userRecord.uid, { orgId });

    const now = admin.firestore.FieldValue.serverTimestamp();

    // Classify business description if provided
    const orgData = orgDoc.data()!;
    const vertical: string = orgData.vertical || 'dmo';
    const defaultCategoryMap: Record<string, string[]> = {
      dmo: ['Accommodation', 'Attraction', 'Activity & Adventure', 'Food & Drink', 'Events & Festivals', 'Transport', 'Retail', 'Spa & Wellness', 'Arts & Culture', 'Nature & Outdoor', 'Sport', 'Other'],
      charity: ['Community Group', 'Health & Wellbeing', 'Education & Training', 'Social Care', 'Environment & Conservation', 'Arts & Culture', 'Housing & Homelessness', 'International Aid', 'Other'],
      'trade-body': ['Manufacturer', 'Retailer', 'Service Provider', 'Consultant & Advisory', 'Technology', 'Media & Communications', 'Professional Services', 'Start-up & SME', 'Enterprise', 'Other'],
      publisher: ['Further Education College', 'Independent Training Provider', 'Awarding Organisation', 'Higher Education Institution', 'EdTech & Technology', 'Employer & Industry Body', 'Government & Public Sector', 'Think Tank & Research', 'Professional Association', 'Consultancy & Advisory', 'Other'],
      education: ['Primary School', 'Secondary School', 'Sixth Form / FE College', 'Special School', 'Multi-Academy Trust', 'Independent School', 'Early Years / Nursery', 'Other'],
    };
    // Read categories from Firestore platform config, falling back to hardcoded defaults
    let categories = defaultCategoryMap[vertical] || defaultCategoryMap['dmo'];
    try {
      const platformDoc = await db.collection('platform').doc('config').get();
      const storedCategories = platformDoc.data()?.verticals?.[vertical]?.partnerCategories;
      if (Array.isArray(storedCategories) && storedCategories.length > 0) {
        categories = storedCategories;
      }
    } catch (err) {
      console.warn('[redeemPartnerInvite] Could not read platform config, using defaults:', err);
    }

    let businessCategories: string[] = [];
    const cleanDescription = typeof businessDescription === 'string' ? businessDescription.trim() : '';
    if (cleanDescription) {
      const geminiApiKey = functions.config().gemini?.key || process.env.GEMINI_API_KEY;
      if (geminiApiKey) {
        businessCategories = await classifyPartnerBusiness(cleanDescription, categories, geminiApiKey);
      }
    }

    // Create the Firestore user document with Partner role
    const userDoc: Record<string, any> = {
      id: userRecord.uid,
      orgId,
      email,
      name,
      initials,
      role: 'Partner',
      inviteId: inviteDoc.id,
      consentContentUsage: true,
      consentContentUsageAt: now,
      consentMarketing: consentMarketing === true,
      consentMarketingAt: now,
      createdAt: now,
    };
    if (cleanDescription) userDoc.businessDescription = cleanDescription;
    if (businessCategories.length > 0) userDoc.businessCategories = businessCategories;

    await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(userRecord.uid)
      .set(userDoc);

    // Increment the invite use count
    await inviteDoc.ref.update({
      useCount: admin.firestore.FieldValue.increment(1),
    });

    console.log(`Partner registered: ${email} (${userRecord.uid}) for org ${orgId} via invite ${code}`);

    return {
      success: true,
      userId: userRecord.uid,
      orgId,
      message: 'Partner account created successfully',
    };
  } catch (error: any) {
    console.error('Error redeeming partner invite:', error);

    if (error instanceof functions.https.HttpsError) throw error;

    if (error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError(
        'already-exists',
        'An account with this email already exists.'
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to create partner account: ${error.message}`
    );
  }
});
