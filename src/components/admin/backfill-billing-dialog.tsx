'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * One-off super-admin action: creates a Stripe customer (no subscription) for any
 * self-serve-tier org that predates the self-serve billing flow and has no
 * billing/state doc yet (e.g. Visit Kent) — this is what makes the "Manage
 * billing" / "Add payment method" button on their billing page start working.
 * Idempotent, safe to click again later as new legacy orgs are discovered.
 */
export function BackfillBillingDialog({ onDone }: { onDone: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const runBackfill = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const backfill = httpsCallable<void, { processed: { orgId: string; name: string }[]; skipped: { orgId: string; reason: string }[] }>(
        functions,
        'backfillOrgBilling'
      );
      const result = await backfill();
      const { processed } = result.data;
      toast({
        title: processed.length ? 'Legacy billing backfilled' : 'Nothing to backfill',
        description: processed.length
          ? `Created Stripe customers for: ${processed.map((p) => p.name).join(', ')}.`
          : 'Every self-serve org already has a Stripe customer on file.',
      });
      onDone();
    } catch (err: any) {
      console.error('Backfill failed:', err);
      toast({ title: 'Backfill failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CreditCard className="h-4 w-4" />
          Backfill Legacy Billing
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Backfill legacy billing?</AlertDialogTitle>
          <AlertDialogDescription>
            Creates a real Stripe customer (no subscription) for every self-serve-tier org that doesn't have one yet, so their billing buttons start working. Orgs keep normal access afterwards — this doesn't start a trial or charge anyone. Safe to re-run; already-backfilled orgs are skipped.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={runBackfill} disabled={isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</> : 'Run backfill'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
