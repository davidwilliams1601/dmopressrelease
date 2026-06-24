import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import {
  getStripe,
  priceIdForTier,
  tierForPriceId,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
} from './stripe';
import { TIER_LIMITS, isTierId, DEFAULT_TIER, type TierId } from './tiers';

const APP_URL = 'https://app.press-pilot.com';

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

/**
 * Create a Stripe Customer Portal session so an admin can add a card (to convert
 * a trial), change plan, or cancel. Returns the hosted portal URL.
 */
export const createBillingPortalSession = functions
  .runWith({ secrets: [STRIPE_SECRET_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
    }
    const orgId = context.auth.token.orgId as string | undefined;
    if (!orgId) {
      throw new functions.https.HttpsError('failed-precondition', 'No organisation found for this account.');
    }

    // Only admins may manage billing.
    const userSnap = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
    if (userSnap.data()?.role !== 'Admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can manage billing.');
    }

    const orgSnap = await db.collection('orgs').doc(orgId).get();
    const customerId = orgSnap.data()?.stripeCustomerId as string | undefined;
    if (!customerId) {
      throw new functions.https.HttpsError('failed-precondition', 'No billing account found for this organisation.');
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: data?.returnUrl || `${APP_URL}/dashboard/settings/billing`,
    });
    return { url: session.url };
  });

/** Find the org doc for a subscription via metadata.orgId, falling back to the customer id. */
async function findOrgRefForSubscription(
  sub: Stripe.Subscription
): Promise<admin.firestore.DocumentReference | null> {
  const orgId = sub.metadata?.orgId;
  if (orgId) {
    const ref = db.collection('orgs').doc(orgId);
    if ((await ref.get()).exists) return ref;
  }
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const q = await db.collection('orgs').where('stripeCustomerId', '==', customerId).limit(1).get();
  return q.empty ? null : q.docs[0].ref;
}

/** Sync subscription state (status, tier, limits, trial/period end) onto the org. */
async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const ref = await findOrgRefForSubscription(sub);
  if (!ref) {
    console.warn(`[stripeWebhook] No org found for subscription ${sub.id}`);
    return;
  }
  const tier = tierForPriceId(sub.items.data[0]?.price?.id);
  const update: Record<string, any> = {
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    trialEndsAt: tsFromUnix(sub.trial_end),
    currentPeriodEnd: tsFromUnix(sub.items.data[0]?.current_period_end),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (tier) {
    update.tier = tier;
    update.maxPartners = TIER_LIMITS[tier].maxPartners; // null = unlimited
    update.maxUsers = TIER_LIMITS[tier].maxUsers;
  }
  await ref.set(update, { merge: true });
  console.log(`[stripeWebhook] Synced ${ref.id}: status=${sub.status}, tier=${tier ?? 'unchanged'}`);
}

/** Track whether the org has a default payment method on file (set via the portal). */
async function handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
  const q = await db.collection('orgs').where('stripeCustomerId', '==', customer.id).limit(1).get();
  if (q.empty) return;
  const hasPaymentMethod = !!customer.invoice_settings?.default_payment_method;
  await q.docs[0].ref.set(
    { hasPaymentMethod, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  console.log(`[stripeWebhook] ${q.docs[0].id} hasPaymentMethod=${hasPaymentMethod}`);
}

/** Mark an org past_due when an invoice payment fails. */
async function markPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const q = await db.collection('orgs').where('stripeCustomerId', '==', customerId).limit(1).get();
  if (q.empty) return;
  await q.docs[0].ref.set(
    { subscriptionStatus: 'past_due', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  console.log(`[stripeWebhook] Marked ${q.docs[0].id} past_due`);
}

/**
 * Stripe webhook — keeps each org's subscription state in sync. Verifies the
 * signature against STRIPE_WEBHOOK_SECRET using the raw request body.
 */
export const stripeWebhook = functions
  .runWith({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] })
  .https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !sig) {
      res.status(400).send('Missing webhook signature or secret.');
      return;
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(req.rawBody, sig, secret);
    } catch (err: any) {
      console.error('[stripeWebhook] Signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await syncSubscription(event.data.object as Stripe.Subscription);
          break;
        case 'customer.updated':
          await handleCustomerUpdated(event.data.object as Stripe.Customer);
          break;
        case 'invoice.payment_failed':
          await markPaymentFailed(event.data.object as Stripe.Invoice);
          break;
        default:
          break; // ignore unhandled event types
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error(`[stripeWebhook] Error handling ${event.type}:`, err);
      res.status(500).send('Webhook handler error.');
    }
  });
