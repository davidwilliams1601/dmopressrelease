import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  format,
  differenceInDays,
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfWeek,
  isSameMonth,
  isSameYear,
  subMonths,
  subQuarters,
} from 'date-fns';
import { toDate } from '@/lib/utils';
import type { Release } from '@/lib/types';

export type DateRange = { from: Date; to: Date };

export function getMonthRange(date: Date): DateRange {
  return { from: startOfMonth(date), to: endOfMonth(date) };
}

export function getQuarterRange(date: Date): DateRange {
  return { from: startOfQuarter(date), to: endOfQuarter(date) };
}

export function getPreviousPeriod(range: DateRange): DateRange {
  const days = differenceInDays(range.to, range.from);
  // If roughly a month (28-31 days), go back one month
  if (days >= 28 && days <= 31) {
    const prev = subMonths(range.from, 1);
    return getMonthRange(prev);
  }
  // If roughly a quarter (89-92 days), go back one quarter
  if (days >= 89 && days <= 92) {
    const prev = subQuarters(range.from, 1);
    return getQuarterRange(prev);
  }
  // Custom: shift back by the same number of days
  const shift = days + 1;
  return {
    from: new Date(range.from.getTime() - shift * 86400000),
    to: new Date(range.from.getTime() - 1),
  };
}

export function isInRange(timestamp: any, range: DateRange): boolean {
  if (!timestamp) return false;
  const date = toDate(timestamp);
  return date >= range.from && date <= range.to;
}

export function computeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function formatPeriodLabel(range: DateRange): string {
  const days = differenceInDays(range.to, range.from);

  // Single month
  if (days >= 28 && days <= 31 && isSameMonth(range.from, range.to)) {
    return format(range.from, 'MMMM yyyy');
  }

  // Quarter
  if (days >= 89 && days <= 92) {
    const q = Math.floor(range.from.getMonth() / 3) + 1;
    return `Q${q} ${format(range.from, 'yyyy')}`;
  }

  // Custom range
  if (isSameYear(range.from, range.to)) {
    return `${format(range.from, 'd MMM')} – ${format(range.to, 'd MMM yyyy')}`;
  }
  return `${format(range.from, 'd MMM yyyy')} – ${format(range.to, 'd MMM yyyy')}`;
}

export type TrendDataPoint = {
  date: string;
  sends: number;
  opens: number;
  clicks: number;
};

export function buildTrendData(
  releases: Release[],
  range: DateRange
): TrendDataPoint[] {
  const days = differenceInDays(range.to, range.from);
  const useWeekly = days > 90;

  // Create buckets
  const buckets = new Map<string, TrendDataPoint>();

  if (useWeekly) {
    const weeks = eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 });
    weeks.forEach((weekStart) => {
      const label = format(weekStart, 'dd MMM');
      buckets.set(label, { date: label, sends: 0, opens: 0, clicks: 0 });
    });
  } else {
    const dayList = eachDayOfInterval({ start: range.from, end: range.to });
    dayList.forEach((day) => {
      const label = format(day, 'dd MMM');
      buckets.set(label, { date: label, sends: 0, opens: 0, clicks: 0 });
    });
  }

  // Place each release into its bucket based on createdAt
  releases.forEach((release) => {
    if (release.status !== 'Sent') return;
    const date = toDate(release.createdAt);

    let bucketKey: string;
    if (useWeekly) {
      // Find which week bucket
      const weeks = eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 });
      const weekStart = weeks.reduce((closest, w) => {
        return w <= date ? w : closest;
      }, weeks[0]);
      bucketKey = format(weekStart, 'dd MMM');
    } else {
      bucketKey = format(date, 'dd MMM');
    }

    const bucket = buckets.get(bucketKey);
    if (bucket) {
      bucket.sends += release.sends || 0;
      bucket.opens += release.opens || 0;
      bucket.clicks += release.clicks || 0;
    }
  });

  return Array.from(buckets.values());
}

export function computeDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}
