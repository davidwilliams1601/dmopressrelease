'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  FileText,
  Mail,
  MousePointerClick,
  Eye,
  TrendingUp,
  TrendingDown,
  Inbox,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeDelta } from '@/lib/report-utils';
import type { ReportMetrics } from '@/hooks/use-report-data';
import type { LucideIcon } from 'lucide-react';

type Props = {
  metrics: ReportMetrics;
  previousMetrics: ReportMetrics;
  submissionsReceived: number;
  totalPartners: number;
  partnersLabel: string;
  submissionsLabel: string;
};

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = computeDelta(current, previous);
  if (delta === null) return null;

  const isPositive = delta >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta)}%
    </span>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  current,
  previous,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  current?: number;
  previous?: number;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {current !== undefined && previous !== undefined && (
            <DeltaBadge current={current} previous={previous} />
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportExecutiveSummary({
  metrics,
  previousMetrics,
  submissionsReceived,
  totalPartners,
  partnersLabel,
  submissionsLabel,
}: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-headline font-semibold">Executive Summary</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 print:grid-cols-4">
        <StatCard
          title="Releases Sent"
          value={metrics.totalReleasesSent}
          icon={FileText}
          current={metrics.totalReleasesSent}
          previous={previousMetrics.totalReleasesSent}
        />
        <StatCard
          title="Journalists Reached"
          value={metrics.totalEmails.toLocaleString()}
          icon={Mail}
          description="Total email recipients"
          current={metrics.totalEmails}
          previous={previousMetrics.totalEmails}
        />
        <StatCard
          title="Open Rate"
          value={`${metrics.avgOpenRate}%`}
          icon={MousePointerClick}
          description="Opens / emails sent"
          current={metrics.avgOpenRate}
          previous={previousMetrics.avgOpenRate}
        />
        <StatCard
          title="Click Rate"
          value={`${metrics.avgClickRate}%`}
          icon={Eye}
          description="Clicks / opens"
          current={metrics.avgClickRate}
          previous={previousMetrics.avgClickRate}
        />
        <StatCard
          title={submissionsLabel}
          value={submissionsReceived}
          icon={Inbox}
        />
        <StatCard
          title={`Total ${partnersLabel}`}
          value={totalPartners}
          icon={Users}
        />
        <StatCard
          title="Total Opens"
          value={metrics.totalOpens.toLocaleString()}
          icon={Eye}
          current={metrics.totalOpens}
          previous={previousMetrics.totalOpens}
        />
        <StatCard
          title="Total Clicks"
          value={metrics.totalClicks.toLocaleString()}
          icon={MousePointerClick}
          current={metrics.totalClicks}
          previous={previousMetrics.totalClicks}
        />
      </div>
    </div>
  );
}
