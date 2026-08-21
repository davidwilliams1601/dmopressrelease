'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useBillingPortal } from '@/hooks/use-billing-portal';

const REASON_COPY: Record<string, string> = {
  past_due: 'Your last payment failed. Update your payment method to restore access.',
  paused: 'Your trial ended without a payment method and your account has been paused. Add a card to reactivate.',
  canceled: 'Your subscription has been cancelled. Reactivate to continue using PressPilot.',
  incomplete: 'Your subscription setup is incomplete. Add a payment method to finish.',
};

/**
 * Full-dashboard blocking screen shown in place of the normal page content when
 * an org's subscription has lapsed (past_due/paused/canceled/incomplete) and it
 * has no billingLockOverride exemption. Everything is read-only except adding a
 * payment method / opening the Stripe portal — the dashboard layout still routes
 * to this component for every page other than the billing settings page itself.
 */
export function BillingLockScreen({ reason }: { reason: string | null }) {
  const { openPortal, isLoading } = useBillingPortal();
  const message = (reason && REASON_COPY[reason]) || 'Your subscription needs attention before you can continue.';

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <Card className="max-w-md border-red-200">
        <CardHeader>
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <CardTitle className="font-headline">Account paused</CardTitle>
          </div>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={openPortal} disabled={isLoading} className="w-full">
            {isLoading ? 'Opening…' : 'Add payment method'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
