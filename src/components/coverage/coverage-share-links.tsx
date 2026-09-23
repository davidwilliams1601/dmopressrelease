'use client';

/**
 * Create, copy and withdraw share links for a coverage report — the CoverageBook-style link an
 * org sends to its board, funders or members. The link opens /report/{token}; the report is
 * rebuilt from live records each time it is opened, for the period fixed when it was created.
 */

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Copy, Link2, Loader2, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { CoverageReportShareLink } from '@/lib/types';
import type { DateRange } from '@/lib/report-utils';

type Props = {
  orgId: string;
  range: DateRange;
  periodLabel: string;
  isAdmin: boolean;
  sensitiveCount: number;
};

export function CoverageShareLinks({ orgId, range, periodLabel, isAdmin, sensitiveCount }: Props) {
  const { toast } = useToast();
  const [links, setLinks] = useState<CoverageReportShareLink[] | null>(null);
  const [title, setTitle] = useState('');
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [ttlDays, setTtlDays] = useState('90');
  const [busy, setBusy] = useState(false);

  useEffect(() => setTitle(`Coverage report — ${periodLabel}`), [periodLabel]);

  const load = useCallback(async () => {
    try {
      const res = await httpsCallable(getFunctions(), 'listCoverageReportShareLinks')({ orgId });
      setLinks((res.data as { links: CoverageReportShareLink[] }).links);
    } catch {
      setLinks([]);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const res = await httpsCallable(getFunctions(), 'createCoverageReportShareLink')({
        orgId,
        startMs: range.from.getTime(),
        endMs: range.to.getTime(),
        title,
        includeSensitive,
        ttlDays: Number(ttlDays),
      });
      const { url } = res.data as { url: string };
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      toast({ title: 'Share link created', description: 'Copied to your clipboard.' });
      await load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not create link', description: err?.message });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    try {
      await httpsCallable(getFunctions(), 'revokeCoverageReportShareLink')({ orgId, token });
      toast({ title: 'Link withdrawn', description: 'Anyone opening it now sees that it has been withdrawn.' });
      await load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not withdraw link', description: err?.message });
    }
  }

  const now = Date.now();

  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle className="text-base">Share this report</CardTitle>
        <CardDescription>
          A read-only link for your board, funders or members. It shows placements for the period below, updated as you log more.
          Notes and who logged each placement are never shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin ? (
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="share-title">Title</Label>
              <Input id="share-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Expires after</Label>
              <Select value={ttlDays} onValueChange={setTtlDays}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="share-sensitive" checked={includeSensitive} onCheckedChange={setIncludeSensitive} />
              <Label htmlFor="share-sensitive" className="text-sm">
                Include sensitive{sensitiveCount ? ` (${sensitiveCount})` : ''}
              </Label>
            </div>
            <Button onClick={create} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Create link
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Only an Admin can create share links.</p>
        )}

        {links === null ? (
          <p className="text-sm text-muted-foreground">Loading links…</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">No share links yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {links.map((l) => {
              const expired = l.expiresAtMs !== null && l.expiresAtMs < now;
              const live = !l.revoked && !expired;
              return (
                <li key={l.token} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{l.title}</span>
                      {l.revoked ? <Badge variant="outline">Withdrawn</Badge> : expired ? <Badge variant="outline">Expired</Badge> : <Badge>Live</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {l.startMs && l.endMs ? `${format(l.startMs, 'd MMM yyyy')} – ${format(l.endMs, 'd MMM yyyy')}` : ''}
                      {' · '}
                      Opened {l.viewCount} {l.viewCount === 1 ? 'time' : 'times'} by {l.distinctViewerCount} {l.distinctViewerCount === 1 ? 'reader' : 'readers'}
                      {l.lastViewedAtMs ? `, last ${format(l.lastViewedAtMs, 'd MMM')}` : ''}
                      {l.includeSensitive ? ' · includes sensitive' : ''}
                    </p>
                  </div>
                  {live && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await navigator.clipboard?.writeText(l.url).catch(() => undefined);
                          toast({ title: 'Link copied' });
                        }}
                      >
                        <Copy className="mr-1 h-3 w-3" /> Copy
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => revoke(l.token)}>
                          <Ban className="mr-1 h-3 w-3" /> Withdraw
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
