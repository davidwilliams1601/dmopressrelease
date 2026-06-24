'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Check } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserData } from '@/hooks/use-user-data';
import { useOrganization } from '@/hooks/use-organization';
import { getEntitlements } from '@/hooks/use-entitlements';
import { TIERS, type TierId } from '@/lib/tiers';

const TIER_ORDER: TierId[] = ['starter', 'professional', 'organisation'];

const FEATURE_LABELS: Record<string, string> = {
  approvalWorkflows: 'Approval workflows',
  advancedReporting: 'Advanced reporting',
  customContentTypes: 'Custom content types',
  whitelabel: 'Full whitelabel',
};

export default function BillingPage() {
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { organization, isLoading: isOrgLoading } = useOrganization(orgId);

  if (isUserLoading || isOrgLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-headline font-bold">Plan &amp; Billing</h1>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const entitlements = getEntitlements(organization);
  const current = entitlements.tierConfig;

  const fmtLimit = (n: number | null) => (n === null ? 'Unlimited' : String(n));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-headline font-bold">Plan &amp; Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and see what your plan includes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-headline">Current plan</CardTitle>
              <CardDescription>
                {current.name} — £{current.priceMonthly}/month
              </CardDescription>
            </div>
            <Badge variant="secondary" className="capitalize">{current.name}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Partner accounts</span>
            <span>{fmtLimit(entitlements.maxPartners)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Team users</span>
            <span>{fmtLimit(entitlements.maxUsers)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {TIER_ORDER.map((id) => {
          const tier = TIERS[id];
          const isCurrent = tier.id === current.id;
          return (
            <Card key={id} className={isCurrent ? 'border-primary' : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-headline text-lg">{tier.name}</CardTitle>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <CardDescription>£{tier.priceMonthly}/month</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1.5">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {fmtLimit(tier.maxPartners)} partner accounts
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {fmtLimit(tier.maxUsers)} team users
                  </li>
                  {Object.entries(tier.features)
                    .filter(([, on]) => on)
                    .map(([key]) => (
                      <li key={key} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        {FEATURE_LABELS[key] ?? key}
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-lg">Need a bespoke plan?</CardTitle>
          <CardDescription>
            For large national organisations we offer custom Enterprise pricing per member.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="mailto:david@press-pilot.com?subject=PressPilot Enterprise enquiry">
              Contact us
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
