'use client';

import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertCircle, Check, Loader2, ShieldAlert, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { MediaNetworkContact, MediaNetworkImportBatch } from '@/lib/types';

/**
 * Superadmin review queue for a single media-network import batch. Fetching the
 * contacts here (with raw identity) triggers a server-side audit-log write via
 * getMediaNetworkBatchContacts — this view is exactly what the accountability
 * requirement in data-model-and-security.md exists to cover.
 */
export function MediaNetworkBatchReview({
  batch,
  open,
  onOpenChange,
  onPublished,
}: {
  batch: MediaNetworkImportBatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}) {
  const [contacts, setContacts] = useState<MediaNetworkContact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !batch) return;
    setIsLoading(true);
    const functions = getFunctions();
    const getContacts = httpsCallable<{ batchId: string }, { contacts: MediaNetworkContact[] }>(
      functions,
      'getMediaNetworkBatchContacts'
    );
    getContacts({ batchId: batch.id })
      .then((res) => setContacts(res.data.contacts))
      .catch((err) => {
        console.error('Failed to load batch contacts:', err);
        toast({ title: 'Failed to load contacts', description: err.message, variant: 'destructive' });
      })
      .finally(() => setIsLoading(false));
  }, [open, batch, toast]);

  const setContactStatus = async (contactId: string, networkStatus: 'active' | 'suppressed' | 'archived' | 'review') => {
    setActioningId(contactId);
    try {
      const functions = getFunctions();
      const updateStatus = httpsCallable(functions, 'updateMediaNetworkContactStatus');
      await updateStatus({ contactId, networkStatus });
      setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, networkStatus } : c)));
    } catch (err: any) {
      console.error('Failed to update contact status:', err);
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setActioningId(null);
    }
  };

  const handlePublish = async () => {
    if (!batch) return;
    setIsPublishing(true);
    try {
      const functions = getFunctions();
      const publishBatch = httpsCallable<{ batchId: string }, { publishedCount: number }>(functions, 'publishMediaNetworkBatch');
      const result = await publishBatch({ batchId: batch.id });
      toast({ title: 'Batch published', description: `${result.data.publishedCount} contacts are now active in the network.` });
      onPublished();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Failed to publish batch:', err);
      toast({ title: 'Publish failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsPublishing(false);
    }
  };

  // QA fix (H5): reviewCount now gates Publish entirely (see disabled prop below) instead
  // of just being informational text — the server callable enforces the same rule, so this
  // is a UX convenience, not the actual safeguard.
  const reviewCount = contacts.filter((c) => c.networkStatus === 'review').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review batch — {batch?.fileName}</DialogTitle>
          <DialogDescription>
            Raw contact identity is shown below for review purposes only. This view is audit-logged.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Viewing raw identities in this batch has been recorded in the audit log for your account.
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading contacts…
          </div>
        ) : (
          <div className="rounded-md border max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.identity.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.identity.email}</TableCell>
                    <TableCell>{c.outlet.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.networkStatus === 'active' ? 'default' : c.networkStatus === 'review' ? 'secondary' : 'destructive'
                        }
                      >
                        {c.networkStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.networkStatus === 'review' && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actioningId === c.id}
                            onClick={() => setContactStatus(c.id, 'active')}
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={actioningId === c.id}
                            onClick={() => setContactStatus(c.id, 'suppressed')}
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      )}
                      {c.networkStatus !== 'review' && (
                        <Button size="sm" variant="ghost" disabled={actioningId === c.id} onClick={() => setContactStatus(c.id, 'review')}>
                          Undo
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className={`text-sm ${reviewCount > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            {reviewCount > 0
              ? `${reviewCount} contact${reviewCount !== 1 ? 's' : ''} still awaiting a decision — approve or reject every contact to publish.`
              : 'Every contact in this batch has a decision.'}
          </p>
          <Button
            onClick={handlePublish}
            disabled={isPublishing || batch?.status === 'published' || reviewCount > 0}
            title={reviewCount > 0 ? 'Decide every contact in this batch before publishing.' : undefined}
          >
            {isPublishing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</>
            ) : batch?.status === 'published' ? (
              'Already published'
            ) : reviewCount > 0 ? (
              <><ShieldAlert className="h-4 w-4" /> {reviewCount} undecided</>
            ) : (
              <><AlertCircle className="h-4 w-4" /> Publish batch</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
