'use client';

import { doc } from 'firebase/firestore';
import { useFirebase, useMemoFirebase, useDoc } from '@/firebase';
import { useOrganization } from '@/hooks/use-organization';
import { DEFAULT_VERTICAL, getVerticalConfig } from '@/lib/verticals';
import type { VerticalConfig } from '@/lib/verticals';

/**
 * Returns the VerticalConfig for the given org, falling back to the DMO default
 * while loading. Chains onto the existing useOrganization subscription — no
 * extra Firestore read for the org. Also subscribes to /platform/config to pick
 * up any category overrides set by super admin.
 */
export function useVerticalConfig(orgId: string | null | undefined): {
  config: VerticalConfig;
  isLoading: boolean;
} {
  const { firestore } = useFirebase();
  const { organization, isLoading: isOrgLoading } = useOrganization(orgId);

  const platformConfigRef = useMemoFirebase(
    () => doc(firestore, 'platform', 'config'),
    [firestore]
  );
  const { data: platformConfig, isLoading: isPlatformLoading } = useDoc(platformConfigRef);

  const verticalId = organization?.vertical;
  const baseConfig = isOrgLoading ? DEFAULT_VERTICAL : getVerticalConfig(verticalId);

  // Override partnerCategories from Firestore if present
  const storedCategories = (platformConfig as any)?.verticals?.[verticalId || 'dmo']?.partnerCategories;
  const config: VerticalConfig =
    Array.isArray(storedCategories) && storedCategories.length > 0
      ? { ...baseConfig, partnerCategories: storedCategories }
      : baseConfig;

  return { config, isLoading: isOrgLoading || isPlatformLoading };
}
