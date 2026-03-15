'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FlaskConical, Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

type SeedDemoDialogProps = {
  orgId: string;
  orgName: string;
  mode: 'seed' | 'reset';
  onDone: () => void;
};

export function SeedDemoDialog({ orgId, orgName, mode, onDone }: SeedDemoDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const isReset = mode === 'reset';

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const fn = httpsCallable(functions, isReset ? 'resetDemoOrg' : 'seedDemoData');
      await fn({ orgId });
      toast({
        title: isReset ? 'Demo data reset' : 'Demo data seeded',
        description: `${orgName} is ready for a demo.`,
      });
      setOpen(false);
      onDone();
    } catch (error: any) {
      toast({
        title: isReset ? 'Reset failed' : 'Seeding failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isReset ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Demo
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" />
            Seed Demo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isReset ? 'Reset Demo Data' : 'Seed Demo Data'}</DialogTitle>
          <DialogDescription>
            {isReset
              ? `This will wipe all releases, outlet lists, submissions, and partner accounts from ${orgName} and replace them with fresh demo data. Admin users will not be affected. Use this before a demo call.`
              : `This will add demo releases, partners, outlet lists, and submissions to ${orgName}. Only use this on demo organisations — not real customer accounts.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {isReset ? 'Resetting...' : 'Seeding...'}</>
            ) : (
              isReset ? 'Reset Demo Data' : 'Seed Demo Data'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
