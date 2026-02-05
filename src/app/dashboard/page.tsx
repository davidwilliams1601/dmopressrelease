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
import { getRecentReleases, getStats } from '@/lib/data';
import {
  BarChart,
  FileText,
  Mail,
  MousePointerClick,
  View,
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard | PressPilot',
};

export default function DashboardPage() {
  const stats = getStats();
  const recentReleases = getRecentReleases();

  const openRate =
    stats.sends > 0 ? ((stats.opens / stats.sends) * 100).toFixed(1) : '0.0';
  const clickRate =
    stats.opens > 0 ? ((stats.clicks / stats.opens) * 100).toFixed(1) : '0.0';

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
