'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toDate } from '@/lib/utils';
import { useUserData } from '@/hooks/use-user-data';
import { useOrganization } from '@/hooks/use-organization';
import { useBillingPortal } from '@/hooks/use-billing-portal';

function daysUntil(ts: any): number | null {
  if (!ts) return null;
  return Math.ceil((toDate(ts).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Dashboard banner that nudges trial users to add payment as the trial ends,
 * and warns on payment failure / paused / cancelled subscriptions.
 * Renders nothing for active subscriptions or orgs without billing info.
 */
export function TrialBanner() {
  const { orgId } = useUserData();
  const { organization } = useOrganization(orgId);
  const { openPortal, isLoading } = useBillingPortal();

  const status = organization?.subscriptionStatus;
  if (!status || status === 'active') return null;

  let tone: 'info' | 'warn' | 'danger' = 'info';
  let message = '';
  let cta = 'Add payment method';

  if (status === 'trialing') {
    const days = daysUntil(organization?.trialEndsAt);
    if (days === null) return null;
    tone = days <= 3 ? 'danger' : days <= 7 ? 'warn' : 'info';
    message =
      days <= 0
        ? 'Your free trial has ended. Add a payment method to keep your account active.'
        : `${days} day${days === 1 ? '' : 's'} left in your free trial. Add a payment method to keep your account after it ends.`;
  } else if (status === 'past_due') {
    tone = 'danger';
    message = 'Your last payment failed. Please update your payment method to avoid losing access.';
    cta = 'Update payment';
  } else if (status === 'paused' || status === 'canceled') {
    tone = 'danger';
    message =
      status === 'paused'
        ? 'Your trial ended without a payment method and your account is paused. Add a card to reactivate.'
        : 'Your subscription has been cancelled. Reactivate to continue using PressPilot.';
    cta = 'Reactivate';
  } else if (status === 'incomplete') {
    tone = 'warn';
    message = 'Your subscription setup is incomplete. Add a payment method to finish.';
  }

  const styles = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
  }[tone];

  const Icon = tone === 'info' ? Clock : AlertTriangle;

  return (
    <div className={cn('flex items-center gap-3 rounded-lg border px-4 py-3 text-sm', styles)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <Button size="sm" variant="outline" onClick={openPortal} disabled={isLoading}>
        {isLoading ? 'Opening…' : cta}
      </Button>
    </div>
  );
}
