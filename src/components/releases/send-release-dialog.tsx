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
import { Send, Loader2, Lock, Clock, CalendarClock, Sparkles, AlertTriangle } from 'lucide-react';
import { useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import type { Release, OutletList, RecommendationSnapshot, CreditWalletSummary } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

  // --- Smart Distribution additions (Phase 4) ---
  // Included recommendations for this story — same {storyId ASC, decision ASC}
  // composite index already created in Phase 3, no new index needed.
  // QA fix (H3): defaults to OFF (was previously defaulted ON) and is reset to OFF
  // every time the dialog opens (see onOpenChange below) — a customer must actively
  // opt in on each send rather than relying on a preselected, billable default.
  const [includeSmartDistribution, setIncludeSmartDistribution] = useState(false);
  // QA fix (H3): when the send would include billable Press Pilot network contacts,
  // the primary button first swaps to an explicit confirmation naming the exact
  // recipient count and credit cost, rather than sending immediately.
  const [confirmingSmartDistribution, setConfirmingSmartDistribution] = useState(false);
  const includedRecommendationsQuery = useCollection<RecommendationSnapshot>(
    useMemoFirebase(() => {
      if (!orgId || !release?.id) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'recommendationSnapshots'),
        where('storyId', '==', release.id),
        where('decision', '==', 'included')
      );
    }, [firestore, orgId, release?.id])
  );
  const includedRecommendations = includedRecommendationsQuery.data || [];
  const smartDistributionCustomerCount = includedRecommendations.filter((r) => r.source === 'customer_contact').length;
  const smartDistributionNetworkCount = includedRecommendations.filter((r) => r.source === 'network_contact').length;
  const smartDistributionCreditCost = smartDistributionNetworkCount; // 1 credit per network contact, 0 for customer contacts

  const walletQuery = useDoc<CreditWalletSummary>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return doc(firestore, 'orgs', orgId, 'creditWallet', 'summary');
    }, [firestore, orgId])
  );
  const wallet = walletQuery.data;
  const walletBalance = wallet?.balance ?? 0;
  const insufficientBalance = includeSmartDistribution && smartDistributionCreditCost > walletBalance;

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

      // QA fix (H2 + H4): the sendJob document is no longer written directly from the
      // client (firestore.rules now denies it — see H2 fix comment there). The
      // createSendJob callable re-validates everything server-side (release approval,
      // outlet-list ownership, recipient counts, confirmed Smart Distribution selection)
      // and only marks the release Scheduled/Sent once the sendJob document itself is
      // confirmed written — a thrown error here is caught below and never silently
      // reports success, closing the H4 gap.
      const functionsInstance = getFunctions();
      const createSendJob = httpsCallable<any, { success: boolean; sendJobId: string; totalRecipients: number }>(
        functionsInstance,
        'createSendJob'
      );

      if (sendMode === 'scheduled') {
        const scheduledDateTime = getScheduledDateTime()!;

        const result = await createSendJob({
          orgId,
          releaseId: release.id,
          outletListIds: selectedLists,
          sendMode: 'scheduled',
          scheduledAt: scheduledDateTime.getTime(),
          includeSmartDistributionRecommendations: includeSmartDistribution,
          confirmedSmartDistributionSelection: smartDistributionConfirmationNeeded,
        });

        toast({
          title: 'Release scheduled',
          description: `Release scheduled for ${format(scheduledDateTime, 'dd MMM yyyy, HH:mm')}. ${result.data.totalRecipients} recipient${result.data.totalRecipients !== 1 ? 's' : ''}.`,
        });
      } else {
        const result = await createSendJob({
          orgId,
          releaseId: release.id,
          outletListIds: selectedLists,
          sendMode: 'now',
          includeSmartDistributionRecommendations: includeSmartDistribution,
          confirmedSmartDistributionSelection: smartDistributionConfirmationNeeded,
        });

        toast({
          title: 'Release queued for sending',
          description: `Your press release will be sent to ${result.data.totalRecipients} recipients.`,
        });
      }

      setOpen(false);
      setSelectedLists([]);
      setSendMode('now');
      setScheduledDate('');
      setScheduledTime('09:00');
      setIncludeSmartDistribution(false);
      setConfirmingSmartDistribution(false);
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

  // QA fix (H3): explicit final confirmation naming recipient counts and credit
  // cost before a billable Smart Distribution send is actually created.
  const smartDistributionConfirmationNeeded = includeSmartDistribution && smartDistributionNetworkCount > 0;

  const handlePrimaryButtonClick = () => {
    if (smartDistributionConfirmationNeeded && !confirmingSmartDistribution) {
      setConfirmingSmartDistribution(true);
      return;
    }
    handleSend();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          // QA fix (H3): always start unchecked and out of the confirm step,
          // regardless of what was left over from a previous time this dialog
          // was opened for this same release.
          setIncludeSmartDistribution(false);
          setConfirmingSmartDistribution(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Send />
          <span>Send Release</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {confirmingSmartDistribution ? 'Confirm Press Pilot network send' : 'Send Press Release'}
          </DialogTitle>
          <DialogDescription>
            {confirmingSmartDistribution
              ? 'Review the recipients and credit cost below before sending.'
              : <>Select outlet lists to send &quot;{release.headline}&quot; to.</>}
          </DialogDescription>
        </DialogHeader>

        {confirmingSmartDistribution ? (
          <div className="grid gap-4 py-4">
            <Card className="border-primary">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Your outlet contacts</p>
                  <p className="font-semibold">{totalRecipients} (free)</p>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Press Pilot network contacts</p>
                  <p className="font-semibold">{smartDistributionNetworkCount}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Credits this send will use</p>
                  <p className="font-semibold">{smartDistributionCreditCost}</p>
                </div>
              </CardContent>
            </Card>
            {insufficientBalance && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Low credit balance</AlertTitle>
                <AlertDescription>
                  Your balance is {walletBalance} credit{walletBalance !== 1 ? 's' : ''}, but this send could use up
                  to {smartDistributionCreditCost}. Contacts beyond your balance won&apos;t be sent.
                </AlertDescription>
              </Alert>
            )}
            <p className="text-sm text-muted-foreground">
              Confirming will send to {totalRecipients + smartDistributionNetworkCount} recipient
              {totalRecipients + smartDistributionNetworkCount !== 1 ? 's' : ''} in total and use{' '}
              {smartDistributionCreditCost} credit{smartDistributionCreditCost !== 1 ? 's' : ''}.
            </p>
          </div>
        ) : (
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

          {/* Smart Distribution */}
          {includedRecommendations.length > 0 && (
            <div className="space-y-3">
              <div
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                onClick={() => setIncludeSmartDistribution((v) => !v)}
              >
                <Checkbox
                  checked={includeSmartDistribution}
                  onCheckedChange={() => setIncludeSmartDistribution((v) => !v)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="font-medium flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Also include {includedRecommendations.length} Smart Distribution recommended contact
                    {includedRecommendations.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {smartDistributionCustomerCount > 0 && (
                      <>{smartDistributionCustomerCount} from your own contacts (free)</>
                    )}
                    {smartDistributionCustomerCount > 0 && smartDistributionNetworkCount > 0 && ' · '}
                    {smartDistributionNetworkCount > 0 && (
                      <>{smartDistributionNetworkCount} Press Pilot network contact{smartDistributionNetworkCount !== 1 ? 's' : ''} ({smartDistributionCreditCost} credit{smartDistributionCreditCost !== 1 ? 's' : ''})</>
                    )}
                  </p>
                </div>
              </div>

              {includeSmartDistribution && wallet?.smartDistributionSuspended && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Smart Distribution suspended</AlertTitle>
                  <AlertDescription>
                    Smart Distribution has been suspended for your organisation. Network contacts will not be
                    included in this send.
                  </AlertDescription>
                </Alert>
              )}

              {includeSmartDistribution && !wallet?.smartDistributionSuspended && insufficientBalance && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Low credit balance</AlertTitle>
                  <AlertDescription>
                    Your balance is {walletBalance} credit{walletBalance !== 1 ? 's' : ''}, but this send could use up
                    to {smartDistributionCreditCost}. Contacts beyond your balance won&apos;t be sent.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

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
                {includeSmartDistribution && includedRecommendations.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">
                    +{includedRecommendations.length} Smart Distribution contact
                    {includedRecommendations.length !== 1 ? 's' : ''} will also be included
                    {smartDistributionCreditCost > 0 ? ` (${smartDistributionCreditCost} credit${smartDistributionCreditCost !== 1 ? 's' : ''})` : ''}.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (confirmingSmartDistribution) {
                setConfirmingSmartDistribution(false);
              } else {
                setOpen(false);
              }
            }}
          >
            {confirmingSmartDistribution ? 'Back' : 'Cancel'}
          </Button>
          <Button
            onClick={handlePrimaryButtonClick}
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
            ) : confirmingSmartDistribution ? (
              <>
                <Send />
                Confirm &amp; Send
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
