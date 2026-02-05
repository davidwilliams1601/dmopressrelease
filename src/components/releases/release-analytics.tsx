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
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { EmailEvent } from '@/lib/types';
import { format } from 'date-fns';
import { Mail, MousePointerClick, ExternalLink, AlertCircle, Ban } from 'lucide-react';

type ReleaseAnalyticsProps = {
  orgId: string;
  releaseId: string;
};

export function ReleaseAnalytics({ orgId, releaseId }: ReleaseAnalyticsProps) {
  const firestore = useFirestore();

  // Fetch events for this release
  const eventsQuery = useMemo(
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
        orderBy('timestamp', 'desc')
      );
    },
    [firestore, orgId, releaseId]
  );

  const { data: events = [], isLoading, error } = useCollection<EmailEvent>(eventsQuery);

  // Calculate statistics
  const stats = useMemo(() => {
    const delivered = events.filter((e) => e.eventType === 'delivered').length;
    const opens = events.filter((e) => e.eventType === 'open').length;
    const clicks = events.filter((e) => e.eventType === 'click').length;
    const bounces = events.filter((e) => e.eventType === 'bounce').length;
    const spamReports = events.filter((e) => e.eventType === 'spam_report').length;

    // Calculate unique opens (by recipient email)
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
  }, [events]);

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
          <AnalyticsChart events={events} />
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
                const timestamp = event.timestamp?.toDate
                  ? event.timestamp.toDate()
                  : new Date(event.timestamp);

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
