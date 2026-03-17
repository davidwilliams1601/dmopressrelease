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
import { KeyRound, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

type ResetPasswordDialogProps = {
  orgName: string;
  adminEmail: string | null;
};

export function ResetPasswordDialog({ orgName, adminEmail }: ResetPasswordDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(adminEmail ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const auth = useAuth();

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) setEmail(adminEmail ?? '');
  };

  const handleSend = async () => {
    if (!email.trim()) return;
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast({ title: 'Reset email sent', description: `Password reset sent to ${email.trim()}.` });
      setOpen(false);
    } catch (error: any) {
      toast({
        title: 'Failed to send reset',
        description: error.message || 'Could not send password reset email.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Reset admin password">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset Password — {orgName}</DialogTitle>
          <DialogDescription>
            Send a password reset email to an admin user for this organisation.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="reset-email">Admin email</Label>
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!email.trim() || isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Send Reset Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
