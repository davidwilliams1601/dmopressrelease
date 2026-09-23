'use client';

/**
 * The top of the organisation dashboard: what needs attention today, and what the work
 * produced over the last 90 days against the 90 before, with a peer comparison when there
 * are enough peers for one to mean anything.
 *
 * All counts come from dashboard-core, from records the organisation already holds. Nothing
 * is estimated. Placements are dated by the article, so a release sent in June and covered in
 * July counts in July.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import { toDate } from '@/lib/utils';
import {
  buildAttentionItems,
  buildOutcomeChain,
  comparePeriods,
  describePeerBenchmark,
  formatDelta,
  type PeerBenchmark,
} from '@/lib/dashboard-core';
import type { CoverageRecord, MediaOpportunity, PartnerSubmission, Release } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 90;

function ms(v: unknown): number | null {
  if (!v) return null;
  const d = toDate(v);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

export function AttentionAndOutcomes({
  orgId,
  releases,
  labels,
}: {
  orgId: string;
  releases: Release[];
  labels?: { release?: string; releases?: string; story?: string; stories?: string };
}) {
  const { firestore } = useFirebase();
  const subs = useCollection<PartnerSubmission>(
    useMemoFirebase(() => query(collection(firestore, 'orgs', orgId, 'submissions')), [firestore, orgId])
  );
  const opps = useCollection<MediaOpportunity>(
    useMemoFirebase(() => query(collection(firestore, 'orgs', orgId, 'mediaOpportunities')), [firestore, orgId])
  );
  const cov = useCollection<CoverageRecord>(
    useMemoFirebase(() => query(collection(firestore, 'orgs', orgId, 'coverage')), [firestore, orgId])
  );

  const [peer, setPeer] = useState<PeerBenchmark | null>(null);
  useEffect(() => {
    let cancelled = false;
    httpsCallable<{ orgId: string }, { benchmark: PeerBenchmark }>(getFunctions(), 'getPeerCoverageBenchmark')({ orgId })
      .then((r) => { if (!cancelled) setPeer(r.data.benchmark); })
      .catch(() => { /* Optional context; the dashboard stands without it. */ });
    return () => { cancelled = true; };
  }, [orgId]);

  const view = useMemo(() => {
    const nowMs = Date.now();
    const rel = releases.map((r) => ({
      id: r.id,
      status: r.status,
      hasHoldingText: r.hasHoldingText,
      approvalStatus: r.approvalStatus,
      atMs: r.status === 'Sent' ? ms(r.updatedAt) ?? ms(r.createdAt) : ms(r.createdAt),
    }));
    const sub = ((subs.data || []) as PartnerSubmission[]).map((s) => ({ id: s.id, status: s.status, atMs: ms(s.createdAt) }));
    const opp = ((opps.data || []) as MediaOpportunity[]).map((o) => ({
      id: o.id,
      status: o.status,
      // Typed on MediaOpportunity by the opportunity-to-draft change; read loosely so this
      // compiles whichever of the two lands first.
      actedOnReleaseId: ((o as { actedOnReleaseId?: string | null }).actedOnReleaseId) ?? null,
      atMs: ms(o.resolvedAt) ?? ms(o.generatedAt),
    }));
    const coverage = ((cov.data || []) as CoverageRecord[]).map((c) => ({
      id: c.id,
      releaseId: c.releaseId ?? null,
      publishedAtMs: c.publishedAtMs,
    }));
    const base = { releases: rel, submissions: sub, opportunities: opp, coverage };
    const current = buildOutcomeChain({ ...base, startMs: nowMs - WINDOW_DAYS * DAY_MS, endMs: nowMs });
    const previous = buildOutcomeChain({
      ...base,
      startMs: nowMs - 2 * WINDOW_DAYS * DAY_MS,
      endMs: nowMs - WINDOW_DAYS * DAY_MS - 1,
    });
    return {
      attention: buildAttentionItems({ ...base, nowMs, labels }),
      current,
      previous,
    };
  }, [releases, subs.data, opps.data, cov.data, labels]);

  const loading = subs.isLoading || opps.isLoading || cov.isLoading;
  const stories = labels?.stories || 'stories';

  const chain: Array<{ label: string; value: number; prev: number }> = [
    { label: `${stories.charAt(0).toUpperCase()}${stories.slice(1)} received`, value: view.current.storiesReceived, prev: view.previous.storiesReceived },
    { label: 'Releases sent', value: view.current.releasesSent, prev: view.previous.releasesSent },
    { label: 'Releases placed', value: view.current.releasesPlaced, prev: view.previous.releasesPlaced },
    { label: 'Placements', value: view.current.placements, prev: view.previous.placements },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">What needs your attention</CardTitle>
          <CardDescription>Waiting on your team right now.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : view.attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" /> Nothing waiting. Everything is up to date.
            </p>
          ) : (
            <ul className="space-y-2">
              {view.attention.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="group flex items-center justify-between rounded-md border p-2.5 text-sm hover:bg-muted/50">
                    <span>{item.label}</span>
                    <ArrowRight className="h-4 w-4 opacity-50 group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-headline">What your work produced</CardTitle>
          <CardDescription>
            Last {WINDOW_DAYS} days, compared with the {WINDOW_DAYS} before. Placements are dated by when the article ran.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {chain.map((c) => (
              <div key={c.label} className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{loading ? '–' : c.value}</div>
                <div className="text-xs font-medium">{c.label}</div>
                {!loading && <div className="mt-1 text-[11px] text-muted-foreground">{formatDelta(comparePeriods(c.value, c.prev))}</div>}
              </div>
            ))}
          </div>
          {!loading && view.current.opportunitiesActedOn > 0 && (
            <p className="text-sm">
              {view.current.opportunitiesActedOn} media {view.current.opportunitiesActedOn === 1 ? 'opportunity' : 'opportunities'} acted on;{' '}
              {view.current.opportunitiesBecameReleases} became draft releases.
            </p>
          )}
          {peer && <p className="text-sm text-muted-foreground">{describePeerBenchmark(peer, 'placements')}</p>}
          <p className="text-xs text-muted-foreground">
            Figures come from coverage your team logs. <Link href="/dashboard/coverage" className="underline underline-offset-2">Log coverage</Link> to keep them complete.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
