'use client';
export const dynamic = 'force-dynamic';

import AiInsights from '@/components/dashboard/ai-insights';
import StatCard from '@/components/dashboard/stat-card';
import ReleasesTable from '@/components/releases/releases-table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import type { Release } from '@/lib/types';
import { useUserData } from '@/hooks/use-user-data';
import {
  FileText,
  Mail,
  MousePointerClick,
  View,
} from 'lucide-react';
import { useMemo } from 'react';

export default function DashboardPage() {
  const { firestore } = useFirebase();
  const { orgId, isLoading: isUserDataLoading } = useUserData();

  // Fetch recent releases
  const releasesQuery = useCollection<Release>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'releases'),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
    }, [firestore, orgId])
  );

  // Fetch all releases for stats
  const allReleasesQuery = useCollection<Release>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'releases')
      );
    }, [firestore, orgId])
  );

  // Calculate stats from real data
  const stats = useMemo(() => {
    const releases = allReleasesQuery.data || [];
    const sentReleases = releases.filter((r) => r.status === 'Sent');

    const totalSends = sentReleases.reduce((sum, r) => sum + (r.sends || 0), 0);
    const totalOpens = sentReleases.reduce((sum, r) => sum + (r.opens || 0), 0);
    const totalClicks = sentReleases.reduce((sum, r) => sum + (r.clicks || 0), 0);

    return {
      releases: releases.length,
      sends: totalSends,
      opens: totalOpens,
      clicks: totalClicks,
      pageViews: 0, // Will be calculated from analytics later
    };
  }, [allReleasesQuery.data]);

  const openRate =
    stats.sends > 0 ? ((stats.opens / stats.sends) * 100).toFixed(1) : '0.0';
  const clickRate =
    stats.opens > 0 ? ((stats.clicks / stats.opens) * 100).toFixed(1) : '0.0';

  const recentReleases = releasesQuery.data || [];

  if (isUserDataLoading || releasesQuery.isLoading || allReleasesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-headline font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Here's a summary of your PR activities.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Releases"
          value={stats.releases}
          icon={FileText}
        />
        <StatCard title="Total Sends" value={stats.sends} icon={Mail} />
        <StatCard
          title="Open Rate"
          value={`${openRate}%`}
          icon={MousePointerClick}
          description="Based on total sends"
        />
        <StatCard
          title="Page Views"
          value={stats.pageViews}
          icon={View}
          description="Unique views on press pages"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline">Recent Releases</CardTitle>
            <CardDescription>
              Your 5 most recently created press releases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReleasesTable releases={recentReleases} />
          </CardContent>
        </Card>
        <AiInsights stats={stats} />
      </div>
    </div>
  );
}
