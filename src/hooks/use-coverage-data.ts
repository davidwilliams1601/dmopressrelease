'use client';

import { useMemo } from 'react';
import { collection, orderBy, query, where } from 'firebase/firestore';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import { inPeriod, summariseCoverage } from '@/lib/coverage-core';
import { isInRange, type DateRange } from '@/lib/report-utils';
import type { CoverageRecord, PartnerSubmission, Release, User } from '@/lib/types';

/**
 * Everything a team-side coverage view needs for one period: the records, the summary, the
 * story funnel inputs, and the releases and members the add-coverage form offers.
 *
 * Reads the org's whole coverage collection and filters client-side, like use-report-data does
 * for releases — coverage volumes for a membership body are hundreds a year, not millions, and
 * one listener keeps the table, summary and duplicate warning consistent as records are added.
 */
export function useCoverageData(orgId: string | null | undefined, range: DateRange) {
  const { firestore } = useFirebase();

  const coverage = useCollection<CoverageRecord>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(collection(firestore, 'orgs', orgId, 'coverage'), orderBy('publishedAtMs', 'desc'));
    }, [firestore, orgId])
  );
  const releases = useCollection<Release>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(collection(firestore, 'orgs', orgId, 'releases'));
    }, [firestore, orgId])
  );
  const submissions = useCollection<PartnerSubmission>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(collection(firestore, 'orgs', orgId, 'submissions'));
    }, [firestore, orgId])
  );
  const members = useCollection<User>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(collection(firestore, 'orgs', orgId, 'users'), where('role', '==', 'Partner'));
    }, [firestore, orgId])
  );

  return useMemo(() => {
    const all = (coverage.data || []) as CoverageRecord[];
    const startMs = range.from.getTime();
    const endMs = range.to.getTime();
    const records = inPeriod(all, startMs, endMs);
    const allReleases = (releases.data || []) as Release[];
    const periodReleases = allReleases.filter((r) => isInRange(r.createdAt, range));
    const periodSubmissions = ((submissions.data || []) as PartnerSubmission[]).filter((s) => isInRange(s.createdAt, range));
    return {
      isLoading: coverage.isLoading || releases.isLoading || submissions.isLoading || members.isLoading,
      error: coverage.error,
      allRecords: all,
      records,
      summary: summariseCoverage(records),
      funnel: {
        submitted: periodSubmissions.length,
        issued: periodReleases.filter((r) => r.status === 'Sent').length,
      },
      releases: [...allReleases].sort((a, b) => (a.headline || '').localeCompare(b.headline || '')),
      members: ((members.data || []) as User[])
        .map((u) => ({ id: u.id, name: u.name || u.email || 'Member' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [coverage.data, coverage.isLoading, coverage.error, releases.data, releases.isLoading, submissions.data, submissions.isLoading, members.data, members.isLoading, range]);
}
