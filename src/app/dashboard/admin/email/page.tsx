'use client';
export const dynamic = 'force-dynamic';

/**
 * Email organisations — super-admin announcements, service notices and product updates
 * to the people who run each customer account. Partners are never included.
 *
 * Flow: choose the audience, write the message, preview who gets it, send yourself a
 * test, then send. The send is refused if the audience changed since the preview.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Send, Users, FlaskConical } from 'lucide-react';
import { format } from 'date-fns';

type OrgRow = { id: string; name: string; tier?: string | null; vertical?: string | null; isDemo?: boolean };

type Preview = {
  recipientCount: number;
  overLimit: boolean;
  maxRecipients: number;
  orgs: Array<{ id: string; name: string; recipientCount: number }>;
  skipped: { optedOut: number; noEmail: number; duplicate: number; orgsWithNoRecipients: number };
  recipients: Array<{ orgName: string; name: string; email: string; role: string }>;
};

type HistoryRow = {
  id: string;
  subject: string;
  category: 'service' | 'product';
  status: string;
  recipientCount: number;
  orgCount: number;
  sentCount: number;
  failedCount: number;
  createdAtMs: number | null;
  createdByEmail: string | null;
};

const TIER_OPTIONS = [
  { id: 'starter', label: 'Starter' },
  { id: 'professional', label: 'Professional' },
  { id: 'organisation', label: 'Organisation' },
  { id: 'enterprise', label: 'Enterprise' },
];
const VERTICAL_OPTIONS = [
  { id: 'dmo', label: 'DMO' },
  { id: 'education', label: 'Education' },
  { id: 'charity', label: 'Charity' },
  { id: 'trade-body', label: 'Trade Body' },
  { id: 'publisher', label: 'Publisher' },
];

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function EmailOrganisationsInner() {
  const { isSuperAdmin, isLoading: isUserDataLoading } = useUserData();
  const { user } = useFirebase();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [mode, setMode] = useState<'filter' | 'pick'>('filter');
  const [tiers, setTiers] = useState<string[]>([]);
  const [verticals, setVerticals] = useState<string[]>([]);
  const [includeDemo, setIncludeDemo] = useState(false);
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [roleScope, setRoleScope] = useState<'admins' | 'team'>('team');
  const [category, setCategory] = useState<'service' | 'product'>('product');
  const [fromName, setFromName] = useState('David at Press Pilot');
  const [replyTo, setReplyTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  // Deep link from the Organisations table: /dashboard/admin/email?orgId=xyz
  useEffect(() => {
    const id = searchParams.get('orgId');
    if (id) {
      setMode('pick');
      setOrgIds([id]);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user?.email && !replyTo) setReplyTo(user.email);
  }, [user, replyTo]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await httpsCallable(getFunctions(), 'listOrgEmails')({});
      setHistory(res.data as HistoryRow[]);
    } catch {
      /* history is secondary; the page still works without it */
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    httpsCallable(getFunctions(), 'listAllOrgs')({})
      .then((res) => {
        const rows = (res.data as any[]).map((o) => ({
          id: o.id,
          name: o.name || o.id,
          tier: o.tier ?? null,
          vertical: o.vertical ?? null,
          isDemo: o.isDemo === true,
        }));
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setOrgs(rows);
      })
      .catch((err) => toast({ variant: 'destructive', title: 'Could not load organisations', description: err?.message }));
    void loadHistory();
  }, [isSuperAdmin, loadHistory, toast]);

  const audience = useMemo(
    () =>
      mode === 'pick'
        ? { orgIds, roleScope }
        : { tiers, verticals, includeDemo, roleScope },
    [mode, orgIds, tiers, verticals, includeDemo, roleScope]
  );
  const audienceKey = JSON.stringify({ audience, category });
  const previewIsCurrent = preview !== null && previewKey === audienceKey;

  const filteredOrgs = orgs.filter((o) => o.name.toLowerCase().includes(orgSearch.trim().toLowerCase()));
  const composeReady = subject.trim().length > 0 && body.trim().length > 0;

  async function runPreview() {
    setIsPreviewing(true);
    try {
      const res = await httpsCallable(getFunctions(), 'previewOrgEmailAudience')({ audience, category });
      setPreview(res.data as Preview);
      setPreviewKey(audienceKey);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not preview audience', description: err?.message });
    } finally {
      setIsPreviewing(false);
    }
  }

  const payload = () => ({ audience, category, subject, body, replyTo, fromName });

  async function sendTest() {
    setIsTesting(true);
    try {
      const res = await httpsCallable(getFunctions(), 'sendOrgEmailTest')(payload());
      const d = res.data as { sentTo: string; personalisedAs: { name: string; orgName: string } };
      toast({ title: `Test sent to ${d.sentTo}`, description: `Personalised as ${d.personalisedAs.name || 'a recipient'} at ${d.personalisedAs.orgName}.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Test failed', description: err?.message });
    } finally {
      setIsTesting(false);
    }
  }

  async function send() {
    if (!preview) return;
    setIsSending(true);
    try {
      const res = await httpsCallable(getFunctions(), 'sendOrgEmail')({
        ...payload(),
        expectedRecipientCount: preview.recipientCount,
      });
      const d = res.data as { sentCount: number; failedCount: number; status: string };
      toast({
        variant: d.failedCount > 0 ? 'destructive' : 'default',
        title: d.failedCount > 0 ? `Sent to ${d.sentCount}, ${d.failedCount} failed` : `Sent to ${d.sentCount} people`,
      });
      setConfirmOpen(false);
      setSubject('');
      setBody('');
      setPreview(null);
      void loadHistory();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Send failed', description: err?.message });
      setConfirmOpen(false);
    } finally {
      setIsSending(false);
    }
  }

  if (!isUserDataLoading && !isSuperAdmin) {
    return <p className="text-sm text-muted-foreground">Super-admin access required.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Mail className="h-6 w-6" />
          Email organisations
        </h1>
        <p className="text-sm text-muted-foreground">
          Send an announcement, service notice or product update to the people who run customer accounts.
          Member businesses (partners) are never included.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Who it goes to</CardTitle>
          <CardDescription>Pick organisations by plan and sector, or choose them by name.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'filter' | 'pick')} className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="filter" id="mode-filter" />
              <Label htmlFor="mode-filter">All organisations, filtered</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="pick" id="mode-pick" />
              <Label htmlFor="mode-pick">Choose organisations</Label>
            </div>
          </RadioGroup>

          {mode === 'filter' ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Plan</Label>
                <p className="text-xs text-muted-foreground">Leave all unticked for every plan.</p>
                <div className="flex flex-wrap gap-4">
                  {TIER_OPTIONS.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={tiers.includes(t.id)} onCheckedChange={() => setTiers(toggle(tiers, t.id))} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Sector</Label>
                <p className="text-xs text-muted-foreground">Leave all unticked for every sector.</p>
                <div className="flex flex-wrap gap-4">
                  {VERTICAL_OPTIONS.map((v) => (
                    <label key={v.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={verticals.includes(v.id)} onCheckedChange={() => setVerticals(toggle(verticals, v.id))} />
                      {v.label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={includeDemo} onCheckedChange={(c) => setIncludeDemo(c === true)} />
                Include demo organisations
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Input
                  placeholder="Search organisations"
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  className="max-w-xs"
                />
                <span className="text-sm text-muted-foreground">{orgIds.length} selected</span>
                {orgIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setOrgIds([])}>
                    Clear
                  </Button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                {filteredOrgs.map((o) => (
                  <label key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                    <Checkbox checked={orgIds.includes(o.id)} onCheckedChange={() => setOrgIds(toggle(orgIds, o.id))} />
                    <span className="flex-1">{o.name}</span>
                    {o.isDemo && <Badge variant="outline">Demo</Badge>}
                    {o.tier && <Badge variant="secondary" className="capitalize">{o.tier}</Badge>}
                  </label>
                ))}
                {filteredOrgs.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No organisations match.</p>}
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label>People in each organisation</Label>
            <RadioGroup value={roleScope} onValueChange={(v) => setRoleScope(v as 'admins' | 'team')} className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="team" id="scope-team" />
                <Label htmlFor="scope-team">Whole team (Admins and Users)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="admins" id="scope-admins" />
                <Label htmlFor="scope-admins">Admins only</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. The message</CardTitle>
          <CardDescription>
            Plain text. Leave a blank line between paragraphs; links become clickable. Personalise with{' '}
            <code>{'{{first_name}}'}</code> and <code>{'{{org_name}}'}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup value={category} onValueChange={(v) => setCategory(v as 'service' | 'product')} className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="cat-product" className="flex gap-3 rounded-md border p-3 cursor-pointer">
                <RadioGroupItem value="product" id="cat-product" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Product update</span>
                  <span className="block text-xs text-muted-foreground">
                    News, features, tips, invitations. Skips anyone who has turned off product updates, and includes a manage link.
                  </span>
                </span>
              </label>
              <label htmlFor="cat-service" className="flex gap-3 rounded-md border p-3 cursor-pointer">
                <RadioGroupItem value="service" id="cat-service" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Service notice</span>
                  <span className="block text-xs text-muted-foreground">
                    Billing, security, planned downtime, changes to terms. Goes to everyone selected.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="from-name">From name</Label>
              <Input id="from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reply-to">Replies go to</Label>
              <Input id="reply-to" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              placeholder={'Hi {{first_name}},\n\n...\n\nDavid'}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Check and send</CardTitle>
          <CardDescription>Preview the recipients, send yourself a test, then send.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runPreview} disabled={isPreviewing || (mode === 'pick' && orgIds.length === 0)}>
              {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Preview recipients
            </Button>
            <Button variant="outline" onClick={sendTest} disabled={isTesting || !composeReady}>
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Send me a test
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!composeReady || !previewIsCurrent || !preview || preview.recipientCount === 0 || preview.overLimit}
            >
              <Send className="h-4 w-4" />
              Send{previewIsCurrent && preview ? ` to ${preview.recipientCount}` : ''}
            </Button>
          </div>
          {preview && !previewIsCurrent && (
            <p className="text-sm text-amber-600">The audience has changed. Preview again before sending.</p>
          )}

          {preview && previewIsCurrent && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{preview.recipientCount}</strong> people across{' '}
                <strong>{preview.orgs.filter((o) => o.recipientCount > 0).length}</strong> organisations.
                {preview.skipped.optedOut > 0 && ` ${preview.skipped.optedOut} opted out of product updates.`}
                {preview.skipped.duplicate > 0 && ` ${preview.skipped.duplicate} duplicate addresses merged.`}
                {preview.skipped.noEmail > 0 && ` ${preview.skipped.noEmail} without an email address.`}
                {preview.skipped.orgsWithNoRecipients > 0 &&
                  ` ${preview.skipped.orgsWithNoRecipients} selected organisations have nobody to send to.`}
              </p>
              {preview.overLimit && (
                <p className="text-sm text-destructive">
                  That is over the {preview.maxRecipients}-person limit for one send. Narrow the audience.
                </p>
              )}
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Organisation</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.recipients.map((r) => (
                      <tr key={r.email}>
                        <td className="px-3 py-1.5">{r.orgName}</td>
                        <td className="px-3 py-1.5">{r.name || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{r.email}</td>
                        <td className="px-3 py-1.5">{r.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.recipientCount > preview.recipients.length && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Showing the first {preview.recipients.length} of {preview.recipientCount}.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sent</CardTitle>
          <CardDescription>The last 25 emails sent from here.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {history.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex-1 min-w-[12rem] font-medium">{h.subject}</span>
                  <Badge variant="outline">{h.category === 'service' ? 'Service notice' : 'Product update'}</Badge>
                  <span className="text-muted-foreground">
                    {h.sentCount}/{h.recipientCount} people, {h.orgCount} orgs
                    {h.failedCount > 0 && <span className="text-destructive">, {h.failedCount} failed</span>}
                  </span>
                  <span className="text-muted-foreground">{h.createdAtMs ? format(h.createdAtMs, 'd MMM yyyy, HH:mm') : ''}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !isSending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {preview?.recipientCount} people?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{subject}&rdquo; will go to {preview?.recipientCount} people across{' '}
              {preview?.orgs.filter((o) => o.recipientCount > 0).length} organisations as a{' '}
              {category === 'service' ? 'service notice' : 'product update'}. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
              disabled={isSending}
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function EmailOrganisationsPage() {
  return (
    <Suspense fallback={null}>
      <EmailOrganisationsInner />
    </Suspense>
  );
}
