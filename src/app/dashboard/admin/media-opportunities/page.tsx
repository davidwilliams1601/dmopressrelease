'use client';
export const dynamic = 'force-dynamic';

/**
 * Superadmin console for the Media Opportunities source registry.
 *
 * The registry is the honest core of the whole feature: if a feed is dead, mis-tagged or
 * quietly failing, every opportunity built on it is worth less. So this page is built
 * around three operator jobs, in order of how often they are needed:
 *
 *   1. See health at a glance — last fetch, item count, consecutive failures, last error.
 *   2. Test a feed URL BEFORE trusting it, and see exactly what would be parsed.
 *   3. Run ingestion or generation on demand (demo prep, and verifying a fix).
 *
 * Gating follows src/app/dashboard/admin/media-network/page.tsx: non-superadmins are
 * redirected to /dashboard rather than shown a permission error.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, orderBy, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { formatTimestamp } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Download, Play, Radar, RefreshCw, Tags, TestTube2 } from 'lucide-react';
import type { MediaSource } from '@/lib/types';

type FeedTest = {
  ok: boolean;
  error?: string;
  itemCount?: number;
  sample?: Array<{
    title: string;
    url: string;
    publishedAt: string | null;
    hasSummary: boolean;
    author: string | null;
  }>;
};

export default function MediaOpportunitiesAdminPage() {
  const { isSuperAdmin, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState<FeedTest | null>(null);

  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) router.replace('/dashboard');
  }, [isUserLoading, isSuperAdmin, router]);

  const sourcesRef = useMemoFirebase(() => {
    if (!isSuperAdmin) return null;
    return query(collection(firestore, 'mediaSources'), orderBy('name', 'asc'));
  }, [firestore, isSuperAdmin]);

  const { data: sourcesData, isLoading: isSourcesLoading } = useCollection<MediaSource>(sourcesRef);
  const sources = sourcesData || [];

  async function run(name: string, fn: () => Promise<any>, successTitle: string) {
    setBusy(name);
    try {
      const result = await fn();
      toast({
        title: successTitle,
        description:
          result && typeof result === 'object'
            ? Object.entries(result)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')
            : undefined,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'That did not work',
        description: err?.message || 'Check the function logs.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function testFeed() {
    setBusy('test');
    setTestResult(null);
    try {
      const call = httpsCallable<{ feedUrl: string }, FeedTest>(
        getFunctions(),
        'testMediaSourceFeed'
      );
      const res = await call({ feedUrl: testUrl.trim() });
      setTestResult(res.data);
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message || 'Request failed.' });
    } finally {
      setBusy(null);
    }
  }

  if (isUserLoading || !isSuperAdmin) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const failing = sources.filter((s) => (s.consecutiveFailures || 0) > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Media Sources</h1>
        <p className="text-muted-foreground">
          The curated feeds behind Media Opportunities. Permitted feeds only — nothing here
          works around a publisher&apos;s access controls.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            run(
              'seed',
              async () => (await httpsCallable(getFunctions(), 'seedMediaSources')()).data,
              'Seed source set installed'
            )
          }
        >
          <Download className="mr-1.5 h-4 w-4" />
          Install / refresh seed sources
        </Button>
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            run(
              'ingest',
              async () => (await httpsCallable(getFunctions(), 'runMediaIngestionNow')()).data,
              'Ingestion complete'
            )
          }
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Run ingestion now
        </Button>
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            run(
              'generate',
              async () =>
                (await httpsCallable(getFunctions(), 'runMediaOpportunityGenerationNow')()).data,
              'Generation complete'
            )
          }
        >
          <Play className="mr-1.5 h-4 w-4" />
          Run generation now
        </Button>
        {/*
          Ingestion is write-once, so a tagging fix reaches only future items. These two re-derive
          tags for the stored pool from each item's own title and summary. Preview first: it
          reports what would change without writing, which is the only safe way to look at a mass
          update of the evidence pool sitting behind an already-printed brief.
        */}
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            run(
              'retag-dry',
              async () =>
                (await httpsCallable(getFunctions(), 'retagMediaItems')({ dryRun: true })).data,
              'Retag preview — nothing was written'
            )
          }
        >
          <Tags className="mr-1.5 h-4 w-4" />
          Preview retag
        </Button>
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => {
            if (
              !window.confirm(
                'Retag every stored item using the current tagging rules?\n\nThis rewrites topicTags and matchTrail on existing items. Titles, URLs and dates are untouched and no feed is fetched. Run “Preview retag” first if you have not.'
              )
            )
              return;
            run(
              'retag',
              async () =>
                (await httpsCallable(getFunctions(), 'retagMediaItems')({ dryRun: false })).data,
              'Stored items retagged'
            );
          }}
        >
          <Tags className="mr-1.5 h-4 w-4" />
          Retag stored items
        </Button>
      </div>

      {failing.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {failing.length} {failing.length === 1 ? 'source is' : 'sources are'} failing
            </CardTitle>
            <CardDescription>
              A source is disabled automatically after repeated failures, so a dead feed cannot
              quietly weaken the evidence behind every card.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube2 className="h-5 w-5" />
            Test a feed
          </CardTitle>
          <CardDescription>
            Fetches and parses the URL without writing anything. Check a feed before adding it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[280px] flex-1">
              <Label htmlFor="feedUrl">Feed URL (https)</Label>
              <Input
                id="feedUrl"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://example.com/feed/"
              />
            </div>
            <Button onClick={testFeed} disabled={busy !== null || !testUrl.trim()}>
              Test
            </Button>
          </div>

          {testResult && (
            <div className="rounded-md border p-3 text-sm">
              {testResult.ok ? (
                <>
                  <p className="font-medium">
                    Parsed {testResult.itemCount} {testResult.itemCount === 1 ? 'item' : 'items'}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(testResult.sample || []).map((s) => (
                      <li key={s.url}>
                        <span>{s.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {s.publishedAt
                            ? new Date(s.publishedAt).toLocaleString('en-GB')
                            : 'no date in feed'}
                          {s.author ? ` · ${s.author}` : ''}
                          {s.hasSummary ? ' · has summary' : ' · no summary'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {testResult.itemCount === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      A valid document with no items is not usable — check whether the publisher
                      has moved the feed.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-destructive">{testResult.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5" />
            Registry ({sources.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isSourcesLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sources yet. Use “Install / refresh seed sources” above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Last fetch</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-medium">{s.name}</span>
                      <a
                        href={s.feedUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="block max-w-[280px] truncate text-xs text-muted-foreground hover:underline"
                      >
                        {s.feedUrl}
                      </a>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(s.geographies || []).join(', ') || '—'}
                      <span className="block">{(s.defaultTopics || []).join(', ') || '—'}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatTimestamp(s.lastCheckedAt, 'd MMM HH:mm')}
                      {s.lastSuccessAt && (
                        <span className="block text-muted-foreground">
                          ok {formatTimestamp(s.lastSuccessAt, 'd MMM HH:mm')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {s.lastItemCount ?? '—'}
                    </TableCell>
                    <TableCell>
                      {!s.enabled ? (
                        <Badge variant="secondary">Disabled</Badge>
                      ) : (s.consecutiveFailures || 0) > 0 ? (
                        <Badge variant="destructive" title={s.lastError || undefined}>
                          {s.consecutiveFailures} failing
                        </Badge>
                      ) : (
                        <Badge variant="outline">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
