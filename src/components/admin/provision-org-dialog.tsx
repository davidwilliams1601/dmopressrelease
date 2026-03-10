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
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Copy, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { VERTICALS } from '@/lib/verticals';
import type { VerticalId } from '@/lib/types';

type ProvisionResult = {
  orgId: string;
  adminUserId: string;
  tempPassword: string;
};

type ProvisionOrgDialogProps = {
  onOrgProvisioned: () => void;
};

export function ProvisionOrgDialog({ onOrgProvisioned }: ProvisionOrgDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Form state
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [boilerplate, setBoilerplate] = useState('');
  const [brandToneNotes, setBrandToneNotes] = useState('');
  const [pressContactName, setPressContactName] = useState('');
  const [pressContactEmail, setPressContactEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [vertical, setVertical] = useState<VerticalId>('dmo');
  const [maxPartners, setMaxPartners] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [tier, setTier] = useState<'starter' | 'professional' | 'organisation' | ''>('');

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    // Auto-derive slug from name if slug hasn't been manually edited
    const derived = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setOrgSlug(derived);
  };

  const handleProvision = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const provision = httpsCallable<any, ProvisionResult>(functions, 'provisionNewOrg');
      const response = await provision({
        orgName,
        orgSlug,
        boilerplate,
        brandToneNotes,
        pressContactName,
        pressContactEmail,
        adminName,
        adminEmail,
        vertical,
        maxPartners: maxPartners ? parseInt(maxPartners, 10) : undefined,
        maxUsers: maxUsers ? parseInt(maxUsers, 10) : undefined,
        tier: tier || undefined,
      });
      setResult(response.data);
      onOrgProvisioned();
    } catch (error: any) {
      let message = 'Failed to provision organisation.';
      if (error.code === 'functions/already-exists') message = error.message;
      if (error.code === 'functions/invalid-argument') message = error.message;
      toast({ title: 'Provisioning failed', description: message, variant: 'destructive' });
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
    setOrgName(''); setOrgSlug(''); setBoilerplate(''); setBrandToneNotes('');
    setPressContactName(''); setPressContactEmail('');
    setAdminName(''); setAdminEmail('');
    setVertical('dmo'); setMaxPartners(''); setMaxUsers(''); setTier('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New Organisation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Organisation Provisioned</DialogTitle>
              <DialogDescription>
                <strong>{orgName}</strong> has been created. Share the temporary password with the admin securely — it cannot be retrieved again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-md border bg-muted/50 p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Org ID</span>
                  <code className="font-mono">{result.orgId}</code>
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
                <AlertTitle>Next steps</AlertTitle>
                <AlertDescription>
                  Send the admin their email and temporary password. They should log in at <strong>/</strong> and change their password immediately via Settings.
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
              <DialogTitle>Provision New Organisation</DialogTitle>
              <DialogDescription>
                Creates a new organisation and its first admin account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Organisation</h3>
                <div className="grid gap-2">
                  <Label htmlFor="vertical">Sector / Vertical</Label>
                  <Select value={vertical} onValueChange={(v) => setVertical(v as VerticalId)}>
                    <SelectTrigger id="vertical">
                      <SelectValue placeholder="Select sector" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(VERTICALS).map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="orgName">Organisation Name *</Label>
                  <Input
                    id="orgName"
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    placeholder="e.g. Visit Cornwall"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="orgSlug">Slug * <span className="text-muted-foreground font-normal">(URL-safe ID, must be unique)</span></Label>
                  <Input
                    id="orgSlug"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="e.g. visit-cornwall"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="boilerplate">Boilerplate</Label>
                  <Textarea
                    id="boilerplate"
                    value={boilerplate}
                    onChange={(e) => setBoilerplate(e.target.value)}
                    placeholder="Short 'About' paragraph appended to press release emails..."
                    className="min-h-[80px]"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="brandToneNotes">Brand Tone Notes</Label>
                  <Textarea
                    id="brandToneNotes"
                    value={brandToneNotes}
                    onChange={(e) => setBrandToneNotes(e.target.value)}
                    placeholder="Guidelines for the AI tone — e.g. 'Warm, aspirational, avoid jargon'..."
                    className="min-h-[80px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="pressContactName">Press Contact Name</Label>
                    <Input
                      id="pressContactName"
                      value={pressContactName}
                      onChange={(e) => setPressContactName(e.target.value)}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pressContactEmail">Press Contact Email</Label>
                    <Input
                      id="pressContactEmail"
                      type="email"
                      value={pressContactEmail}
                      onChange={(e) => setPressContactEmail(e.target.value)}
                      placeholder="press@visitcornwall.com"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tier">Plan Tier</Label>
                  <Select value={tier} onValueChange={(v) => setTier(v as any)}>
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
                <div className="grid grid-cols-2 gap-4">
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
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave limits empty for unlimited. Partner limit excludes named users; user limit excludes partners.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">First Admin Account</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="adminName">Full Name *</Label>
                    <Input
                      id="adminName"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Jane Smith"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="adminEmail">Email *</Label>
                    <Input
                      id="adminEmail"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="jane@visitcornwall.com"
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  A temporary password will be generated. You must share it with the admin securely.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleProvision}
                disabled={isLoading || !orgName || !orgSlug || !adminName || !adminEmail}
              >
                {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Provisioning...</> : 'Provision Organisation'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
