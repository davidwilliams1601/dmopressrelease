'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TrendDataPoint } from '@/lib/report-utils';

type Props = {
  trendData: TrendDataPoint[];
};

export default function ReportEngagementTrends({ trendData }: Props) {
  const hasData = trendData.some((d) => d.sends > 0 || d.opens > 0 || d.clicks > 0);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-headline font-semibold">Engagement Trends</h2>
      <Card>
        <CardContent className="pt-6">
          {!hasData ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              <p>No engagement data for this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
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
                <Line
                  type="monotone"
                  dataKey="opens"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  name="Opens"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  name="Clicks"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
