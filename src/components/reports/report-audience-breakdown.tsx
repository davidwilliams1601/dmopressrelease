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
  Cell,
} from 'recharts';
import { computeRate } from '@/lib/report-utils';

type Props = {
  releasesByAudience: Record<string, { count: number; sends: number; opens: number; clicks: number }>;
};

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 142 71% 45%))',
  'hsl(var(--chart-3, 47 100% 50%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 200 70% 50%))',
];

export default function ReportAudienceBreakdown({ releasesByAudience }: Props) {
  const audiences = Object.entries(releasesByAudience);

  if (audiences.length === 0) return null;

  const data = audiences.map(([audience, stats]) => ({
    audience,
    releases: stats.count,
    sends: stats.sends,
    openRate: computeRate(stats.opens, stats.sends),
  }));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-headline font-semibold">Audience Breakdown</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-base">Sends by Audience</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                <Bar dataKey="sends" name="Emails Sent" radius={[4, 4, 0, 0]}>
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-base">Open Rate by Audience</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="audience"
                  className="text-xs fill-muted-foreground"
                  tick={{ fill: 'currentColor' }}
                />
                <YAxis
                  className="text-xs fill-muted-foreground"
                  tick={{ fill: 'currentColor' }}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`${value}%`, 'Open Rate']}
                />
                <Bar dataKey="openRate" name="Open Rate %" radius={[4, 4, 0, 0]}>
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
