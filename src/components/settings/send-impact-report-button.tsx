'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TrendingUp, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type SendImpactReportButtonProps = {
  orgId: string;
  partnerCount: number;
};

export function SendImpactReportButton({ orgId, partnerCount }: SendImpactReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    partnerCount: number;
    monthLabel: string;
  } | null>(null);
  const { toast } = useToast();

  // Calculate previous month label for display
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthLabel = prevMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const handleSend = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const trigger = httpsCallable<
        { orgId: string },
        { sentCount: number; failedCount: number; skippedCount: number; partnerCount: number; monthLabel: string }
      >(functions, 'triggerPartnerImpactReport');
      const res = await trigger({ orgId });
      setResult(res.data);
    } catch (error: any) {
      toast({
        title: 'Error sending impact reports',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <TrendingUp className="h-4 w-4" />
          Send Impact Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Impact reports sent
              </DialogTitle>
              <DialogDescription>
                {result.sentCount} of {result.partnerCount} partner{result.partnerCount !== 1 ? 's' : ''} received their {result.monthLabel} impact report.
                {result.skippedCount > 0 && (
                  <span className="block mt-1 text-muted-foreground">
                    {result.skippedCount} partner{result.skippedCount !== 1 ? 's were' : ' was'} skipped (no submissions or missing email).
                  </span>
                )}
                {result.failedCount > 0 && (
                  <span className="block mt-1 text-destructive">
                    {result.failedCount} email{result.failedCount !== 1 ? 's' : ''} failed to send.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send Monthly Impact Report</DialogTitle>
              <DialogDescription>
                Each partner will receive a personalised email showing the impact of their content last month — which releases it appeared in, how many journalists saw it, and engagement stats.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm">
                <strong>Report period:</strong> {monthLabel}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {partnerCount} partner{partnerCount !== 1 ? 's' : ''} in this organisation. Partners with no submissions or featured content will be skipped.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSend} disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                ) : (
                  `Send ${monthLabel} Reports`
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
