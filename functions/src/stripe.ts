import Stripe from 'stripe';
import type { SelfServeTierId } from './tiers';

/**
 * Secret names bound to billing functions via `.runWith({ secrets: [...] })`.
 * The values live in Google Secret Manager (set with `firebase functions:secrets:set`).
 */
export const STRIPE_SECRET_KEY = 'STRIPE_SECRET_KEY';
export const STRIPE_WEBHOOK_SECRET = 'STRIPE_WEBHOOK_SECRET';

let cached: Stripe | null = null;

/** Lazily construct the Stripe client from the bound secret. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  if (!cached) {
    cached = new Stripe(key);
  }
  return cached;
}

/**
 * Tier → Stripe Price ID, read from non-secret env vars (functions/.env).
 * Swapping test → live is just changing these values, no code change.
 *
 * Only the self-serve tiers have a Stripe price — 'enterprise' deals are
 * invoiced manually and deliberately excluded from this table so a self-serve
 * signup can never resolve a price for it (see billing.ts's plan validation).
 */
const PRICE_ENV: Record<SelfServeTierId, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  professional: 'STRIPE_PRICE_PROFESSIONAL',
  organisation: 'STRIPE_PRICE_ORGANISATION',
};

export function priceIdForTier(tier: SelfServeTierId): string {
  const id = process.env[PRICE_ENV[tier]];
  if (!id) {
    throw new Error(`Missing Stripe price env var ${PRICE_ENV[tier]} for tier "${tier}".`);
  }
  return id;
}

/** Reverse lookup: Stripe Price ID → tier (used by the webhook). Never returns 'enterprise'. */
export function tierForPriceId(priceId: string | null | undefined): SelfServeTierId | null {
  if (!priceId) return null;
  const tiers: SelfServeTierId[] = ['starter', 'professional', 'organisation'];
  for (const tier of tiers) {
    if (process.env[PRICE_ENV[tier]] === priceId) return tier;
  }
  return null;
}
