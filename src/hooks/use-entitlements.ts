'use client';

import { useUserData } from '@/hooks/use-user-data';
import { useOrganization } from '@/hooks/use-organization';
import { getTierConfig, getTierAttribution, type FeatureKey, type TierConfig } from '@/lib/tiers';
import type { AttributionLevel } from '@/lib/brand-utils';
import type { Organization } from '@/lib/types';

export type Entitlements = {
  tier: TierConfig['id'];
  tierConfig: TierConfig;
  /** Effective limits — explicit values on the org override tier defaults. */
  maxPartners: number | null;
  maxUsers: number | null;
  attribution: AttributionLevel;
  /** True if the org's tier includes the given feature. */
  can: (feature: FeatureKey) => boolean;
};

/** Pure entitlements derivation for components that already hold the org. */
export function getEntitlements(org?: Organization | null): Entitlements {
  const tierConfig = getTierConfig(org?.tier);
  const maxPartners =
    org?.maxPartners !== undefined ? org.maxPartners : tierConfig.maxPartners;
  const maxUsers =
    org?.maxUsers !== undefined ? org.maxUsers : tierConfig.maxUsers;
  return {
    tier: tierConfig.id,
    tierConfig,
    maxPartners,
    maxUsers,
    attribution: getTierAttribution(org?.tier),
    can: (feature) => tierConfig.features[feature],
  };
}

/** Entitlements for the current user's organisation. */
export function useEntitlements(): Entitlements & { isLoading: boolean } {
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { organization, isLoading: isOrgLoading } = useOrganization(orgId);
  return {
    ...getEntitlements(organization),
    isLoading: isUserLoading || isOrgLoading,
  };
}
