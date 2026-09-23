'use client';

/**
 * Coverage — the Proof of Value module.
 *
 * Log what got published, link it to the release and members it came from, and turn a period
 * of it into a report: on screen, as a PDF (print), as CSV, or as a live share link. This is
 * the CoverageBook replacement, so it is included in every paid tier rather than gated behind
 * advancedReporting: an org that cannot show what its press work earned has no reason to renew.
 *
 * Every figure is a count of records someone logged, plus — only where the outlet publishes
 * one — a reported audience with its source. There is no estimated reach and no AVE.
 */

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { deleteDoc, doc } from 'firebase/firestore';
import { Download, Plus, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { useOrganization } from '@/hooks/use-organization';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { useCoverageData } from '@/hooks/use-coverage-data';
import { useToast } from '@/hooks/use-toast';
import { formatPeriodLabel, getMonthRange, type DateRange } from '@/lib/report-utils';
import { coverageToCsv } from '@/lib/coverage-core';
import type { CoverageRecord } from '@/lib/types';
import ReportPeriodSelector from '@/components/reports/report-period-selector';
import { AddCoverageDialog } from '@/components/coverage/add-coverage-dialog';
import { CoverageSummaryView } from '@/components/coverage/coverage-summary';
import { CoverageTable } from '@/components/coverage/coverage-table';
import { CoverageShareLinks } from '@/components/coverage/coverage-share-links';

export const dynamic = 'force-dynamic';

export default function CoveragePage() {
  const { firestore, user } = useFirebase();
  const { orgId, role, name, isLoading: isUserLoading } = useUserData();
  const { organization } = useOrganization(orgId);
  const { config } = useVerticalConfig(orgId);
  const { toast } = useToast();
  const [range, setRange] = useState<DateRange>(() => getMonthRange(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CoverageRecord | null>(null);
  const [deleting, setDeleting] = useState<CoverageRecord | null>(null);

  const data = useCoverageData(orgId, range);
  const periodLabel = formatPeriodLabel(range);
  const membersLabel = config.nav.partnersSettings;
  const isTeam = role === 'Admin' || role === 'User';

  const sensitiveCount = useMemo(() => data.records.filter((r) => r.tone === 'sensitive').length, [data.records]);

  function exportCsv() {
    const csv = coverageToCsv(data.records);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `coverage-${format(range.from, 'yyyy-MM-dd')}-to-${format(range.to, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(href);
  }

  async function confirmDelete() {
    if (!deleting || !orgId) return;
    try {
      await deleteDoc(doc(firestore, 'orgs', orgId, 'coverage', deleting.id));
      toast({ title: 'Coverage deleted' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not delete', description: err?.message });
    } finally {
      setDeleting(null);
    }
  }

  if (isUserLoading || (data.isLoading && !data.allRecords.length)) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-headline font-bold">Coverage</h1>
        <Skeleton className="h-[120px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  if (!isTeam || !orgId) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-headline font-bold">Coverage</h1>
        <p className="text-muted-foreground">Coverage is managed by your organisation&apos;s team.</p>
      </div>
    );
  }

  return (
    <div className="print-report flex flex-col gap-6">
      {/* Print-only header */}
      <div className="print-header mb-2 hidden print:block">
        {organization?.branding?.logoUrl && <img src={organization.branding.logoUrl} alt="" className="mb-3 h-12 w-auto" />}
        <h1 className="text-3xl font-headline font-bold">{organization?.name}</h1>
        <h2 className="text-xl text-muted-foreground">Coverage report — {periodLabel}</h2>
        <p className="text-sm text-muted-foreground">Generated {format(new Date(), 'dd MMMM yyyy')}</p>
      </div>

      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Coverage</h1>
          <p className="text-muted-foreground">What got published in {periodLabel}, and who it featured.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportPeriodSelector value={range} onChange={setRange} />
          <Button variant="outline" onClick={exportCsv} disabled={!data.records.length}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> PDF
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Log coverage
          </Button>
        </div>
      </div>

      <CoverageSummaryView
        summary={data.summary}
        funnel={data.funnel}
        submissionsLabel={`${config.nav.submissions} received`}
        releasesLabel={`${config.nav.releases} issued`}
        membersLabel={membersLabel}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Placements</CardTitle>
        </CardHeader>
        <CardContent>
          <CoverageTable
            records={data.records}
            membersLabel={membersLabel}
            onEdit={(r) => {
              setEditing(r);
              setDialogOpen(true);
            }}
            onDelete={(r) => setDeleting(r)}
            emptyText={
              data.allRecords.length
                ? 'No coverage published in this period. Try a wider period.'
                : 'No coverage logged yet. Paste a link with “Log coverage” to add your first placement.'
            }
          />
        </CardContent>
      </Card>

      <CoverageShareLinks
        orgId={orgId}
        range={range}
        periodLabel={periodLabel}
        isAdmin={role === 'Admin'}
        sensitiveCount={sensitiveCount}
      />

      <AddCoverageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgId={orgId}
        userId={user?.uid || ''}
        userName={name || user?.email || ''}
        releases={data.releases}
        members={data.members}
        existing={editing}
        existingRecords={data.allRecords}
        membersLabel={membersLabel}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this placement?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.headline}” will be removed from every report and share link, including ones already sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
