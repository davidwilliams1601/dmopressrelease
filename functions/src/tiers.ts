/**
 * Canonical subscription tier definitions for Cloud Functions (server-side).
 *
 * MIRROR of src/lib/tiers.ts — the two build roots cannot share imports, so keep
 * these in sync. This copy is the authority for what the billing webhook writes
 * onto an org (tier limits) and for server-side limit enforcement.
 */

/** Tiers purchasable through the self-serve Stripe checkout flow. */
export type SelfServeTierId = 'starter' | 'professional' | 'organisation';

/**
 * 'enterprise' is a bespoke, manually-invoiced deal shape (federated-tenants
 * network roots like Auris Tech / Visit England) — never sold through Stripe
 * self-serve checkout. It exists as a real TierId so these orgs are tagged
 * correctly in reporting/entitlements instead of being miscategorised as the
 * 'organisation' self-serve plan. Its own limits/price are nominal defaults —
 * the actual contracted numbers always live directly on the org doc
 * (maxPartners/maxUsers/maxChildOrgs set via updateOrgLimits, and the real
 * invoice amount in Organization.contractValueMonthly), which override tier
 * defaults per getEntitlements' existing "explicit values win" behaviour.
 */
export type TierId = SelfServeTierId | 'enterprise';

export type TierLimits = {
  maxPartners: number | null; // null = unlimited
  maxUsers: number | null; // null = unlimited
};

export const TIER_LIMITS: Record<TierId, TierLimits> = {
  starter: { maxPartners: 25, maxUsers: 2 },
  professional: { maxPartners: 100, maxUsers: 5 },
  organisation: { maxPartners: null, maxUsers: null },
  enterprise: { maxPartners: null, maxUsers: null },
};

/**
 * Monthly price in GBP, for display/reporting only (e.g. platform-dashboard MRR
 * estimates). MIRROR of the priceMonthly field in src/lib/tiers.ts — keep in sync.
 * Enterprise has no rate-card price (0) — it's invoiced manually; see
 * Organization.contractValueMonthly for the actual contracted figure, which the
 * Networks tab already prefers over this tier-derived estimate when set.
 */
export const TIER_PRICE_MONTHLY: Record<TierId, number> = {
  starter: 149,
  professional: 349,
  organisation: 799,
  enterprise: 0,
};

export function getTierPriceMonthly(tier?: string | null): number {
  return isTierId(tier) ? TIER_PRICE_MONTHLY[tier] : 0;
}

export const TIER_FEATURES: Record<TierId, {
  approvalWorkflows: boolean;
  advancedReporting: boolean;
  customContentTypes: boolean;
  whitelabel: boolean;
}> = {
  starter: { approvalWorkflows: false, advancedReporting: false, customContentTypes: false, whitelabel: false },
  professional: { approvalWorkflows: true, advancedReporting: true, customContentTypes: true, whitelabel: false },
  organisation: { approvalWorkflows: true, advancedReporting: true, customContentTypes: true, whitelabel: true },
  enterprise: { approvalWorkflows: true, advancedReporting: true, customContentTypes: true, whitelabel: true },
};

export const DEFAULT_TIER: TierId = 'starter';

export function isTierId(value: unknown): value is TierId {
  return (
    value === 'starter' ||
    value === 'professional' ||
    value === 'organisation' ||
    value === 'enterprise'
  );
}

/** Tiers a self-serve signup or self-provisioned daughter org may be assigned. Never includes 'enterprise'. */
export function isSelfServeTierId(value: unknown): value is SelfServeTierId {
  return value === 'starter' || value === 'professional' || value === 'organisation';
}

export function getTierLimits(tier?: string | null): TierLimits {
  return isTierId(tier) ? TIER_LIMITS[tier] : TIER_LIMITS[DEFAULT_TIER];
}
