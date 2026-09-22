'use client';
export const dynamic = 'force-dynamic';

/**
 * The public, read-only Destination Brief page behind a share link.
 *
 * Whoever opens this is not signed in and may not be the person the brief was prepared for —
 * the likeliest reader after the first one is a colleague it was forwarded to. So the page
 * assumes no context: it names who it was prepared for, states the period it covers, and
 * carries its own limits and method, exactly as the printed version does.
 *
 * It renders BriefDocument, the same component the superadmin print page uses, so "this is the
 * brief I sent you" stays literally true. It fetches through the getSharedBrief callable rather
 * than Firestore because /mediaProspects is superadmin-only commercial data and stays closed;
 * the function returns an allow-listed payload with the internal sending gate stripped.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { initializeApp, getApps } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BriefDocument } from '@/components/briefs/brief-document';
import type { DestinationBriefContent } from '@/lib/types';

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

/**
 * An opaque id for this browser, so a link opened twice by the same person is not counted as
 * two readers while a link forwarded to a colleague is. Random, stored only here, never sent
 * anywhere except as this string — it is not derived from anything about the person, and there
 * is nothing on the server that could turn it back into one.
 */
const VIEWER_ID_KEY = 'pp_brief_viewer_id';

function getViewerId(): string | null {
  try {
    const existing = window.localStorage.getItem(VIEWER_ID_KEY);
    if (existing) return existing;
    const created = Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(VIEWER_ID_KEY, created);
    return created;
  } catch {
    // Private browsing, storage disabled, or a locked-down corporate browser. The view still
    // counts; it is simply counted as a distinct reader.
    return null;
  }
}

type SharedBrief = {
  prospectName: string;
  headline: string;
  openingNote: string;
  closingNote: string;
  watchTermsUsed: string[];
  generatedAtMs: number | null;
  content: DestinationBriefContent;
};

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function SharedBriefPage() {
  const params = useParams();
  const token = String(params.token || '');
  const [brief, setBrief] = useState<SharedBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestedRef = useRef(false);

  useEffect(() => {
    // Guard against React's double-invoked effects in development counting two views.
    if (requestedRef.current || !token) return;
    requestedRef.current = true;

    (async () => {
      try {
        const fn = httpsCallable(getFunctions(getClientApp()), 'getSharedBrief');
        const res = await fn({ token, viewerId: getViewerId() });
        setBrief(res.data as SharedBrief);
      } catch (err: any) {
        setError(
          err?.message ||
            'This link could not be opened. It may have expired or been withdrawn.'
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [token]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This brief is not available</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            If you were sent this link and still need the brief, reply to the email it came from
            and a new link can be issued.
          </CardContent>
        </Card>
      </div>
    );
  }

  const c = brief.content;

  return (
    <div className="print-report mx-auto max-w-3xl space-y-6 p-6">
      {/* Print header, following the pattern in src/app/dashboard/reports/page.tsx. */}
      <div className="hidden print:block print-header">
        <h1 className="text-lg font-semibold">
          Destination Media Opportunity Brief — {brief.prospectName}
        </h1>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Prepared for {brief.prospectName} by Press Pilot
          </p>
          <h1 className="text-xl font-semibold">Destination Media Opportunity Brief</h1>
          {c.dataStartMs && c.dataEndMs && (
            <p className="text-sm text-muted-foreground">
              Coverage reviewed {formatDate(c.dataStartMs)} – {formatDate(c.dataEndMs)}
              {brief.generatedAtMs ? ` · prepared ${formatDate(brief.generatedAtMs)}` : ''}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <BriefDocument
        prospectName={brief.prospectName}
        headline={brief.headline}
        openingNote={brief.openingNote}
        closingNote={brief.closingNote}
        content={c}
        watchTermsUsed={brief.watchTermsUsed}
      />

      <p className="text-xs text-muted-foreground">
        Prepared from publicly published coverage. Nothing on this page is editable, including by
        Press Pilot — the findings are a snapshot taken when the brief was generated.
      </p>
    </div>
  );
}
