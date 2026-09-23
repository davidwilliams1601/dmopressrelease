'use client';
export const dynamic = 'force-dynamic';

/**
 * The public, read-only coverage report behind a share link — what an org sends its board,
 * funders or members instead of a CoverageBook link.
 *
 * The reader is not signed in, so the page carries its own context: whose report it is, the
 * period it covers, when it was generated, and what the numbers do and do not mean. It fetches
 * through getSharedCoverageReport rather than Firestore; coverage records stay tenant-private
 * and the function returns an allow-listed payload (no notes, no authorship, sensitive
 * placements only if the link was created to include them).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { initializeApp, getApps } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CoverageSummaryView } from '@/components/coverage/coverage-summary';
import { CoverageTable } from '@/components/coverage/coverage-table';
import { summariseCoverage, type SharedCoverageRecord } from '@/lib/coverage-core';
import { getVerticalConfig } from '@/lib/verticals';

const firebaseConfig = {
  apiKey: "AIzaSyCEQji1lRBsREmY7Vt5l8_XDyTY0Pp_Oqc",
  authDomain: "dmo-press-release.firebaseapp.com",
  projectId: "dmo-press-release",
  storageBucket: "dmo-press-release.firebasestorage.app",
  messagingSenderId: "959287689887",
  appId: "1:959287689887:web:4af709961507f1790ad8aa",
};

function getClientApp() {
  return getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
}

/** Opaque per-browser id so a reader opening the link twice counts once. See brief/[token]. */
const VIEWER_ID_KEY = 'pp_report_viewer_id';

function getViewerId(): string | null {
  try {
    const existing = window.localStorage.getItem(VIEWER_ID_KEY);
    if (existing) return existing;
    const created = Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(VIEWER_ID_KEY, created);
    return created;
  } catch {
    return null;
  }
}

type SharedReport = {
  title: string;
  orgName: string;
  orgLogoUrl: string | null;
  orgPrimaryColor: string | null;
  vertical: string;
  startMs: number;
  endMs: number;
  generatedAtMs: number;
  includeSensitive: boolean;
  funnel: { submitted: number; issued: number };
  records: SharedCoverageRecord[];
};

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function SharedCoverageReportPage() {
  const params = useParams();
  const token = String(params.token || '');
  const [report, setReport] = useState<SharedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current || !token) return;
    requestedRef.current = true;
    (async () => {
      try {
        const fn = httpsCallable(getFunctions(getClientApp()), 'getSharedCoverageReport');
        const res = await fn({ token, viewerId: getViewerId() });
        setReport(res.data as SharedReport);
      } catch (err: any) {
        setError(err?.message || 'This link could not be opened. It may have expired or been withdrawn.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [token]);

  const summary = useMemo(() => summariseCoverage(report?.records || []), [report]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This report is not available</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            If you still need it, ask the organisation that sent you the link to issue a new one.
          </CardContent>
        </Card>
      </div>
    );
  }

  const nav = getVerticalConfig(report.vertical as any).nav;

  return (
    <div className="print-report mx-auto max-w-5xl space-y-6 p-6">
      <div
        className="flex flex-wrap items-start justify-between gap-4 border-b pb-4"
        style={report.orgPrimaryColor ? { borderColor: report.orgPrimaryColor } : undefined}
      >
        <div className="flex items-start gap-4">
          {report.orgLogoUrl && <img src={report.orgLogoUrl} alt="" className="h-12 w-auto" />}
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{report.orgName}</p>
            <h1 className="text-2xl font-semibold">{report.title}</h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(report.startMs)} – {formatDate(report.endMs)} · generated {formatDate(report.generatedAtMs)}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print or save as PDF
        </Button>
      </div>

      <CoverageSummaryView
        summary={summary}
        funnel={report.funnel}
        submissionsLabel={`${nav.submissions} received`}
        releasesLabel={`${nav.releases} issued`}
        membersLabel={nav.partnersSettings}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Placements</CardTitle>
        </CardHeader>
        <CardContent>
          <CoverageTable records={report.records} membersLabel={nav.partnersSettings} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Each placement was logged by {report.orgName}. Audience figures, where shown, are those published by the outlet or the
        named source, not an estimate by Press Pilot; no advertising-value equivalent is calculated.
        {report.includeSensitive ? '' : ' Placements marked sensitive are not included in this shared version.'} Report prepared with
        Press Pilot.
      </p>
    </div>
  );
}
