'use client';

import { useMemo } from 'react';
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
import { format } from 'date-fns';
import type { EmailEvent } from '@/lib/types';

type DailyStat = {
  id: string; // YYYY-MM-DD date string (Firestore doc ID)
  [key: string]: number | string;
};

type AnalyticsChartProps = {
  events: EmailEvent[];
  dailyStats?: DailyStat[];
};

export function AnalyticsChart({ events, dailyStats }: AnalyticsChartProps) {
  // Process daily stats (pre-aggregated) or fall back to raw events
  const chartData = useMemo(() => {
    // Prefer pre-aggregated daily stats when available
    if (dailyStats && dailyStats.length > 0) {
      return dailyStats
        .map((doc) => ({
          date: format(new Date(doc.id + 'T00:00:00'), 'MMM dd, yyyy'),
          opens: (doc.open as number) || 0,
          clicks: (doc.click as number) || 0,
          sortKey: doc.id,
        }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map(({ sortKey, ...rest }) => rest);
    }

    // Fallback: bucket raw events client-side
    if (events.length === 0) return [];

    const eventsByDate = new Map<string, { date: string; opens: number; clicks: number }>();

    events.forEach((event) => {
      const timestamp = event.timestamp?.toDate ? event.timestamp.toDate() : new Date(event.timestamp);
      const dateKey = format(timestamp, 'MMM dd, yyyy');

      if (!eventsByDate.has(dateKey)) {
        eventsByDate.set(dateKey, { date: dateKey, opens: 0, clicks: 0 });
      }

      const dateData = eventsByDate.get(dateKey)!;
      if (event.eventType === 'open') {
        dateData.opens++;
      } else if (event.eventType === 'click') {
        dateData.clicks++;
      }
    });

    return Array.from(eventsByDate.values()).sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
  }, [events, dailyStats]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        <p>No engagement data yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="clicks"
          stroke="hsl(var(--destructive))"
          strokeWidth={2}
          name="Clicks"
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
