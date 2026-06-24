import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getStripe, priceIdForTier, STRIPE_SECRET_KEY } from './stripe';
import { TIER_LIMITS, isTierId, DEFAULT_TIER, type TierId } from './tiers';

const db = admin.firestore();

const TRIAL_DAYS = 30;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || 'org';
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const exists = (await db.collection('orgs').doc(candidate).get()).exists;
    if (!exists) return candidate;
  }
  // Extremely unlikely; fall back to a random suffix.
  return `${root}-${Math.random().toString(36).slice(2, 8)}`;
}

function tsFromUnix(seconds: number | null | undefined): admin.firestore.Timestamp | null {
  return seconds ? admin.firestore.Timestamp.fromMillis(seconds * 1000) : null;
}

/**
 * Self-serve signup. Creates the Auth user, the org (with claims + first admin),
 * a Stripe customer, and a 30-day trialing subscription with NO card required.
 * The client signs in with the same credentials afterwards.
 *
 * Public callable (mirrors redeemPartnerInvite). Validates everything server-side.
 */
export const createOrgWithTrial = functions
  .runWith({ secrets: [STRIPE_SECRET_KEY] })
  .https.onCall(async (data) => {
    const orgName: string = (data?.orgName || '').trim();
    const name: string = (data?.name || '').trim();
    const email: string = (data?.email || '').trim();
    const password: string = data?.password || '';
    const plan: TierId = isTierId(data?.plan) ? data.plan : DEFAULT_TIER;

    if (!orgName || !name || !email || !password) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: orgName, name, email, password.'
      );
    }
    if (password.length < 6) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Password must be at least 6 characters.'
      );
    }

    const slug = await uniqueSlug(slugify(orgName));

    // 1. Create the Auth user first so we fail fast on a duplicate email.
    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await admin.auth().createUser({ email, password, displayName: name });
    } catch (err: any) {
      if (err.code === 'auth/email-already-exists') {
        throw new functions.https.HttpsError(
          'already-exists',
          'An account with this email already exists. Please sign in instead.'
        );
      }
      throw err;
    }

    let customerId: string | undefined;
    let subscriptionId: string | undefined;
    try {
      const stripe = getStripe();

      // 2. Stripe customer + trialing subscription (no payment method up front).
      const customer = await stripe.customers.create({
        email,
        name: orgName,
        metadata: { orgId: slug, firebaseUid: userRecord.uid },
      });
      customerId = customer.id;

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceIdForTier(plan) }],
        trial_period_days: TRIAL_DAYS,
        trial_settings: { end_behavior: { missing_payment_method: 'pause' } },
        metadata: { orgId: slug },
      });
      subscriptionId = subscription.id;

      // 3. Custom claims so the client token resolves the org.
      await admin.auth().setCustomUserClaims(userRecord.uid, { orgId: slug });

      // 4. Org document — tier limits applied from the canonical config.
      const limits = TIER_LIMITS[plan];
      const orgData: Record<string, any> = {
        id: slug,
        name: orgName,
        slug,
        boilerplate: '',
        brandToneNotes: '',
        vertical: 'dmo',
        pressContact: { name, email },
        tier: plan,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status, // 'trialing'
        trialEndsAt: tsFromUnix(subscription.trial_end),
        // current_period_end moved onto subscription items in recent API versions.
        currentPeriodEnd: tsFromUnix(subscription.items.data[0]?.current_period_end),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        selfServeSignup: true,
      };
      if (limits.maxPartners != null) orgData.maxPartners = limits.maxPartners;
      if (limits.maxUsers != null) orgData.maxUsers = limits.maxUsers;
      await db.collection('orgs').doc(slug).set(orgData);

      // 5. First admin user document.
      const initials = name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      await db.collection('orgs').doc(slug).collection('users').doc(userRecord.uid).set({
        id: userRecord.uid,
        orgId: slug,
        email,
        name,
        initials,
        role: 'Admin',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Self-serve org created: ${slug} | ${email} | plan=${plan} | sub=${subscription.id}`);
      return { success: true, orgId: slug };
    } catch (error: any) {
      // Roll back so a failure doesn't leave orphans.
      console.error('createOrgWithTrial failed, rolling back:', error);
      await admin.auth().deleteUser(userRecord.uid).catch(() => undefined);
      await db.collection('orgs').doc(slug).delete().catch(() => undefined);
      if (subscriptionId) {
        await getStripe().subscriptions.cancel(subscriptionId).catch(() => undefined);
      }
      if (customerId) {
        await getStripe().customers.del(customerId).catch(() => undefined);
      }
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError(
        'internal',
        'Could not complete signup. Please try again.'
      );
    }
  });
