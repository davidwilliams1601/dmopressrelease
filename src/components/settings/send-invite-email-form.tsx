'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

type SendInviteEmailFormProps = {
  orgId: string;
  inviteId: string;
  /** Pre-fills the greeting name in the email — usually the invite's label */
  defaultPartnerName?: string;
  /** Pre-existing sent state, e.g. from Firestore, so a resend starts with context */
  initialSentTo?: string | null;
  onSent?: (email: string) => void;
};

export function SendInviteEmailForm({
  orgId,
  inviteId,
  defaultPartnerName,
  initialSentTo,
  onSent,
}: SendInviteEmailFormProps) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(initialSentTo || null);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!email.trim()) return;
    setIsSending(true);
    try {
      const functions = getFunctions();
      const sendInvite = httpsCallable(functions, 'sendPartnerInviteEmail');
      await sendInvite({
        orgId,
        inviteId,
        partnerEmail: email.trim(),
        partnerName: defaultPartnerName,
        note: note.trim() || undefined,
      });
      setSentTo(email.trim());
      toast({
        title: 'Invite email sent',
        description: `Sent to ${email.trim()}`,
      });
      onSent?.(email.trim());
    } catch (error: any) {
      toast({
        title: 'Error sending invite email',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  if (sentTo) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Sent to {sentTo}
        </div>
        <button
          type="button"
          className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
          onClick={() => {
            setSentTo(null);
            setEmail('');
            setNote('');
          }}
        >
          Send to someone else
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Mail className="h-4 w-4" />
        Send this invite by email
      </div>
      <div className="grid gap-2">
        <Label htmlFor="partner-email" className="text-xs">Partner email</Label>
        <Input
          id="partner-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@partner-org.com"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="partner-note" className="text-xs">
          Add a note <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id="partner-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Great to meet you at the conference — this link will get you set up in a couple of minutes."
          rows={3}
        />
      </div>
      <Button
        size="sm"
        onClick={handleSend}
        disabled={isSending || !email.trim()}
        className="justify-self-start"
      >
        {isSending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
        ) : (
          <><Mail className="h-4 w-4" /> Send invite email</>
        )}
      </Button>
    </div>
  );
}
