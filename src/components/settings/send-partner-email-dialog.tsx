'use client';

import { useState, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

type Recipient = { id: string; name: string; email: string; businessCategories?: string[] };

type SendPartnerEmailDialogProps = {
  orgId: string;
  /** All partners, or a single-element array for individual sends */
  recipients: Recipient[];
  trigger: React.ReactNode;
  /** Available categories for filtering — only shown in bulk mode */
  availableCategories?: string[];
};

export function SendPartnerEmailDialog({ orgId, recipients, trigger, availableCategories }: SendPartnerEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { toast } = useToast();

  const isBulk = recipients.length > 1;

  // Filter recipients by selected categories (bulk only)
  const filteredRecipients = useMemo(() => {
    if (!isBulk || selectedCategories.length === 0) return recipients;
    return recipients.filter((r) =>
      r.businessCategories?.some((c) => selectedCategories.includes(c))
    );
  }, [isBulk, recipients, selectedCategories]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    if (filteredRecipients.length === 0) return;
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const sendEmail = httpsCallable<any, { sentCount: number }>(functions, 'sendPartnerEmail');
      const res = await sendEmail({
        orgId,
        subject: subject.trim(),
        body: body.trim(),
        partnerIds: isBulk ? filteredRecipients.map((r) => r.id) : [recipients[0].id],
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
    setSelectedCategories([]);
  };

  const recipientLabel = isBulk
    ? `${filteredRecipients.length} partner${filteredRecipients.length !== 1 ? 's' : ''}`
    : recipients[0]?.name || recipients[0]?.email;

  // Categories that actually appear on at least one partner
  const usableCategories = useMemo(() => {
    if (!availableCategories || !isBulk) return [];
    return availableCategories.filter((cat) =>
      recipients.some((r) => r.businessCategories?.includes(cat))
    );
  }, [availableCategories, recipients, isBulk]);

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
                  ? `Your email was sent to ${recipients[0]?.name || 'the partner'}.`
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
                {isBulk ? 'Email partners' : `Email ${recipientLabel}`}
              </DialogTitle>
              <DialogDescription>
                {isBulk
                  ? `Each partner receives a separate email — addresses are not shared between recipients.`
                  : `Send a message directly to ${recipientLabel}.`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {isBulk && usableCategories.length > 0 && (
                <div className="grid gap-2">
                  <Label>Filter by category <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="flex flex-wrap gap-1.5">
                    {usableCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className="focus:outline-none"
                      >
                        <Badge
                          variant={selectedCategories.includes(cat) ? 'default' : 'outline'}
                          className="cursor-pointer"
                        >
                          {cat}
                          {selectedCategories.includes(cat) && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedCategories.length === 0
                      ? `Sending to all ${recipients.length} partners.`
                      : filteredRecipients.length === 0
                        ? 'No partners match the selected categories.'
                        : `Sending to ${filteredRecipients.length} of ${recipients.length} partners.`}
                  </p>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. We need your help with an upcoming press release"
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
              <Button
                onClick={handleSend}
                disabled={isLoading || !subject.trim() || !body.trim() || filteredRecipients.length === 0}
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                ) : (
                  `Send to ${recipientLabel}`
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
