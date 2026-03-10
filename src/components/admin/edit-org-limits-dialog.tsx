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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

type EditOrgLimitsDialogProps = {
  orgId: string;
  orgName: string;
  currentMaxPartners?: number;
  currentMaxUsers?: number;
  currentTier?: string;
  onUpdated: () => void;
};

export function EditOrgLimitsDialog({
  orgId,
  orgName,
  currentMaxPartners,
  currentMaxUsers,
  currentTier,
  onUpdated,
}: EditOrgLimitsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [maxPartners, setMaxPartners] = useState(
    currentMaxPartners != null ? String(currentMaxPartners) : ''
  );
  const [maxUsers, setMaxUsers] = useState(
    currentMaxUsers != null ? String(currentMaxUsers) : ''
  );
  const [tier, setTier] = useState(currentTier ?? '');
  const { toast } = useToast();

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const updateLimits = httpsCallable(functions, 'updateOrgLimits');
      const parsed = maxPartners.trim() ? parseInt(maxPartners, 10) : null;
      if (parsed !== null && (isNaN(parsed) || parsed < 1)) {
        toast({ title: 'Invalid value', description: 'Partner limit must be a positive number.', variant: 'destructive' });
        return;
      }
      const parsedUsers = maxUsers.trim() ? parseInt(maxUsers, 10) : null;
      if (parsedUsers !== null && (isNaN(parsedUsers) || parsedUsers < 1)) {
        toast({ title: 'Invalid value', description: 'User limit must be a positive number.', variant: 'destructive' });
        return;
      }
      await updateLimits({ orgId, maxPartners: parsed, maxUsers: parsedUsers, tier: tier || null });
      toast({ title: 'Limits updated', description: `${orgName} limits saved.` });
      onUpdated();
      setOpen(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update limits.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Settings2 className="h-4 w-4" />
          Limits
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Limits — {orgName}</DialogTitle>
          <DialogDescription>
            Adjust the capacity for this organisation's licence. Changes take effect immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="tier">Plan Tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger id="tier">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="organisation">Organisation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="maxPartners">Partner Limit</Label>
            <Input
              id="maxPartners"
              type="number"
              min="1"
              value={maxPartners}
              onChange={(e) => setMaxPartners(e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="maxUsers">Named User Limit</Label>
            <Input
              id="maxUsers"
              type="number"
              min="1"
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Clear a limit field to remove it entirely.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
