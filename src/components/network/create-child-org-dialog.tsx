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
import { Plus, Copy, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

type CreateChildOrgResult = {
  orgId: string;
  adminUserId: string;
  tempPassword: string;
  tier: string;
  seatsUsed: number;
  maxChildOrgs: number;
};

type CreateChildOrgDialogProps = {
  parentOrgName: string;
  seatsUsed: number;
  maxChildOrgs: number;
  onCreated: () => void;
};

export function CreateChildOrgDialog({ parentOrgName, seatsUsed, maxChildOrgs, onCreated }: CreateChildOrgDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CreateChildOrgResult | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const seatsFull = seatsUsed >= maxChildOrgs;

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    const derived = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setOrgSlug(derived);
  };

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const create = httpsCallable<any, CreateChildOrgResult>(functions, 'createChildOrg');
      const response = await create({ orgName, orgSlug, adminName, adminEmail });
      setResult(response.data);
      onCreated();
    } catch (error: any) {
      toast({ title: 'Could not create organisation', description: error.message || 'Something went wrong.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
    setOrgName('');
    setOrgSlug('');
    setAdminName('');
    setAdminEmail('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button disabled={seatsFull}>
          <Plus />
          New Member Organisation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Organisation Created</DialogTitle>
              <DialogDescription>
                <strong>{orgName}</strong> has been added under {parentOrgName}. Share the temporary password with its admin securely — it cannot be retrieved again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-md border bg-muted/50 p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Org ID</span>
                  <code className="font-mono">{result.orgId}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan tier</span>
                  <span className="capitalize">{result.tier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin email</span>
                  <span>{adminEmail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Temp password</span>
                  <div className="flex items-center gap-2">
                    <code className="font-mono bg-background border rounded px-2 py-0.5">{result.tempPassword}</code>
                    <Button variant="ghost" size="icon" onClick={handleCopyPassword}>
                      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              <Alert>
                <AlertTitle>Seats used</AlertTitle>
                <AlertDescription>
                  {result.seatsUsed} of {result.maxChildOrgs} licensed seats now in use. Send the admin their email and temporary password — they should log in and change it immediately via Settings.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New Member Organisation</DialogTitle>
              <DialogDescription>
                Creates a new organisation under {parentOrgName} and its first admin account.
                Plan tier is assigned automatically per your licence — {seatsUsed} of {maxChildOrgs} seats used.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="childOrgName">Organisation Name *</Label>
                <Input
                  id="childOrgName"
                  value={orgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                  placeholder="e.g. Visit Cornwall"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="childOrgSlug">Slug * <span className="text-muted-foreground font-normal">(URL-safe ID, must be unique)</span></Label>
                <Input
                  id="childOrgSlug"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="e.g. visit-cornwall"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="childAdminName">Admin Full Name *</Label>
                <Input
                  id="childAdminName"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="childAdminEmail">Admin Email *</Label>
                <Input
                  id="childAdminEmail"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="jane@visitcornwall.com"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A temporary password will be generated. You must share it with the new admin securely.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={isLoading || !orgName || !orgSlug || !adminName || !adminEmail}
              >
                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</> : 'Create Organisation'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
