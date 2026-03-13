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
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

type Recipient = { id: string; name: string; email: string };

type SendPartnerEmailDialogProps = {
  orgId: string;
  /** All partners, or a single-element array for individual sends */
  recipients: Recipient[];
  trigger: React.ReactNode;
};

export function SendPartnerEmailDialog({ orgId, recipients, trigger }: SendPartnerEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const { toast } = useToast();

  const isBulk = recipients.length > 1;

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const sendEmail = httpsCallable<any, { sentCount: number }>(functions, 'sendPartnerEmail');
      const res = await sendEmail({
        orgId,
        subject: subject.trim(),
        body: body.trim(),
        partnerIds: isBulk ? [] : [recipients[0].id],
      });
      setSentCount(res.data.sentCount);
    } catch (error: any) {
      toast({
        title: 'Error sending email',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSentCount(null);
    setSubject('');
    setBody('');
  };

  const recipientLabel = isBulk
    ? `${recipients.length} partners`
    : recipients[0]?.name || recipients[0]?.email;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        {sentCount !== null ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Email sent
              </DialogTitle>
              <DialogDescription>
                {sentCount === 1
                  ? `Your email was sent to ${recipientLabel}.`
                  : `Your email was sent to ${sentCount} partner${sentCount !== 1 ? 's' : ''}.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {isBulk ? 'Email all partners' : `Email ${recipientLabel}`}
              </DialogTitle>
              <DialogDescription>
                {isBulk
                  ? `Each of your ${recipients.length} partners will receive a separate email — addresses are not shared between recipients.`
                  : `Send a message directly to ${recipientLabel}.`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Important update from Visit Kent"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="body">Message</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message here…"
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  Each email will open with "Hi [Partner name]," automatically.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSend} disabled={isLoading || !subject.trim() || !body.trim()}>
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                ) : isBulk ? (
                  `Send to ${recipients.length} partners`
                ) : (
                  'Send email'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
