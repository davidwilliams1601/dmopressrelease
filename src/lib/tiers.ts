import { getAttribution, type AttributionLevel } from '@/lib/brand-utils';

/**
 * Canonical subscription tier definitions — the single source of truth for
 * plan limits and feature entitlements on the FRONTEND.
 *
 * NOTE: Cloud Functions cannot import this file (isolated build root), so a
 * mirror lives in `functions/src/tiers.ts`. Keep the two in sync.
 *
 * The org's `tier` field drives access. Numeric limits are also written onto the
 * org doc (maxPartners/maxUsers) by the billing webhook so server-side guards can
 * enforce them without needing this table; explicit values on the org override
 * the tier defaults (used for bespoke Enterprise deals).
 */

/** Tiers purchasable through the self-serve Stripe checkout flow. */
export type SelfServeTierId = 'starter' | 'professional' | 'organisation';

/**
 * 'enterprise' is a bespoke, manually-invoiced deal shape (federated-tenants
 * network roots like Auris Tech) — never sold through self-serve signup. Its
 * limits/price below are nominal defaults; the real numbers always live
 * directly on the org doc (maxPartners/maxUsers, Organization.contractValueMonthly),
 * which override tier defaults per getEntitlements' "explicit values win" rule.
 */
export type TierId = SelfServeTierId | 'enterprise';

export type FeatureKey =
  | 'approvalWorkflows'
  | 'advancedReporting'
  | 'customContentTypes'
  | 'whitelabel';

export type TierConfig = {
  id: TierId;
  name: string;
  /** Monthly price in GBP, for display. */
  priceMonthly: number;
  /** null = unlimited */
  maxPartners: number | null;
  /** null = unlimited */
  maxUsers: number | null;
  features: Record<FeatureKey, boolean>;
};

export const TIERS: Record<TierId, TierConfig> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 149,
    maxPartners: 25,
    maxUsers: 2,
    features: {
      approvalWorkflows: false,
      advancedReporting: false,
      customContentTypes: false,
      whitelabel: false,
    },
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    priceMonthly: 349,
    maxPartners: 100,
    maxUsers: 5,
    features: {
      approvalWorkflows: true,
      advancedReporting: true,
      customContentTypes: true,
      whitelabel: false,
    },
  },
  organisation: {
    id: 'organisation',
    name: 'Organisation',
    priceMonthly: 799,
    maxPartners: null,
    maxUsers: null,
    features: {
      approvalWorkflows: true,
      advancedReporting: true,
      customContentTypes: true,
      whitelabel: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    // Not a rate-card price — invoiced manually per deal. Not shown on the
    // self-serve pricing grid (TIER_ORDER on the billing page excludes it).
    priceMonthly: 0,
    maxPartners: null,
    maxUsers: null,
    features: {
      approvalWorkflows: true,
      advancedReporting: true,
      customContentTypes: true,
      whitelabel: true,
    },
  },
};

export const DEFAULT_TIER: TierId = 'starter';

export function getTierConfig(tier?: string | null): TierConfig {
  if (tier && tier in TIERS) return TIERS[tier as TierId];
  return TIERS[DEFAULT_TIER];
}

/** Tiers a self-serve signup flow may offer/accept. Never includes 'enterprise'. */
export function isSelfServeTierId(value: unknown): value is SelfServeTierId {
  return value === 'starter' || value === 'professional' || value === 'organisation';
}

/** Attribution level for a tier — reuses the existing brand-utils mapping. */
export function getTierAttribution(tier?: string | null): AttributionLevel {
  // Enterprise gets the same full whitelabel/no-attribution treatment as Organisation.
  return getAttribution(tier === 'enterprise' ? 'organisation' : tier);
}

/** The next tier up, for "upgrade to unlock" prompts. null if already top. */
export function getNextTier(tier?: string | null): TierConfig | null {
  const order: TierId[] = ['starter', 'professional', 'organisation'];
  const current = getTierConfig(tier).id;
  const idx = order.indexOf(current);
  return idx >= 0 && idx < order.length - 1 ? TIERS[order[idx + 1]] : null;
}

/** First tier that includes a given feature — for "available on X" messaging. */
export function firstTierWithFeature(feature: FeatureKey): TierConfig {
  const order: TierId[] = ['starter', 'professional', 'organisation'];
  for (const id of order) {
    if (TIERS[id].features[feature]) return TIERS[id];
  }
  return TIERS.organisation;
}
