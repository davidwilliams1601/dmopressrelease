'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ReportMetrics } from '@/hooks/use-report-data';

type Props = {
  metrics: ReportMetrics;
  releasesCreated: number;
  releasesByAudience: Record<string, { count: number; sends: number; opens: number; clicks: number }>;
  releasesLabel: string;
};

export default function ReportMediaDistribution({
  metrics,
  releasesCreated,
  releasesByAudience,
  releasesLabel,
}: Props) {
  const audienceData = Object.entries(releasesByAudience).map(([audience, data]) => ({
    audience,
    sends: data.sends,
    opens: data.opens,
    clicks: data.clicks,
    releases: data.count,
  }));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-headline font-semibold">Media Distribution</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{releasesLabel} Created</p>
            <p className="text-2xl font-bold">{releasesCreated}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{releasesLabel} Sent</p>
            <p className="text-2xl font-bold">{metrics.totalReleasesSent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Emails Distributed</p>
            <p className="text-2xl font-bold">{metrics.totalEmails.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Avg Open Rate</p>
            <p className="text-2xl font-bold">{metrics.avgOpenRate}%</p>
          </CardContent>
        </Card>
      </div>

      {audienceData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-base">Distribution by Audience</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={audienceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="audience"
                  className="text-xs fill-muted-foreground"
                  tick={{ fill: 'currentColor' }}
                />
                <YAxis
                  className="text-xs fill-muted-foreground"
                  tick={{ fill: 'currentColor' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="sends" fill="hsl(var(--primary))" name="Sends" radius={[4, 4, 0, 0]} />
                <Bar dataKey="opens" fill="hsl(var(--chart-2, 142 71% 45%))" name="Opens" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clicks" fill="hsl(var(--chart-3, 47 100% 50%))" name="Clicks" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
