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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

type DeleteOrgDialogProps = {
  orgId: string;
  orgName: string;
  onDeleted: () => void;
};

export function DeleteOrgDialog({ orgId, orgName, onDeleted }: DeleteOrgDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const isConfirmed = confirmation === orgName;

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const deleteOrg = httpsCallable(functions, 'deleteOrg');
      await deleteOrg({ orgId });
      toast({ title: `${orgName} has been deleted.` });
      setOpen(false);
      onDeleted();
    } catch (error: any) {
      toast({
        title: 'Deletion failed',
        description: error.message || 'Failed to delete organisation.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmation(''); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Organisation</DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{orgName}</strong> and all associated data — users, releases, submissions, media requests, and storage files. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <Label htmlFor="confirm-name">
            Type <span className="font-semibold text-foreground">{orgName}</span> to confirm
          </Label>
          <Input
            id="confirm-name"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={orgName}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || isLoading}
          >
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting...</> : 'Delete Organisation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
