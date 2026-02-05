'use client';

import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Organization } from '@/lib/types';

/**
 * Hook to fetch organization data from Firestore.
 * @param orgId - The organization ID to fetch
 */
export function useOrganization(orgId: string | null | undefined) {
  const { firestore } = useFirebase();

  const orgDoc = useDoc<Organization>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return doc(firestore, 'orgs', orgId);
    }, [firestore, orgId])
  );

  return {
    organization: orgDoc.data,
    isLoading: orgDoc.isLoading,
    error: orgDoc.error,
  };
}
