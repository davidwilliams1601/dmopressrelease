'use client';

/**
 * Follow-ups on a sent release.
 *
 * Press Pilot suggests who is worth a second, personal touch, and a person decides.
 * Nothing here sends automatically:
 *  - Opened or clicked, no reply: a short personal follow-up drafted for the sender's
 *    own mailbox (mailto), which must carry something new. Then it is logged.
 *  - Not opened, and nobody else at that outlet has engaged: one other contact at the
 *    same outlet is suggested. Sending to them is a real send, so it is confirmed first
 *    and goes through the approachAlternativeContact callable.
 * The rules live in src/lib/follow-up-core.ts.
 */

import { useMemo, useState } from 'react';
import { doc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { format } from 'date-fns';
import { Check, ChevronDown, Copy, Mail, MessageSquareReply, UserRoundSearch } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { useToast } from '@/hooks/use-toast';
import { useFollowUpPlan } from '@/hooks/use-follow-up-plan';
import { toDate } from '@/lib/utils';
import {
  FOLLOW_UP_CHANNEL_LABELS,
  FOLLOW_UP_HOOKS,
  FOLLOW_UP_OUTCOME_LABELS,
  buildFollowUpDraft,
  firstNameOf,
  mailtoHref,
  normaliseOutlet,
  validateNewValue,
  type FollowUpChannel,
  type FollowUpHook,
  type FollowUpOutcome,
  type FollowUpPlan,
  type FollowUpRow,
  type FollowUpStatus,
} from '@/lib/follow-up-core';
import type { Organization, Release, ReleaseFollowUp } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Props = { release: Release; orgId: string; organization?: Organization | null };

const OFF_PLATFORM: FollowUpChannel[] = ['phone', 'linkedin', 'whatsapp', 'in_person', 'other'];

export function FollowUpCard({ release, orgId, organization }: Props) {
  const { firestore, user } = useFirebase();
  const { name: userName, role } = useUserData();
  const { toast } = useToast();
  const { plan, records, isLoading, hasPendingJob } = useFollowUpPlan(orgId, release);

  const isTeam = role === 'Admin' || role === 'User';
  if (!isTeam) return null;

  async function log(row: FollowUpRow, status: FollowUpStatus, extra: { channel?: FollowUpChannel; hook?: FollowUpHook; outcome?: FollowUpOutcome } = {}) {
    const key = row.recipient.key;
    const counts = status === 'followed_up' || status === 'off_platform';
    try {
      await setDoc(
        doc(firestore, 'orgs', orgId, 'releases', release.id, 'followUps', key),
        {
          orgId,
          releaseId: release.id,
          ...(row.recipient.recipientRef ? { recipientRef: row.recipient.recipientRef } : {}),
          name: row.recipient.name,
          outlet: row.recipient.outlet,
          outletKey: normaliseOutlet(row.recipient.outlet),
          status,
          channel: extra.channel ?? null,
          ...(extra.hook ? { hook: extra.hook } : {}),
          ...(extra.outcome ? { outcome: extra.outcome } : {}),
          ...(counts ? { count: increment(1) } : {}),
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || '',
        },
        { merge: true }
      );
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not save', description: (e as Error).message });
    }
  }

  async function setOutcome(row: FollowUpRow, outcome: FollowUpOutcome | null) {
    try {
      const ref = doc(firestore, 'orgs', orgId, 'releases', release.id, 'followUps', row.recipient.key);
      if (records[row.recipient.key]) {
        await updateDoc(ref, { outcome, updatedAt: serverTimestamp(), updatedBy: user?.uid || '' });
      } else if (outcome) {
        // A reply to the original email, with no follow-up needed.
        await log(row, 'no_follow_up', { outcome });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not save', description: (e as Error).message });
    }
  }

  async function sendAlternative(row: FollowUpRow) {
    if (!row.alternative || !row.recipient.recipientRef) return;
    try {
      await httpsCallable(getFunctions(), 'approachAlternativeContact')({
        orgId,
        releaseId: release.id,
        originalRecipientRef: row.recipient.recipientRef,
        alternativeRecipientRef: row.alternative.contact.recipientRef,
      });
      toast({
        title: organization?.isDemo ? 'Sent (demo, simulated)' : 'Sent',
        description: `The release is on its way to ${row.alternative.contact.name}.`,
      });
      return true;
    } catch (e) {
      toast({ variant: 'destructive', title: 'Not sent', description: (e as Error).message });
      return false;
    }
  }

  async function setClosed(value: boolean) {
    try {
      await updateDoc(doc(firestore, 'orgs', orgId, 'releases', release.id), {
        followUpsClosedAt: value ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not save', description: (e as Error).message });
    }
  }

  return (
    <FollowUpCardView
      release={release}
      organization={organization}
      plan={plan}
      records={records}
      isLoading={isLoading}
      hasPendingJob={hasPendingJob}
      senderName={userName || ''}
      onLog={log}
      onOutcome={setOutcome}
      onSendAlternative={sendAlternative}
      onSetClosed={setClosed}
    />
  );
}

/** Presentational half, kept separate so it can be previewed without Firestore. */
export function FollowUpCardView({
  release,
  organization,
  plan,
  records,
  isLoading,
  hasPendingJob,
  senderName,
  onLog: log,
  onOutcome: setOutcome,
  onSendAlternative,
  onSetClosed: setClosed,
}: {
  release: Release;
  organization?: Organization | null;
  plan: FollowUpPlan | null;
  records: Record<string, ReleaseFollowUp>;
  isLoading: boolean;
  hasPendingJob: boolean;
  senderName: string;
  onLog: (row: FollowUpRow, status: FollowUpStatus, extra?: { channel?: FollowUpChannel; hook?: FollowUpHook; outcome?: FollowUpOutcome }) => Promise<void>;
  onOutcome: (row: FollowUpRow, outcome: FollowUpOutcome | null) => Promise<void>;
  onSendAlternative: (row: FollowUpRow) => Promise<boolean | undefined>;
  onSetClosed: (closed: boolean) => Promise<void>;
}) {
  const [draftFor, setDraftFor] = useState<{ row: FollowUpRow; again: boolean } | null>(null);
  const [altFor, setAltFor] = useState<FollowUpRow | null>(null);
  const [sendingAlt, setSendingAlt] = useState(false);
  const closed = !!release.followUpsClosedAt;

  const groups = useMemo(() => {
    const rows = (plan?.rows || []).filter((r) => r.recipient.source === 'customer');
    return {
      opened: rows.filter((r) => r.category === 'clicked' || r.category === 'opened'),
      notOpened: rows.filter((r) => r.category === 'not_opened'),
      closed: rows.filter((r) => r.category === 'closed'),
    };
  }, [plan]);

  async function sendAlternative(row: FollowUpRow) {
    setSendingAlt(true);
    const ok = await onSendAlternative(row);
    setSendingAlt(false);
    if (ok) setAltFor(null);
  }

  const c = plan?.counts;
  const openedDue = (c?.clickedDue || 0) + (c?.openedDue || 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-xl">Follow-ups</CardTitle>
          <CardDescription className="max-w-2xl">
            {isLoading
              ? 'Checking who has opened this release…'
              : closed
                ? `Follow-ups closed on ${format(toDate(release.followUpsClosedAt), 'd MMM yyyy')}.`
                : plan?.summary}
          </CardDescription>
        </div>
        {!isLoading && plan && plan.rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setClosed(!closed)}>
            {closed ? 'Reopen follow-ups' : 'Close follow-ups'}
          </Button>
        )}
      </CardHeader>

      {!isLoading && plan && plan.rows.length > 0 && !closed && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Stat label="Opened, no reply" value={openedDue} emphasis={openedDue > 0} />
            <Stat label="Outlets with another contact" value={c?.alternatives || 0} emphasis={(c?.alternatives || 0) > 0} />
            <Stat label="Too early" value={c?.waiting || 0} />
            <Stat label="Done" value={c?.done || 0} />
          </div>

          {plan.stale && (
            <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              This release went out {plan.workingDaysSinceSend} working days ago. A follow-up now rarely lands; you can close
              follow-ups for this release.
            </p>
          )}
          {hasPendingJob && (
            <p className="text-sm text-muted-foreground">A send to an alternative contact is going out now.</p>
          )}

          <Tabs defaultValue={openedDue > 0 || (c?.alternatives || 0) === 0 ? 'opened' : 'not-opened'}>
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="opened">Opened ({groups.opened.length})</TabsTrigger>
              <TabsTrigger value="not-opened">Not opened ({groups.notOpened.length})</TabsTrigger>
              <TabsTrigger value="closed">Bounced or opted out ({groups.closed.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="opened" className="mt-3 space-y-2">
              <Hint>
                Clicked: follow up after 1 working day. Opened: after 2. A personal note from your own inbox, with one new
                thing to offer. Once per journalist.
              </Hint>
              {groups.opened.length === 0 && <Empty>Nobody has opened this release yet.</Empty>}
              {groups.opened.map((row) => (
                <RecipientRow
                  key={row.recipient.key}
                  row={row}
                  record={records[row.recipient.key]}
                  onDraft={(again) => setDraftFor({ row, again })}
                  onLog={(status, channel) => log(row, status, { channel })}
                  onOutcome={(o) => setOutcome(row, o)}
                  onAlternative={() => setAltFor(row)}
                />
              ))}
            </TabsContent>

            <TabsContent value="not-opened" className="mt-3 space-y-2">
              <Hint>
                After 2 working days, if nobody at the outlet has opened it, try one other relevant contact there rather than
                resending to the same person.
              </Hint>
              {groups.notOpened.length === 0 && <Empty>Everyone has opened this release.</Empty>}
              {groups.notOpened.map((row) => (
                <RecipientRow
                  key={row.recipient.key}
                  row={row}
                  record={records[row.recipient.key]}
                  onDraft={(again) => setDraftFor({ row, again })}
                  onLog={(status, channel) => log(row, status, { channel })}
                  onOutcome={(o) => setOutcome(row, o)}
                  onAlternative={() => setAltFor(row)}
                />
              ))}
            </TabsContent>

            <TabsContent value="closed" className="mt-3 space-y-2">
              <Hint>These contacts will not be suggested for a follow-up.</Hint>
              {groups.closed.length === 0 && <Empty>No bounces or opt-outs.</Empty>}
              {groups.closed.map((row) => (
                <div key={row.recipient.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <Who row={row} />
                  <Badge variant="outline">
                    {row.closedReason === 'bounced' ? 'Bounced' : row.closedReason === 'opted_out' ? 'Opted out' : 'Not delivered'}
                  </Badge>
                </div>
              ))}
            </TabsContent>
          </Tabs>

          {(c?.network || 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              {c!.network} Press Pilot network {c!.network === 1 ? 'contact was' : 'contacts were'} also sent this release. Their
              details stay private, so they are not listed here.
            </p>
          )}
        </CardContent>
      )}

      {!isLoading && plan && plan.rows.length === 0 && (
        <CardContent>
          <Empty>Recipients appear here once the send has finished.</Empty>
        </CardContent>
      )}

      {draftFor && (
        <DraftDialog
          row={draftFor.row}
          again={draftFor.again}
          release={release}
          senderName={senderName}
          orgName={organization?.name || ''}
          onClose={() => setDraftFor(null)}
          onSent={async (hook) => {
            await log(draftFor.row, 'followed_up', { channel: 'email', hook });
            setDraftFor(null);
          }}
        />
      )}

      <AlertDialog open={!!altFor} onOpenChange={(o) => !o && !sendingAlt && setAltFor(null)}>
        {altFor?.alternative && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send this release to {altFor.alternative.contact.name}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {altFor.alternative.contact.name}
                    {altFor.alternative.contact.position ? `, ${altFor.alternative.contact.position},` : ''} works at{' '}
                    {altFor.recipient.outlet}.{' '}
                    {altFor.alternative.why === 'not_opened'
                      ? `${altFor.recipient.name} hasn't opened it.`
                      : `${altFor.recipient.name} hasn't replied to your follow-up.`}
                  </p>
                  <p>
                    Press Pilot sends the release as it went out, from {organization?.name || 'your organisation'}. You can try one
                    alternative per outlet for each release.
                  </p>
                  {organization?.isDemo && <p>This is a demo organisation, so the send is simulated and no email leaves Press Pilot.</p>}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sendingAlt}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={sendingAlt}
                onClick={(e) => {
                  e.preventDefault();
                  void sendAlternative(altFor);
                }}
              >
                {sendingAlt ? 'Sending…' : `Send to ${firstNameOf(altFor.alternative.contact.name)}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Stat({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-1.5 ${emphasis ? 'border-primary/40 bg-primary/5' : ''}`}>
      <span className="font-semibold tabular-nums">{value}</span> <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

function Who({ row }: { row: FollowUpRow }) {
  const r = row.recipient;
  return (
    <div className="min-w-0">
      <div className="font-medium">{r.name}</div>
      <div className="text-xs text-muted-foreground">{[r.position, r.outlet].filter(Boolean).join(', ')}</div>
    </div>
  );
}

function engagementText(row: FollowUpRow): string {
  const r = row.recipient;
  if (r.clicks > 0) return `Opened ${r.opens || 1} ${r.opens === 1 ? 'time' : 'times'}, clicked a link`;
  if (r.opens > 0) return `Opened ${r.opens} ${r.opens === 1 ? 'time' : 'times'}`;
  return 'Not opened';
}

function StateBadge({ row, record }: { row: FollowUpRow; record?: ReleaseFollowUp }) {
  if (record?.outcome) {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{FOLLOW_UP_OUTCOME_LABELS[record.outcome]}</Badge>;
  }
  if (record) {
    const label =
      record.status === 'alternative_sent'
        ? `Sent to ${record.alternativeName || 'alternative'}`
        : record.status === 'no_follow_up'
          ? 'No follow-up needed'
          : record.status === 'off_platform'
            ? `Followed up: ${FOLLOW_UP_CHANNEL_LABELS[(record.channel || 'other') as FollowUpChannel]}`
            : 'Followed up by email';
    return <Badge variant="secondary">{label}</Badge>;
  }
  if (row.state === 'waiting') return <Badge variant="outline">From {format(new Date(row.dueAtMs), 'EEE d MMM')}</Badge>;
  if (row.state === 'stale') return <Badge variant="outline">No longer timely</Badge>;
  if (row.category === 'clicked') return <Badge>Follow up now</Badge>;
  if (row.category === 'opened') return <Badge>Follow up now</Badge>;
  return <Badge variant="outline">Not opened</Badge>;
}

function RecipientRow({
  row,
  record,
  onDraft,
  onLog,
  onOutcome,
  onAlternative,
}: {
  row: FollowUpRow;
  record?: ReleaseFollowUp;
  onDraft: (again: boolean) => void;
  onLog: (status: FollowUpStatus, channel?: FollowUpChannel) => void;
  onOutcome: (o: FollowUpOutcome | null) => void;
  onAlternative: () => void;
}) {
  const engaged = row.category === 'clicked' || row.category === 'opened';
  const canAct = row.state === 'due' || row.state === 'stale';
  const done = row.state === 'done';
  const alt = row.alternative;

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Who row={row} />
        <StateBadge row={row} record={record} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {engagementText(row)}
        {row.openedRepeatedly && !done ? '. Plenty of interest, so keep it light.' : ''}
        {!engaged && row.outletEngaged ? `. Someone else at ${row.recipient.outlet} opened it.` : ''}
        {!engaged && !row.outletEngaged && !alt && canAct ? `. No other contact at ${row.recipient.outlet} in your lists.` : ''}
      </div>

      {alt && (
        <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
          <div className="flex items-start gap-2">
            <UserRoundSearch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div>
                Try <span className="font-medium">{alt.contact.name}</span>
                {alt.contact.position ? `, ${alt.contact.position}` : ''}
                {alt.why === 'no_reply_after_follow_up' ? ': no reply since your follow-up.' : '.'}
              </div>
              <div className="text-xs text-muted-foreground">
                {alt.reasons.join(' · ')}
                {alt.otherCount > 0 ? ` · ${alt.otherCount} more at this outlet in your lists` : ''}
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={onAlternative}>
              <Mail className="mr-1.5 h-4 w-4" /> Send release to {firstNameOf(alt.contact.name)}
            </Button>
            {!record && (
              <Button size="sm" variant="ghost" onClick={() => onLog('no_follow_up')}>
                Not now
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {engaged && canAct && !record && (
          <Button size="sm" onClick={() => onDraft(false)}>
            <MessageSquareReply className="mr-1.5 h-4 w-4" /> Draft follow-up
          </Button>
        )}
        {engaged && done && record?.status === 'followed_up' && !record.outcome && (
          <Button size="sm" variant="ghost" onClick={() => onDraft(true)}>
            Follow up again
          </Button>
        )}
        {!done && (canAct || row.state === 'waiting') && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Log <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Followed up another way</DropdownMenuLabel>
              {OFF_PLATFORM.map((ch) => (
                <DropdownMenuItem key={ch} onClick={() => onLog('off_platform', ch)}>
                  {FOLLOW_UP_CHANNEL_LABELS[ch]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onOutcome('replied')}>They replied</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onLog('no_follow_up')}>No follow-up needed</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {done && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Outcome</span>
            <Select value={record?.outcome || 'none'} onValueChange={(v) => onOutcome(v === 'none' ? null : (v as FollowUpOutcome))}>
              <SelectTrigger className="h-8 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No reply yet</SelectItem>
                {(Object.keys(FOLLOW_UP_OUTCOME_LABELS) as FollowUpOutcome[]).map((o) => (
                  <SelectItem key={o} value={o}>
                    {FOLLOW_UP_OUTCOME_LABELS[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

function DraftDialog({
  row,
  again,
  release,
  senderName,
  orgName,
  onClose,
  onSent,
}: {
  row: FollowUpRow;
  again: boolean;
  release: Release;
  senderName: string;
  orgName: string;
  onClose: () => void;
  onSent: (hook: FollowUpHook) => Promise<void>;
}) {
  const [hook, setHook] = useState<FollowUpHook>('new_angle');
  const [value, setValue] = useState('');
  const [edited, setEdited] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const error = validateNewValue(value);
  const hookDef = FOLLOW_UP_HOOKS.find((h) => h.id === hook)!;

  const generated = buildFollowUpDraft({
    recipientName: row.recipient.name,
    headline: release.headline,
    sentAtMs: row.recipient.sentAtMs,
    hook,
    newValue: value,
    senderName,
    orgName,
  });
  const draft = edited || generated;
  const email = row.recipient.email || '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Follow up with {row.recipient.name}</DialogTitle>
          <DialogDescription>
            This opens in your own email, so the reply comes straight to you. It never mentions that they opened the release.
          </DialogDescription>
        </DialogHeader>

        {again && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            You have already followed up once. A second chase rarely helps unless you have something genuinely new.
          </p>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>What&apos;s new since the release?</Label>
            <Select
              value={hook}
              onValueChange={(v) => {
                setHook(v as FollowUpHook);
                setEdited(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOLLOW_UP_HOOKS.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fu-value">One sentence</Label>
            <Textarea
              id="fu-value"
              rows={2}
              value={value}
              placeholder={hookDef.placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                setEdited(null);
              }}
            />
            {value.length > 0 && error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fu-subject">Subject</Label>
            <Input id="fu-subject" value={draft.subject} onChange={(e) => setEdited({ ...draft, subject: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fu-body">Message</Label>
            <Textarea id="fu-body" rows={9} value={draft.body} onChange={(e) => setEdited({ ...draft, body: e.target.value })} />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button
            variant="outline"
            disabled={!!error}
            onClick={async () => {
              await navigator.clipboard.writeText(`To: ${email}\nSubject: ${draft.subject}\n\n${draft.body}`);
              setCopied(true);
            }}
          >
            {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <div className="flex flex-wrap gap-2">
            {copied && (
              <Button variant="outline" onClick={() => onSent(hook)}>
                Mark as sent
              </Button>
            )}
            <Button asChild disabled={!!error || !email}>
              <a
                href={error || !email ? undefined : mailtoHref(email, draft.subject, draft.body)}
                aria-disabled={!!error || !email}
                className={error || !email ? 'pointer-events-none opacity-50' : ''}
                onClick={() => {
                  if (!error && email) void onSent(hook);
                }}
              >
                <Mail className="mr-1.5 h-4 w-4" /> Open in email
              </a>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
