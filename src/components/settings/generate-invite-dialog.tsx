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
import { Link as LinkIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type GenerateInviteDialogProps = {
  orgId: string;
  onInviteCreated: () => void;
};

export function GenerateInviteDialog({ orgId, onInviteCreated }: GenerateInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const label = formData.get('label') as string;
    const maxUsesStr = formData.get('maxUses') as string;
    const maxUses = maxUsesStr ? parseInt(maxUsesStr, 10) : undefined;

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const createInvite = httpsCallable(functions, 'createPartnerInvite');

      const result = await createInvite({
        orgId,
        label: label || undefined,
        maxUses,
      });

      const data = result.data as any;
      const link = `${window.location.origin}/partner-signup?code=${data.code}`;
      setInviteLink(link);

      toast({
        title: 'Invite created',
        description: 'Share the link with your partners.',
      });

      onInviteCreated();
    } catch (error: any) {
      console.error('Error creating invite:', error);
      toast({
        title: 'Error creating invite',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setInviteLink(null);
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => { setOpen(newOpen); if (!newOpen) setInviteLink(null); }}>
      <DialogTrigger asChild>
        <Button>
          <LinkIcon />
          Generate Invite Link
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {inviteLink ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite Link Created</DialogTitle>
              <DialogDescription>
                Share this link with your partners so they can create their account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted p-4">
                <Label className="text-sm text-muted-foreground">Invite Link</Label>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-xs break-all">
                    {inviteLink}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink);
                      toast({
                        title: 'Copied!',
                        description: 'Link copied to clipboard',
                      });
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate Partner Invite</DialogTitle>
              <DialogDescription>
                Create an invite link for partners to sign up to your organization.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="label">Label (optional)</Label>
                  <Input
                    id="label"
                    name="label"
                    placeholder="e.g. Summer 2026 Hotels"
                  />
                  <p className="text-xs text-muted-foreground">
                    A friendly name to help you identify this invite.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="maxUses">Max Uses (optional)</Label>
                  <Input
                    id="maxUses"
                    name="maxUses"
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty for unlimited sign-ups.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Invite'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
