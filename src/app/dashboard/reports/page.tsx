'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserData } from '@/hooks/use-user-data';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { useOrganization } from '@/hooks/use-organization';
import { useReportData } from '@/hooks/use-report-data';
import { getMonthRange, formatPeriodLabel, type DateRange } from '@/lib/report-utils';
import { format } from 'date-fns';

import ReportPeriodSelector from '@/components/reports/report-period-selector';
import ReportExecutiveSummary from '@/components/reports/report-executive-summary';
import ReportMediaDistribution from '@/components/reports/report-media-distribution';
import ReportPartnerEngagement from '@/components/reports/report-partner-engagement';
import ReportTopReleases from '@/components/reports/report-top-releases';
import ReportEngagementTrends from '@/components/reports/report-engagement-trends';
import ReportAudienceBreakdown from '@/components/reports/report-audience-breakdown';

export const dynamic = 'force-dynamic';

export default function ReportsPage() {
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { config } = useVerticalConfig(orgId);
  const { organization } = useOrganization(orgId);
  const [dateRange, setDateRange] = useState<DateRange>(() => getMonthRange(new Date()));

  const report = useReportData(orgId ?? null, dateRange);

  if (isUserLoading || report.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Reports</h1>
          <p className="text-muted-foreground">Loading report data...</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  const periodLabel = formatPeriodLabel(dateRange);
  const releasesLabel = config.nav.releases;
  const partnersLabel = config.nav.partnersSettings;
  const submissionsLabel = config.nav.submissions;

  return (
    <div className="print-report flex flex-col gap-8">
      {/* Print-only header */}
      <div className="hidden print:block print-header mb-4">
        {organization?.branding?.logoUrl && (
          <img src={organization.branding.logoUrl} alt="" className="h-12 w-auto mb-3" />
        )}
        <h1 className="text-3xl font-headline font-bold">{organization?.name}</h1>
        <h2 className="text-xl text-muted-foreground">
          Performance Report — {periodLabel}
        </h2>
        <p className="text-sm text-muted-foreground">
          Generated {format(new Date(), 'dd MMMM yyyy')}
        </p>
      </div>

      {/* Screen header */}
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Reports</h1>
          <p className="text-muted-foreground">
            Performance report for {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportPeriodSelector value={dateRange} onChange={setDateRange} />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <ReportExecutiveSummary
        metrics={report.metrics}
        previousMetrics={report.previousMetrics}
        submissionsReceived={report.submissionsReceived}
        totalPartners={report.totalPartners}
        partnersLabel={partnersLabel}
        submissionsLabel={submissionsLabel}
      />

      <ReportEngagementTrends trendData={report.trendData} />

      <ReportMediaDistribution
        metrics={report.metrics}
        releasesCreated={report.releasesCreated}
        releasesByAudience={report.releasesByAudience}
        releasesLabel={releasesLabel}
      />

      <ReportTopReleases
        topReleases={report.topReleases}
        releasesLabel={releasesLabel}
      />

      <ReportPartnerEngagement
        totalPartners={report.totalPartners}
        newPartnersInPeriod={report.newPartnersInPeriod}
        submissionsReceived={report.submissionsReceived}
        submissionsUsed={report.submissionsUsed}
        partnerEmailsSent={report.partnerEmailsSent}
        partnerEmailOpens={report.partnerEmailOpens}
        partnerEmailClicks={report.partnerEmailClicks}
        topContributors={report.topContributors}
        partnersLabel={partnersLabel}
        submissionsLabel={submissionsLabel}
      />

      <ReportAudienceBreakdown
        releasesByAudience={report.releasesByAudience}
      />
    </div>
  );
}
