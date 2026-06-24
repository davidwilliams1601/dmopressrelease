'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

/**
 * Opens the Stripe Customer Portal (add card / change plan / cancel) by creating
 * a portal session server-side and redirecting to the hosted URL.
 */
export function useBillingPortal() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const openPortal = async () => {
    setIsLoading(true);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const createPortal = httpsCallable(functions, 'createBillingPortalSession');
      const res = await createPortal({ returnUrl: window.location.href });
      const url = (res.data as { url?: string })?.url;
      if (!url) throw new Error('No portal URL returned.');
      window.location.assign(url);
    } catch (e: any) {
      const msg =
        e?.code === 'functions/permission-denied'
          ? 'Only admins can manage billing.'
          : e?.message || 'Please try again.';
      toast({ variant: 'destructive', title: 'Could not open billing', description: msg });
      setIsLoading(false);
    }
  };

  return { openPortal, isLoading };
}
