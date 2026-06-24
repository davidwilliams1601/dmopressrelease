/**
 * Canonical subscription tier definitions for Cloud Functions (server-side).
 *
 * MIRROR of src/lib/tiers.ts — the two build roots cannot share imports, so keep
 * these in sync. This copy is the authority for what the billing webhook writes
 * onto an org (tier limits) and for server-side limit enforcement.
 */

export type TierId = 'starter' | 'professional' | 'organisation';

export type TierLimits = {
  maxPartners: number | null; // null = unlimited
  maxUsers: number | null; // null = unlimited
};

export const TIER_LIMITS: Record<TierId, TierLimits> = {
  starter: { maxPartners: 25, maxUsers: 2 },
  professional: { maxPartners: 100, maxUsers: 5 },
  organisation: { maxPartners: null, maxUsers: null },
};

export const TIER_FEATURES: Record<TierId, {
  approvalWorkflows: boolean;
  advancedReporting: boolean;
  customContentTypes: boolean;
  whitelabel: boolean;
}> = {
  starter: { approvalWorkflows: false, advancedReporting: false, customContentTypes: false, whitelabel: false },
  professional: { approvalWorkflows: true, advancedReporting: true, customContentTypes: true, whitelabel: false },
  organisation: { approvalWorkflows: true, advancedReporting: true, customContentTypes: true, whitelabel: true },
};

export const DEFAULT_TIER: TierId = 'starter';

export function isTierId(value: unknown): value is TierId {
  return value === 'starter' || value === 'professional' || value === 'organisation';
}

export function getTierLimits(tier?: string | null): TierLimits {
  return isTierId(tier) ? TIER_LIMITS[tier] : TIER_LIMITS[DEFAULT_TIER];
}
