'use client';

import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { OrgBillingState } from '@/lib/types';

/**
 * Reads the org's private billing state (orgs/{orgId}/billing/state) — Stripe
 * subscription status, trial end, card-on-file. Only the org's own team can read it.
 */
export function useOrgBilling(orgId: string | null | undefined) {
  const { firestore } = useFirebase();

  const ref = useMemoFirebase(
    () => (orgId ? doc(firestore, 'orgs', orgId, 'billing', 'state') : null),
    [firestore, orgId]
  );

  const billingDoc = useDoc<OrgBillingState>(ref);

  return {
    billing: billingDoc.data,
    isLoading: billingDoc.isLoading,
  };
}
