import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import type { Release, PartnerSubmission, User, PartnerEmail } from '@/lib/types';
import {
  type DateRange,
  isInRange,
  computeRate,
  buildTrendData,
  getPreviousPeriod,
  type TrendDataPoint,
} from '@/lib/report-utils';

export type ReportMetrics = {
  totalReleasesSent: number;
  totalEmails: number;
  totalOpens: number;
  totalClicks: number;
  totalPageViews: number;
  avgOpenRate: number;
  avgClickRate: number;
};

export type ReportData = {
  isLoading: boolean;
  period: DateRange;

  // Executive summary
  metrics: ReportMetrics;
  previousMetrics: ReportMetrics;
  totalPartners: number;

  // Distribution
  releasesCreated: number;
  releasesByAudience: Record<string, { count: number; sends: number; opens: number; clicks: number }>;

  // Partner engagement
  newPartnersInPeriod: number;
  submissionsReceived: number;
  submissionsUsed: number;
  partnerEmailsSent: number;
  partnerEmailOpens: number;
  partnerEmailClicks: number;
  topContributors: Array<{ name: string; submissions: number; used: number }>;

  // Top releases
  topReleases: Array<Release & { openRate: number; clickRate: number }>;

  // Trends
  trendData: TrendDataPoint[];
};

function computeMetrics(releases: Release[]): ReportMetrics {
  const sent = releases.filter((r) => r.status === 'Sent');
  const totalEmails = sent.reduce((sum, r) => sum + (r.sends || 0), 0);
  const totalOpens = sent.reduce((sum, r) => sum + (r.opens || 0), 0);
  const totalClicks = sent.reduce((sum, r) => sum + (r.clicks || 0), 0);
  const totalPageViews = sent.reduce((sum, r) => sum + (r.pageViews || 0), 0);

  return {
    totalReleasesSent: sent.length,
    totalEmails,
    totalOpens,
    totalClicks,
    totalPageViews,
    avgOpenRate: computeRate(totalOpens, totalEmails),
    avgClickRate: computeRate(totalClicks, totalOpens),
  };
}

export function useReportData(orgId: string | null, period: DateRange): ReportData {
  const { firestore } = useFirebase();

  // Fetch all releases
  const releasesQuery = useCollection<Release>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(collection(firestore, 'orgs', orgId, 'releases'));
    }, [firestore, orgId])
  );

  // Fetch all submissions
  const submissionsQuery = useCollection<PartnerSubmission>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(collection(firestore, 'orgs', orgId, 'submissions'));
    }, [firestore, orgId])
  );

  // Fetch partner users
  const usersQuery = useCollection<User>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'users'),
        where('role', '==', 'Partner')
      );
    }, [firestore, orgId])
  );

  // Fetch partner emails
  const partnerEmailsQuery = useCollection<PartnerEmail>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(collection(firestore, 'orgs', orgId, 'partnerEmails'));
    }, [firestore, orgId])
  );

  const isLoading =
    releasesQuery.isLoading ||
    submissionsQuery.isLoading ||
    usersQuery.isLoading ||
    partnerEmailsQuery.isLoading;

  return useMemo(() => {
    const allReleases = releasesQuery.data || [];
    const allSubmissions = submissionsQuery.data || [];
    const allPartners = usersQuery.data || [];
    const allPartnerEmails = partnerEmailsQuery.data || [];

    // Filter to period
    const periodReleases = allReleases.filter((r) => isInRange(r.createdAt, period));
    const previousPeriod = getPreviousPeriod(period);
    const prevReleases = allReleases.filter((r) => isInRange(r.createdAt, previousPeriod));

    const periodSubmissions = allSubmissions.filter((s) => isInRange(s.createdAt, period));
    const periodPartnerEmails = allPartnerEmails.filter((e) => isInRange(e.sentAt, period));
    const newPartners = allPartners.filter((p) => isInRange(p.createdAt, period));

    // Metrics
    const metrics = computeMetrics(periodReleases);
    const previousMetrics = computeMetrics(prevReleases);

    // Audience breakdown
    const releasesByAudience: Record<string, { count: number; sends: number; opens: number; clicks: number }> = {};
    periodReleases
      .filter((r) => r.status === 'Sent')
      .forEach((r) => {
        const audience = r.audience || 'Unknown';
        if (!releasesByAudience[audience]) {
          releasesByAudience[audience] = { count: 0, sends: 0, opens: 0, clicks: 0 };
        }
        releasesByAudience[audience].count++;
        releasesByAudience[audience].sends += r.sends || 0;
        releasesByAudience[audience].opens += r.opens || 0;
        releasesByAudience[audience].clicks += r.clicks || 0;
      });

    // Partner engagement
    const submissionsUsed = periodSubmissions.filter((s) => s.status === 'used').length;

    // Top contributors
    const contributorMap = new Map<string, { name: string; submissions: number; used: number }>();
    periodSubmissions.forEach((s) => {
      const existing = contributorMap.get(s.partnerId) || { name: s.partnerName, submissions: 0, used: 0 };
      existing.submissions++;
      if (s.status === 'used') existing.used++;
      contributorMap.set(s.partnerId, existing);
    });
    const topContributors = Array.from(contributorMap.values())
      .sort((a, b) => b.submissions - a.submissions)
      .slice(0, 5);

    // Partner email stats
    const partnerEmailsSent = periodPartnerEmails.length;
    const partnerEmailOpens = periodPartnerEmails.reduce((sum, e) => sum + (e.opens || 0), 0);
    const partnerEmailClicks = periodPartnerEmails.reduce((sum, e) => sum + (e.clicks || 0), 0);

    // Top releases
    const topReleases = periodReleases
      .filter((r) => r.status === 'Sent')
      .map((r) => ({
        ...r,
        openRate: computeRate(r.opens || 0, r.sends || 0),
        clickRate: computeRate(r.clicks || 0, r.opens || 0),
      }))
      .sort((a, b) => (b.opens || 0) - (a.opens || 0))
      .slice(0, 10);

    // Trends
    const trendData = buildTrendData(periodReleases, period);

    return {
      isLoading,
      period,
      metrics,
      previousMetrics,
      totalPartners: allPartners.length,
      releasesCreated: periodReleases.length,
      releasesByAudience,
      newPartnersInPeriod: newPartners.length,
      submissionsReceived: periodSubmissions.length,
      submissionsUsed,
      partnerEmailsSent,
      partnerEmailOpens,
      partnerEmailClicks,
      topContributors,
      topReleases,
      trendData,
    };
  }, [
    releasesQuery.data,
    submissionsQuery.data,
    usersQuery.data,
    partnerEmailsQuery.data,
    period,
    isLoading,
  ]);
}
