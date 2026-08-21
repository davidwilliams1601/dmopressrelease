'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { SelfServeTierId } from '@/lib/tiers';

/**
 * Switches the org's Stripe subscription to a different self-serve tier's price
 * (prorated) via the changeSubscriptionPlan callable. Used by the Upgrade/Downgrade
 * buttons on the billing page's tier-comparison cards.
 */
export function useChangePlan() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const changePlan = async (targetTier: SelfServeTierId): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const change = httpsCallable(functions, 'changeSubscriptionPlan');
      await change({ targetTier });
      toast({ title: 'Plan updated', description: `You're now on the ${targetTier} plan.` });
      return true;
    } catch (e: any) {
      const msg =
        e?.code === 'functions/failed-precondition'
          ? e?.message || 'Add a payment method before changing your plan.'
          : e?.message || 'Please try again.';
      toast({ variant: 'destructive', title: 'Could not change plan', description: msg });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return { changePlan, isLoading };
}
