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
import { SendInviteEmailForm } from '@/components/settings/send-invite-email-form';
import type { PartnerInvite } from '@/lib/types';

type SendInviteEmailDialogProps = {
  orgId: string;
  invite: PartnerInvite;
  trigger: React.ReactNode;
};

export function SendInviteEmailDialog({ orgId, invite, trigger }: SendInviteEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [justSentTo, setJustSentTo] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {invite.sentTo || justSentTo ? 'Resend invite' : 'Send invite'}
            {invite.label ? ` — ${invite.label}` : ''}
          </DialogTitle>
          <DialogDescription>
            {invite.sentTo && !justSentTo
              ? `Previously sent to ${invite.sentTo}. You can send it again to the same address or a different one.`
              : 'Email this invite link directly to your partner, with an optional personal note.'}
          </DialogDescription>
        </DialogHeader>
        <SendInviteEmailForm
          orgId={orgId}
          inviteId={invite.id}
          defaultPartnerName={invite.label}
          initialSentTo={justSentTo}
          onSent={(email) => setJustSentTo(email)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
