'use client';

import { useOrgBilling } from '@/hooks/use-org-billing';
import type { Organization } from '@/lib/types';

/**
 * Computes whether an org's dashboard should be read-only-locked behind a
 * "reactivate your subscription" screen.
 *
 * Locked only when ALL of:
 *  - the org is on a self-serve tier (starter/professional/organisation) — an
 *    'enterprise' org is manually invoiced and never governed by Stripe status
 *  - a billing/state doc exists with a definite lapsed status (past_due, paused,
 *    canceled, or incomplete) — an org with no billing doc at all (pre-backfill
 *    legacy org) or still trialing/active is never locked
 *  - the org does NOT have `billingLockOverride: true` set — David's manual
 *    per-account exemption for orgs he personally commissions/manages
 */
const LAPSED_STATUSES = new Set(['past_due', 'paused', 'canceled', 'incomplete']);

export function useBillingLock(orgId: string | null | undefined, organization: Organization | null | undefined) {
  const { billing, isLoading } = useOrgBilling(orgId);

  if (isLoading || !organization) {
    return { isLocked: false, isLoading, reason: null as string | null };
  }

  if (organization.tier === 'enterprise') {
    return { isLocked: false, isLoading, reason: null };
  }

  if (organization.billingLockOverride) {
    return { isLocked: false, isLoading, reason: null };
  }

  const status = billing?.subscriptionStatus;
  if (!status || !LAPSED_STATUSES.has(status)) {
    return { isLocked: false, isLoading, reason: null };
  }

  return { isLocked: true, isLoading, reason: status };
}
