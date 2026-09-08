'use client';

import { useState, useCallback } from 'react';
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
import { Send, Loader2, Lock, Clock, CalendarClock, Sparkles, AlertTriangle, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import type { Release, OutletList, Recipient, RecommendationSnapshot, CreditWalletSummary } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { useOrganization } from '@/hooks/use-organization';
import { hasPressContact, notesToEditorsText, pressContactParts, shouldRenderEnds } from '@/lib/release-sections';

type SendReleaseDialogProps = {
  release: Release;
  orgId: string;
  approvalBlocked?: boolean;
  /** True while the release is flagged as containing holding text (see Release.hasHoldingText). */
  holdingTextBlocked?: boolean;
};

export function SendReleaseDialog({ release, orgId, approvalBlocked, holdingTextBlocked }: SendReleaseDialogProps) {
  // Org is needed so the preview shows the same trailing sections the journalist
  // will get (About + Media contact). Shares the existing subscription.
  const { organization } = useOrganization(orgId);
  const [open, setOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  // --- Per-recipient selection ---
  // Lists are the unit of sending; within a selected list the sender can untick
  // individual contacts. Exclusions are keyed by the recipient's full document path
  // (matches SendJobRecipient.recipientRef) and validated server-side in createSendJob.
  // They are per send, not per release: the next send starts from the whole list again.
  const [expandedLists, setExpandedLists] = useState<string[]>([]);
  const [recipientsByList, setRecipientsByList] = useState<Record<string, Recipient[] | 'loading'>>({});
  const [excludedRefs, setExcludedRefs] = useState<Set<string>>(() => new Set());
  const [recipientSearch, setRecipientSearch] = useState<Record<string, string>>({});
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

  const recipientRefPath = useCallback(
    (listId: string, recipientId: string) => doc(firestore, 'orgs', orgId, 'outletLists', listId, 'recipients', recipientId).path,
    [firestore, orgId]
  );

  const toggleList = (listId: string) => {
    const deselecting = selectedLists.includes(listId);
    setSelectedLists((prev) =>
      deselecting ? prev.filter((id) => id !== listId) : [...prev, listId]
    );
    if (deselecting) {
      // Dropping a list forgets its exclusions so re-adding it starts from the full list.
      setExpandedLists((prev) => prev.filter((id) => id !== listId));
      const prefix = `orgs/${orgId}/outletLists/${listId}/recipients/`;
      setExcludedRefs((prev) => {
        const next = new Set(prev);
        prev.forEach((ref) => {
          if (ref.startsWith(prefix)) next.delete(ref);
        });
        return next;
      });
    }
  };

  const loadRecipients = async (listId: string) => {
    if (recipientsByList[listId]) return;
    setRecipientsByList((prev) => ({ ...prev, [listId]: 'loading' }));
    try {
      const snapshot = await getDocs(collection(firestore, 'orgs', orgId, 'outletLists', listId, 'recipients'));
      const rows = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Recipient, 'id'>) }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setRecipientsByList((prev) => ({ ...prev, [listId]: rows }));
    } catch (error) {
      console.error('Error loading recipients:', error);
      setRecipientsByList((prev) => {
        const next = { ...prev };
        delete next[listId];
        return next;
      });
      toast({ title: 'Could not load contacts', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const toggleExpanded = (listId: string) => {
    const expanding = !expandedLists.includes(listId);
    setExpandedLists((prev) => (expanding ? [...prev, listId] : prev.filter((id) => id !== listId)));
    if (expanding) void loadRecipients(listId);
  };

  const setRecipientIncluded = (listId: string, recipientId: string, included: boolean) => {
    const ref = recipientRefPath(listId, recipientId);
    setExcludedRefs((prev) => {
      const next = new Set(prev);
      if (included) next.delete(ref);
      else next.add(ref);
      return next;
    });
  };

  const setAllInList = (listId: string, included: boolean) => {
    const rows = recipientsByList[listId];
    if (!rows || rows === 'loading') return;
    setExcludedRefs((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => {
        const ref = recipientRefPath(listId, r.id);
        if (included) next.delete(ref);
        else next.add(ref);
      });
      return next;
    });
  };

  const excludedCountForList = (listId: string) => {
    const prefix = `orgs/${orgId}/outletLists/${listId}/recipients/`;
    let n = 0;
    excludedRefs.forEach((ref) => {
      if (ref.startsWith(prefix)) n++;
    });
    return n;
  };

  const resetRecipientSelection = () => {
    setExpandedLists([]);
    setExcludedRefs(new Set());
    setRecipientSearch({});
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
        snapshot.docs.forEach((d) => {
          if (!excludedRefs.has(d.ref.path)) totalRecipients++;
        });
      }

      if (totalRecipients === 0 && !includeSmartDistribution) {
        toast({
          title: 'No recipients',
          description:
            excludedRefs.size > 0
              ? 'Every contact in the selected lists has been unticked. Tick at least one contact to send.'
              : 'The selected lists have no recipients. Please add contacts first.',
          variant: 'destructive',
        });
        setIsSending(false);
        return;
      }

      const excludedRecipientRefs = Array.from(excludedRefs);

      // QA fix (H2 + H4): the sendJob document is no longer written directly from the
      // client (firestore.rules now denies it — see H2 fix comment there). The
      // createSendJob callable re-validates everything server-side (release approval,
      // outlet-list ownership, recipient counts, confirmed Smart Distribution selection)
      // and only marks the release Scheduled/Sent once the sendJob document itself is
      // confirmed written — a thrown error here is caught below and never silently
      // reports success, closing the H4 gap.
      const functionsInstance = getFunctions();
      const createSendJob = httpsCallable<any, { success: boolean; sendJobId: string; totalRecipients: number; excludedCount?: number }>(
        functionsInstance,
        'createSendJob'
      );
      // Belt and braces for the window between a frontend deploy and the manual Cloud
      // Functions deploy: an older createSendJob ignores excludedRecipientRefs and never
      // returns excludedCount, so the job would go to the whole list. Tell the sender.
      const warnIfExclusionsIgnored = (data: { excludedCount?: number }) => {
        if (excludedRecipientRefs.length > 0 && typeof data.excludedCount !== 'number') {
          toast({
            title: 'Contact selection not applied',
            description:
              'The server did not apply your unticked contacts, so this send goes to the full list. A scheduled send can still be cancelled from Send History.',
            variant: 'destructive',
          });
        }
      };

      if (sendMode === 'scheduled') {
        const scheduledDateTime = getScheduledDateTime()!;

        const result = await createSendJob({
          orgId,
          releaseId: release.id,
          outletListIds: selectedLists,
          excludedRecipientRefs,
          sendMode: 'scheduled',
          scheduledAt: scheduledDateTime.getTime(),
          includeSmartDistributionRecommendations: includeSmartDistribution,
          confirmedSmartDistributionSelection: smartDistributionConfirmationNeeded,
        });
        warnIfExclusionsIgnored(result.data);

        toast({
          title: 'Release scheduled',
          description: `Release scheduled for ${format(scheduledDateTime, 'dd MMM yyyy, HH:mm')}. ${result.data.totalRecipients} recipient${result.data.totalRecipients !== 1 ? 's' : ''}.`,
        });
      } else {
        const result = await createSendJob({
          orgId,
          releaseId: release.id,
          outletListIds: selectedLists,
          excludedRecipientRefs,
          sendMode: 'now',
          includeSmartDistributionRecommendations: includeSmartDistribution,
          confirmedSmartDistributionSelection: smartDistributionConfirmationNeeded,
        });
        warnIfExclusionsIgnored(result.data);

        toast({
          title: 'Release queued for sending',
          description: `Your press release will be sent to ${result.data.totalRecipients} recipients.`,
        });
      }

      setOpen(false);
      setSelectedLists([]);
      resetRecipientSelection();
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

  const totalExcluded = excludedRefs.size;
  const totalRecipients = selectedLists.reduce((sum, listId) => {
    const loaded = recipientsByList[listId];
    const list = outletLists.find((l) => l.id === listId);
    const listTotal = loaded && loaded !== 'loading' ? loaded.length : list?.recipientCount || 0;
    return sum + Math.max(0, listTotal - excludedCountForList(listId));
  }, 0);
  // Only block on zero when the sender has actively unticked people; lists with an
  // unknown recipientCount are still validated server-side as before.
  const everyoneExcluded = selectedLists.length > 0 && totalExcluded > 0 && totalRecipients === 0 && !includeSmartDistribution;

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (approvalBlocked) {
    return (
      <Button disabled title="Awaiting approval before this release can be sent.">
        <Lock />
        <span>Approval Required</span>
      </Button>
    );
  }

  if (holdingTextBlocked) {
    return (
      <Button disabled title="Untick 'Contains holding text' and save before this release can be sent.">
        <Lock />
        <span>Clear holding text to send</span>
      </Button>
    );
  }

  const previewNotes = notesToEditorsText(release);
  const previewContact = pressContactParts(organization?.pressContact);
  const previewShowContact = hasPressContact(organization?.pressContact);

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
          // Recipient exclusions are per send: never carry them over between opens.
          resetRecipientSelection();
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
                {/* Same order as formatEmailHtml: body → ENDS → Notes → About → Media contact */}
                <div className="text-sm whitespace-pre-wrap max-h-[260px] overflow-y-auto border rounded-md p-3 bg-muted/30 space-y-3">
                  <div>{release.bodyCopy || 'No content yet'}</div>
                  {shouldRenderEnds(release) && (
                    <p className="text-center font-semibold tracking-[0.2em] text-muted-foreground">ENDS</p>
                  )}
                  {previewNotes && (
                    <div className="border-t pt-3 text-muted-foreground">
                      <p className="font-semibold">Notes to editors</p>
                      <div>{previewNotes}</div>
                    </div>
                  )}
                  {organization?.boilerplate && (
                    <div className="border-t pt-3 text-muted-foreground">
                      <p className="font-semibold">About {organization.name}</p>
                      <div>{organization.boilerplate}</div>
                    </div>
                  )}
                  {previewShowContact && (
                    <div className="border-t pt-3 text-muted-foreground">
                      <p className="font-semibold">Media contact</p>
                      {previewContact.name && <div>{previewContact.name}</div>}
                      {previewContact.email && <div>{previewContact.email}</div>}
                      {previewContact.phone && <div>{previewContact.phone}</div>}
                    </div>
                  )}
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
                {outletLists.map((list) => {
                  const isSelected = selectedLists.includes(list.id);
                  const isExpanded = isSelected && expandedLists.includes(list.id);
                  const loaded = recipientsByList[list.id];
                  const rows = loaded && loaded !== 'loading' ? loaded : null;
                  const listExcluded = excludedCountForList(list.id);
                  const listTotal = rows ? rows.length : list.recipientCount || 0;
                  const search = (recipientSearch[list.id] || '').trim().toLowerCase();
                  const visibleRows = rows
                    ? rows.filter((r) =>
                        !search ||
                        [r.name, r.email, r.outlet].some((v) => (v || '').toLowerCase().includes(search))
                      )
                    : [];
                  return (
                    <div key={list.id} className="space-y-0">
                      <Card
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        } ${isExpanded ? 'rounded-b-none border-b-0' : ''}`}
                        onClick={() => toggleList(list.id)}
                      >
                        <CardContent className="flex items-center gap-3 p-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleList(list.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1">
                            <p className="font-medium">{list.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {listExcluded > 0 ? (
                                <>
                                  {listTotal - listExcluded} of {listTotal} recipient{listTotal !== 1 ? 's' : ''} selected
                                </>
                              ) : (
                                <>
                                  {listTotal} recipient{listTotal !== 1 ? 's' : ''}
                                </>
                              )}
                            </p>
                          </div>
                          {isSelected && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(list.id);
                              }}
                              aria-expanded={isExpanded}
                            >
                              <Users className="h-4 w-4" />
                              <span>Choose contacts</span>
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                      {isExpanded && (
                        <div className="rounded-b-lg border border-t-0 border-primary bg-background p-3 space-y-3">
                          {loaded === 'loading' || !rows ? (
                            <div className="text-center py-3">
                              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                            </div>
                          ) : rows.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-2">This list has no contacts yet.</p>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  value={recipientSearch[list.id] || ''}
                                  onChange={(e) =>
                                    setRecipientSearch((prev) => ({ ...prev, [list.id]: e.target.value }))
                                  }
                                  placeholder="Search name, outlet or email"
                                  className="h-8 flex-1 min-w-[12rem]"
                                />
                                <Button type="button" variant="outline" size="sm" onClick={() => setAllInList(list.id, true)}>
                                  Select all
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => setAllInList(list.id, false)}>
                                  Select none
                                </Button>
                              </div>
                              <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                                {visibleRows.length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-3">No contacts match your search.</p>
                                ) : (
                                  visibleRows.map((r) => {
                                    const included = !excludedRefs.has(recipientRefPath(list.id, r.id));
                                    return (
                                      <label
                                        key={r.id}
                                        className={`flex items-start gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 ${
                                          included ? '' : 'opacity-60'
                                        }`}
                                      >
                                        <Checkbox
                                          className="mt-0.5"
                                          checked={included}
                                          onCheckedChange={(checked) => setRecipientIncluded(list.id, r.id, checked === true)}
                                        />
                                        <span className="flex-1 min-w-0">
                                          <span className="font-medium">{r.name || r.email}</span>
                                          {r.outlet && <span className="text-muted-foreground"> · {r.outlet}</span>}
                                          <span className="block text-xs text-muted-foreground truncate">{r.email}</span>
                                        </span>
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Unticked contacts are left out of this send only. The list itself is unchanged.
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                {totalExcluded > 0 && (
                  <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">
                    {totalExcluded} contact{totalExcluded !== 1 ? 's' : ''} unticked and left out of this send.
                  </p>
                )}
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
              everyoneExcluded ||
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
