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
import { Loader2, MailOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * One-off super-admin action: works out unique opens and clicks for releases and
 * member emails sent before unique counting, from their stored tracking history.
 * Safe to re-run. Demo orgs are skipped.
 */
export function BackfillUniqueOpensDialog() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const run = async () => {
    setIsLoading(true);
    try {
      const backfill = httpsCallable<Record<string, never>, { orgs: number; releases: number; partnerEmails: number }>(
        getFunctions(),
        'backfillUniqueEngagement'
      );
      const { data } = await backfill({});
      toast({
        title: 'Unique opens backfilled',
        description: `${data.releases} releases and ${data.partnerEmails} member emails updated.`,
      });
    } catch (err: any) {
      console.error('Unique opens backfill failed:', err);
      toast({ title: 'Backfill failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MailOpen className="h-4 w-4" />
          Backfill Unique Opens
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Backfill unique opens?</AlertDialogTitle>
          <AlertDialogDescription>
            Works out how many recipients opened and clicked each past release and member email, counting each person once, from the tracking history already stored. Open rates then stop counting repeat opens. Nothing is sent. Safe to re-run; demo orgs are skipped.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={run} disabled={isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</> : 'Run backfill'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
