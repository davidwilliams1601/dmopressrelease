'use client';

import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnalyticsChart } from './analytics-chart';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import type { EmailEvent, Release } from '@/lib/types';
import { format } from 'date-fns';
import { toDate } from '@/lib/utils';
import { Mail, MousePointerClick, ExternalLink, AlertCircle, Ban } from 'lucide-react';

type ReleaseAnalyticsProps = {
  orgId: string;
  releaseId: string;
};

type CounterShard = {
  opens?: number;
  clicks?: number;
};

export function ReleaseAnalytics({ orgId, releaseId }: ReleaseAnalyticsProps) {
  const firestore = useFirestore();

  // Fetch events for this release (limited to 500 for performance)
  const eventsQuery = useMemoFirebase(
    () => {
      const eventsRef = collection(
        firestore,
        'orgs',
        orgId,
        'events'
      );
      return query(
        eventsRef,
        where('releaseId', '==', releaseId),
        orderBy('timestamp', 'desc'),
        limit(500)
      );
    },
    [firestore, orgId, releaseId]
  );

  const { data: rawEvents, isLoading, error } = useCollection<EmailEvent>(eventsQuery);
  const events = rawEvents ?? [];

  // Fetch pre-aggregated daily stats for the chart
  const dailyStatsQuery = useMemoFirebase(
    () => {
      const dailyRef = collection(
        firestore,
        'orgs',
        orgId,
        'releases',
        releaseId,
        'dailyStats'
      );
      return query(dailyRef);
    },
    [firestore, orgId, releaseId]
  );

  const { data: rawDailyStats } = useCollection<Record<string, number>>(dailyStatsQuery);
  const dailyStats = rawDailyStats ?? [];

  // Fetch distributed counter shards (source of truth for opens/clicks)
  const countersQuery = useMemoFirebase(
    () => {
      return collection(
        firestore,
        'orgs',
        orgId,
        'releases',
        releaseId,
        'counters'
      );
    },
    [firestore, orgId, releaseId]
  );

  const { data: rawCounterShards } = useCollection<CounterShard>(countersQuery);
  const counterShards = rawCounterShards ?? [];

  // Sum counter shards for accurate totals
  const shardTotals = useMemo(() => {
    let opens = 0;
    let clicks = 0;
    for (const shard of counterShards) {
      opens += shard.opens ?? 0;
      clicks += shard.clicks ?? 0;
    }
    return { opens, clicks };
  }, [counterShards]);

  // Fetch all sent releases for benchmarking
  const orgReleasesQuery = useMemoFirebase(
    () => {
      const releasesRef = collection(firestore, 'orgs', orgId, 'releases');
      return query(releasesRef, where('status', '==', 'Sent'));
    },
    [firestore, orgId]
  );

  const { data: rawOrgReleases } = useCollection<Release>(orgReleasesQuery);
  const orgReleases = rawOrgReleases ?? [];

  // Compute org average open rate (excluding current release)
  const orgBenchmark = useMemo(() => {
    const otherReleases = orgReleases.filter(
      (r) => r.id !== releaseId && (r.sends ?? 0) > 0
    );
    if (otherReleases.length === 0) return null;
    const totalRate = otherReleases.reduce((sum, r) => {
      const rate = ((r.opens ?? 0) / (r.sends ?? 1)) * 100;
      return sum + rate;
    }, 0);
    return { avg: totalRate / otherReleases.length, count: otherReleases.length };
  }, [orgReleases, releaseId]);

  // Calculate statistics — use shard totals for opens/clicks, events for unique counts and other types
  const stats = useMemo(() => {
    const delivered = events.filter((e) => e.eventType === 'delivered').length;
    const bounces = events.filter((e) => e.eventType === 'bounce').length;
    const spamReports = events.filter((e) => e.eventType === 'spam_report').length;

    // Use distributed counter shards for total opens/clicks (accurate even beyond 500 event limit)
    const opens = shardTotals.opens > 0 ? shardTotals.opens : events.filter((e) => e.eventType === 'open').length;
    const clicks = shardTotals.clicks > 0 ? shardTotals.clicks : events.filter((e) => e.eventType === 'click').length;

    // Calculate unique opens (by recipient email) — from raw events
    const uniqueOpens = new Set(
      events.filter((e) => e.eventType === 'open').map((e) => e.recipientEmail)
    ).size;

    // Calculate unique clicks
    const uniqueClicks = new Set(
      events.filter((e) => e.eventType === 'click').map((e) => e.recipientEmail)
    ).size;

    // Calculate rates
    const openRate = delivered > 0 ? (uniqueOpens / delivered) * 100 : 0;
    const clickRate = opens > 0 ? (uniqueClicks / uniqueOpens) * 100 : 0;

    return {
      delivered,
      opens,
      uniqueOpens,
      clicks,
      uniqueClicks,
      bounces,
      spamReports,
      openRate,
      clickRate,
    };
  }, [events, shardTotals]);

  // Get click URLs breakdown
  const clickedUrls = useMemo(() => {
    const urlCounts = new Map<string, number>();

    events
      .filter((e) => e.eventType === 'click' && e.metadata?.url)
      .forEach((e) => {
        const url = e.metadata!.url!;
        urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
      });

    return Array.from(urlCounts.entries())
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading analytics...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-destructive">Error loading analytics</p>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Analytics</CardTitle>
          <CardDescription>
            Email engagement data will appear here once recipients interact with your press release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No engagement data yet. Make sure SendGrid webhooks are configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Benchmark Card */}
      {stats.delivered > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Open Rate Benchmark</CardTitle>
            <CardDescription>How does this release compare?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">This release</p>
                <p
                  className={`text-2xl font-bold ${
                    orgBenchmark
                      ? stats.openRate >= orgBenchmark.avg + 5
                        ? 'text-green-600'
                        : stats.openRate <= orgBenchmark.avg - 5
                        ? 'text-red-600'
                        : 'text-amber-600'
                      : ''
                  }`}
                >
                  {stats.openRate.toFixed(1)}%
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Your average</p>
                <p className="text-2xl font-bold">
                  {orgBenchmark ? `${orgBenchmark.avg.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Industry benchmark</p>
                <p className="text-2xl font-bold">38%</p>
                <p className="text-xs text-muted-foreground">(DMO sector estimate)</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {!orgBenchmark
                ? "This is your first sent release — your average will build over time."
                : stats.openRate >= orgBenchmark.avg + 5
                ? `This release performed ${(stats.openRate - orgBenchmark.avg).toFixed(1)} points above your average.`
                : stats.openRate <= orgBenchmark.avg - 5
                ? `This release performed ${(orgBenchmark.avg - stats.openRate).toFixed(1)} points below your average.`
                : `This release is broadly in line with your average of ${orgBenchmark.avg.toFixed(1)}%.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Overview Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Engagement Overview</CardTitle>
          <CardDescription>
            Summary of email performance metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-4 w-4" />
                Delivered
              </p>
              <p className="text-2xl font-bold">{stats.delivered}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Opens</p>
              <p className="text-2xl font-bold">{stats.opens}</p>
              <p className="text-xs text-muted-foreground">
                {stats.uniqueOpens} unique ({stats.openRate.toFixed(1)}%)
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MousePointerClick className="h-4 w-4" />
                Clicks
              </p>
              <p className="text-2xl font-bold">{stats.clicks}</p>
              <p className="text-xs text-muted-foreground">
                {stats.uniqueClicks} unique ({stats.clickRate.toFixed(1)}%)
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Ban className="h-4 w-4" />
                Issues
              </p>
              <p className="text-2xl font-bold">{stats.bounces + stats.spamReports}</p>
              <p className="text-xs text-muted-foreground">
                {stats.bounces} bounces, {stats.spamReports} spam
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Engagement Over Time</CardTitle>
          <CardDescription>
            Opens and clicks by date
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsChart events={events} dailyStats={dailyStats} />
        </CardContent>
      </Card>

      {/* Clicked URLs */}
      {clickedUrls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Clicked Links</CardTitle>
            <CardDescription>
              Most popular links in your press release
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {clickedUrls.map(({ url, count }) => (
                <div
                  key={url}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm truncate hover:underline"
                    >
                      {url}
                    </a>
                  </div>
                  <Badge variant="secondary">{count} clicks</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Event Timeline</CardTitle>
          <CardDescription>
            Recent activity on this press release
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {events.map((event) => {
                const timestamp = toDate(event.timestamp);

                let icon;
                let color;
                switch (event.eventType) {
                  case 'delivered':
                    icon = <Mail className="h-4 w-4" />;
                    color = 'text-green-600';
                    break;
                  case 'open':
                    icon = <Mail className="h-4 w-4" />;
                    color = 'text-blue-600';
                    break;
                  case 'click':
                    icon = <MousePointerClick className="h-4 w-4" />;
                    color = 'text-purple-600';
                    break;
                  case 'bounce':
                    icon = <Ban className="h-4 w-4" />;
                    color = 'text-red-600';
                    break;
                  case 'spam_report':
                    icon = <AlertCircle className="h-4 w-4" />;
                    color = 'text-orange-600';
                    break;
                  default:
                    icon = <Mail className="h-4 w-4" />;
                    color = 'text-muted-foreground';
                }

                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border"
                  >
                    <div className={`mt-0.5 ${color}`}>{icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {event.eventType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(timestamp, 'MMM dd, yyyy h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate mt-1">
                        {event.recipientEmail}
                      </p>
                      {event.metadata?.url && (
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {event.metadata.url}
                        </p>
                      )}
                      {event.metadata?.reason && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Reason: {event.metadata.reason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
