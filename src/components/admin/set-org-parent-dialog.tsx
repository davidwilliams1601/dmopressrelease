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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Network, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

type SetOrgParentDialogProps = {
  orgId: string;
  orgName: string;
  currentParentOrgId?: string | null;
  onUpdated: () => void;
};

export function SetOrgParentDialog({
  orgId,
  orgName,
  currentParentOrgId,
  onUpdated,
}: SetOrgParentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parentOrgId, setParentOrgId] = useState(currentParentOrgId ?? '');
  const { toast } = useToast();

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const setParent = httpsCallable<any, { success: boolean; cascadedDescendantCount: number }>(
        functions,
        'setOrgParent'
      );
      const trimmed = parentOrgId.trim();
      const response = await setParent({ orgId, parentOrgId: trimmed || null });
      const cascaded = response.data.cascadedDescendantCount;
      toast({
        title: trimmed ? 'Parent set' : 'Detached to root',
        description: trimmed
          ? `${orgName} is now under ${trimmed}.${cascaded ? ` ${cascaded} existing descendant org(s) were updated too.` : ''}`
          : `${orgName} is now a root org.${cascaded ? ` ${cascaded} existing descendant org(s) were updated too.` : ''}`,
      });
      onUpdated();
      setOpen(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to set parent.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setParentOrgId(currentParentOrgId ?? ''); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Network className="h-4 w-4" />
          Parent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Parent — {orgName}</DialogTitle>
          <DialogDescription>
            Attach this organisation to a parent (federated tenants), or clear the field to make it a root org again.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="parentOrgId">Parent Org ID</Label>
            <Input
              id="parentOrgId"
              value={parentOrgId}
              onChange={(e) => setParentOrgId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. auris-tech (leave blank for root)"
            />
          </div>
          {currentParentOrgId && (
            <p className="text-xs text-muted-foreground">
              Currently under <code className="font-mono">{currentParentOrgId}</code>.
            </p>
          )}
          <Alert>
            <AlertTitle>This cascades</AlertTitle>
            <AlertDescription>
              If {orgName} already has its own descendants (e.g. it's an LVEP with DMOs beneath it), their
              ancestor chains are updated automatically in the same action — you don't need to re-parent them
              individually.
            </AlertDescription>
          </Alert>
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
