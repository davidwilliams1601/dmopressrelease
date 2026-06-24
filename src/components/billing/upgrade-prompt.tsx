'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { firstTierWithFeature, type FeatureKey } from '@/lib/tiers';

type Props = {
  feature: FeatureKey;
  /** Optional override of the default "Available on X and above." message. */
  message?: string;
  className?: string;
};

/**
 * Inline prompt shown in place of (or alongside) a feature the current plan
 * doesn't include. Links to the billing page to upgrade.
 */
export function UpgradePrompt({ feature, message, className }: Props) {
  const tier = firstTierWithFeature(feature);
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-dashed bg-muted/40 p-4',
        className
      )}
    >
      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 text-sm text-muted-foreground">
        {message ?? (
          <>
            Available on the{' '}
            <span className="font-medium text-foreground">{tier.name}</span> plan
            and above.
          </>
        )}
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/dashboard/settings/billing">Upgrade</Link>
      </Button>
    </div>
  );
}
