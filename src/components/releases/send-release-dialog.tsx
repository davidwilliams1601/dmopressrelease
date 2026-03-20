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
import { Checkbox } from '@/components/ui/checkbox';
import { Send, Loader2, Lock, Clock, CalendarClock } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, doc, serverTimestamp, getDocs, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Release, OutletList } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';

type SendReleaseDialogProps = {
  release: Release;
  orgId: string;
  approvalBlocked?: boolean;
};

export function SendReleaseDialog({ release, orgId, approvalBlocked }: SendReleaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('09:00');
  const firestore = useFirestore();
  const { toast } = useToast();

  const outletListsQuery = useCollection<OutletList>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(collection(firestore, 'orgs', orgId, 'outletLists'));
    }, [firestore, orgId])
  );

  const outletLists = outletListsQuery.data || [];

  const toggleList = (listId: string) => {
    setSelectedLists((prev) =>
      prev.includes(listId)
        ? prev.filter((id) => id !== listId)
        : [...prev, listId]
    );
  };

  const getScheduledDateTime = (): Date | null => {
    if (!scheduledDate || !scheduledTime) return null;
    const [year, month, day] = scheduledDate.split('-').map(Number);
    const [hours, minutes] = scheduledTime.split(':').map(Number);
    const combined = new Date(year, month - 1, day, hours, minutes);
    return combined;
  };

  const isScheduleValid = (): boolean => {
    if (sendMode !== 'scheduled') return true;
    const dateTime = getScheduledDateTime();
    if (!dateTime) return false;
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return dateTime > fiveMinutesFromNow;
  };

  const handleSend = async () => {
    if (selectedLists.length === 0) {
      toast({
        title: 'No lists selected',
        description: 'Please select at least one outlet list to send to.',
        variant: 'destructive',
      });
      return;
    }

    if (sendMode === 'scheduled' && !isScheduleValid()) {
      toast({
        title: 'Invalid schedule time',
        description: 'Scheduled time must be at least 5 minutes in the future.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);

    try {
      // Count total recipients
      let totalRecipients = 0;
      for (const listId of selectedLists) {
        const recipientsRef = collection(
          firestore,
          'orgs',
          orgId,
          'outletLists',
          listId,
          'recipients'
        );
        const snapshot = await getDocs(recipientsRef);
        totalRecipients += snapshot.size;
      }

      if (totalRecipients === 0) {
        toast({
          title: 'No recipients',
          description: 'The selected lists have no recipients. Please add contacts first.',
          variant: 'destructive',
        });
        setIsSending(false);
        return;
      }

      const sendJobsRef = collection(firestore, 'orgs', orgId, 'sendJobs');
      const releaseRef = doc(firestore, 'orgs', orgId, 'releases', release.id);

      if (sendMode === 'scheduled') {
        const scheduledDateTime = getScheduledDateTime()!;

        // Create scheduled send job
        await addDocumentNonBlocking(sendJobsRef, {
          orgId,
          releaseId: release.id,
          outletListIds: selectedLists,
          status: 'scheduled',
          totalRecipients,
          sentCount: 0,
          failedCount: 0,
          createdAt: serverTimestamp(),
          scheduledAt: Timestamp.fromDate(scheduledDateTime),
        });

        // Update release status to Scheduled (don't increment sends yet)
        await updateDocumentNonBlocking(releaseRef, {
          status: 'Scheduled',
          updatedAt: serverTimestamp(),
        });

        toast({
          title: 'Release scheduled',
          description: `Release scheduled for ${format(scheduledDateTime, 'dd MMM yyyy, HH:mm')}.`,
        });
      } else {
        // Create send job (immediate)
        await addDocumentNonBlocking(sendJobsRef, {
          orgId,
          releaseId: release.id,
          outletListIds: selectedLists,
          status: 'pending',
          totalRecipients,
          sentCount: 0,
          failedCount: 0,
          createdAt: serverTimestamp(),
        });

        // Update release status and send count
        await updateDocumentNonBlocking(releaseRef, {
          status: 'Sent',
          sends: (release.sends || 0) + totalRecipients,
          updatedAt: serverTimestamp(),
        });

        toast({
          title: 'Release queued for sending',
          description: `Your press release will be sent to ${totalRecipients} recipients.`,
        });
      }

      setOpen(false);
      setSelectedLists([]);
      setSendMode('now');
      setScheduledDate('');
      setScheduledTime('09:00');
    } catch (error) {
      console.error('Error sending release:', error);
      toast({
        title: 'Error sending release',
        description: 'There was a problem queuing your release. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const totalRecipients = selectedLists.reduce((sum, listId) => {
    const list = outletLists.find((l) => l.id === listId);
    return sum + (list?.recipientCount || 0);
  }, 0);

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (approvalBlocked) {
    return (
      <Button disabled title="Awaiting approval before this release can be sent.">
        <Lock />
        <span>Approval Required</span>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send />
          <span>Send Release</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Press Release</DialogTitle>
          <DialogDescription>
            Select outlet lists to send &quot;{release.headline}&quot; to.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Email Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Email Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Subject:</p>
                <p className="font-medium">{release.headline}</p>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Body:</p>
                <div className="text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto border rounded-md p-3 bg-muted/30">
                  {release.bodyCopy || 'No content yet'}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Outlet Lists Selection */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Select Outlet Lists</Label>
            {outletListsQuery.isLoading ? (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              </div>
            ) : outletLists.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">
                    No outlet lists found. Create a list in the Outlets section first.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {outletLists.map((list) => (
                  <Card
                    key={list.id}
                    className={`cursor-pointer transition-colors ${
                      selectedLists.includes(list.id)
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleList(list.id)}
                  >
                    <CardContent className="flex items-center gap-3 p-4">
                      <Checkbox
                        checked={selectedLists.includes(list.id)}
                        onCheckedChange={() => toggleList(list.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{list.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {list.recipientCount || 0} recipient
                          {list.recipientCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Schedule Toggle */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">When to Send</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={sendMode === 'now' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setSendMode('now')}
              >
                <Send className="h-4 w-4 mr-2" />
                Send Now
              </Button>
              <Button
                type="button"
                variant={sendMode === 'scheduled' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setSendMode('scheduled')}
              >
                <CalendarClock className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            </div>

            {sendMode === 'scheduled' && (
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="schedule-date">Date</Label>
                      <Input
                        id="schedule-date"
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="schedule-time">Time</Label>
                      <Input
                        id="schedule-time"
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Timezone: {userTimezone}
                  </p>
                  {scheduledDate && scheduledTime && !isScheduleValid() && (
                    <p className="text-xs text-red-600">
                      Scheduled time must be at least 5 minutes in the future.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Summary */}
          {selectedLists.length > 0 && (
            <Card className="border-primary">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Recipients</p>
                    <p className="text-2xl font-bold">{totalRecipients}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Lists Selected</p>
                    <p className="text-2xl font-bold">{selectedLists.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              isSending ||
              selectedLists.length === 0 ||
              (sendMode === 'scheduled' && !isScheduleValid())
            }
          >
            {isSending ? (
              <>
                <Loader2 className="animate-spin" />
                {sendMode === 'scheduled' ? 'Scheduling...' : 'Sending...'}
              </>
            ) : sendMode === 'scheduled' ? (
              <>
                <CalendarClock />
                Schedule Send
              </>
            ) : (
              <>
                <Send />
                Send to {totalRecipients} Recipient{totalRecipients !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
