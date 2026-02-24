'use client';

import { useOrganization } from '@/hooks/use-organization';
import { DEFAULT_VERTICAL, getVerticalConfig } from '@/lib/verticals';
import type { VerticalConfig } from '@/lib/verticals';

/**
 * Returns the VerticalConfig for the given org, falling back to the DMO default
 * while loading. Chains onto the existing useOrganization subscription — no
 * extra Firestore read.
 */
export function useVerticalConfig(orgId: string | null | undefined): {
  config: VerticalConfig;
  isLoading: boolean;
} {
  const { organization, isLoading } = useOrganization(orgId);
  const config = isLoading ? DEFAULT_VERTICAL : getVerticalConfig(organization?.vertical);
  return { config, isLoading };
}
