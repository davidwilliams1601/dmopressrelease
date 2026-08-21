'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/**
 * "Help & Support" dialog triggered from both the team dashboard sidebar and
 * the partner-portal sidebar. Sends a support ticket email via the
 * submitSupportTicket callable — no ticketing system, just a direct email to
 * the Press Pilot support inbox.
 */
export function SupportTicketDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const reset = () => {
    setSubject('');
    setMessage('');
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please fill in both a subject and a message.',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const submitTicket = httpsCallable(functions, 'submitSupportTicket');
      await submitTicket({ subject: subject.trim(), message: message.trim() });
      toast({
        title: 'Support request sent',
        description: "We've received your message and will get back to you shortly.",
      });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not send your request',
        description: e?.message || 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Help &amp; Support</DialogTitle>
          <DialogDescription>
            Send us a message and we&apos;ll get back to you by email.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="support-subject">Subject</Label>
            <Input
              id="support-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What do you need help with?"
              maxLength={200}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="support-message">Message</Label>
            <Textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the issue or question in as much detail as you can."
              rows={5}
              maxLength={5000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send message'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
