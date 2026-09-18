'use client';
export const dynamic = 'force-dynamic';

/**
 * The printable Destination Media Opportunity Brief.
 *
 * This is the document that gets handed to a communications director at a trade show, so the
 * rules it follows are editorial rather than technical:
 *
 *   - Measured findings and future-state claims are in separate, labelled sections. The one
 *     thing that would destroy the brief's credibility is blurring what was observed with
 *     what the product would do.
 *   - Every theme carries its own evidence rows with outlet, date and link. No claim floats.
 *   - "What this brief does not tell you" is printed, not hidden. A prospect who reads sales
 *     material for a living trusts a document more when it states its own limits.
 *   - Nothing on the page is derived at render time from live data. It renders the frozen
 *     `content` snapshot recorded when the brief was generated.
 *
 * Print follows the pattern in src/app/dashboard/reports/page.tsx exactly: `print-report`
 * wrapper, `no-print` controls, `hidden print:block print-header` header, window.print().
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  BRIEF_FUTURE_STATE_NOTE,
  BRIEF_METHODOLOGY_NOTE,
  BRIEF_ROUTE_EXPLANATIONS,
  BRIEF_EVIDENCE_ROLE_LABELS,
  BRIEF_ROUTE_LABELS,
  briefCoveredDays,
  BRIEF_THEME_KIND_LABELS,
  describeBriefHeadline,
  describeBriefTheme,
  describeResponseWindow,
} from '@/lib/destination-briefs';
import { ArrowLeft, Printer } from 'lucide-react';
import type { DestinationBrief } from '@/lib/types';

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function BriefPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const prospectId = String(params.prospectId);
  const briefId = String(params.briefId);

  const { userData, isLoading: isUserDataLoading, isSuperAdmin } = useUserData();
  const { firestore } = useFirebase();
  useEffect(() => {
    if (!isUserDataLoading && userData && !isSuperAdmin) {
      router.replace('/dashboard');
    }
  }, [isUserDataLoading, userData, isSuperAdmin, router]);

  const briefRef = useMemoFirebase(
    () =>
      firestore && isSuperAdmin
        ? doc(firestore, 'mediaProspects', prospectId, 'briefs', briefId)
        : null,
    [firestore, isSuperAdmin, prospectId, briefId]
  );
  const { data: brief, isLoading } = useDoc<DestinationBrief>(briefRef);

  const [headline, setHeadline] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadedFraming, setLoadedFraming] = useState(false);

  useEffect(() => {
    if (brief && !loadedFraming) {
      setHeadline(brief.headline || '');
      setOpeningNote(brief.openingNote || '');
      setClosingNote(brief.closingNote || '');
      setLoadedFraming(true);
    }
  }, [brief, loadedFraming]);

  async function saveFraming(status: 'draft' | 'final') {
    setIsSaving(true);
    try {
      const call = httpsCallable(getFunctions(), 'updateDestinationBrief');
      await call({ prospectId, briefId, headline, openingNote, closingNote, status });
      toast({ title: status === 'final' ? 'Marked final' : 'Saved' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: err?.message });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || isUserDataLoading || !isSuperAdmin) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!brief) {
    return <p className="text-sm text-muted-foreground">Brief not found.</p>;
  }

  const c = brief.content;
  const autoHeadline = describeBriefHeadline({
    themesFound: c.totals.themesFound,
    themesWithoutMention: c.totals.themesWithoutMention,
    sourcesRepresented: c.totals.sourcesRepresented,
    windowDays: c.windowDays,
    dataSpanDays: c.dataSpanDays,
  });

  // Every period shown on this page is the one the data covers, not the one that was
  // requested. Briefs stored before dataStartMs existed fall back to the requested window.
  const coveredDays = briefCoveredDays(c);
  const coverStartMs = c.dataStartMs ?? c.windowStartMs;
  const coverEndMs = c.dataEndMs ?? c.windowEndMs;
  const coverRange = `${formatDate(coverStartMs)} – ${formatDate(coverEndMs)}`;

  return (
    <div className="print-report flex flex-col gap-8">
      {/* Print-only masthead. */}
      <div className="hidden print:block print-header mb-4">
        <p className="text-xs uppercase tracking-widest">Press Pilot</p>
        <h1 className="text-2xl font-bold">Media Opportunity Brief — {brief.prospectName}</h1>
        <p className="text-xs">
          {coverRange} · Prepared {new Date().toLocaleDateString('en-GB')}
        </p>
      </div>

      {/* Screen-only controls. */}
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/dashboard/admin/briefs">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All briefs
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{brief.prospectName}</h1>
          <p className="text-sm text-muted-foreground">
            {coveredDays}-day replay · {coverRange}
            {c.windowUnderfilled && ` · ${c.windowDays}-day window requested`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => saveFraming('draft')} disabled={isSaving}>
            Save notes
          </Button>
          <Button variant="outline" onClick={() => saveFraming('final')} disabled={isSaving}>
            Mark final
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Screen-only framing editor. The analysis is the machine's; the pitch is a person's. */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle className="text-base">Your framing</CardTitle>
          <CardDescription>
            The only free prose on the document. The evidence below cannot be edited — if it is
            wrong, regenerate the brief.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder={autoHeadline}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to print the measured summary: “{autoHeadline}”
            </p>
          </div>
          <div>
            <Label htmlFor="opening">Opening note</Label>
            <Textarea
              id="opening"
              rows={3}
              value={openingNote}
              onChange={(e) => setOpeningNote(e.target.value)}
              placeholder="Why you prepared this for them specifically."
            />
          </div>
          <div>
            <Label htmlFor="closing">Closing note</Label>
            <Textarea
              id="closing"
              rows={3}
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              placeholder="What you are proposing next."
            />
          </div>
        </CardContent>
      </Card>

      {/* ---------------- The document itself ---------------- */}

      <Card>
        <CardHeader>
          <CardDescription className="text-xs uppercase tracking-widest">
            What happened in {coveredDays === 1 ? 'a single day' : `${coveredDays} days`} of coverage
          </CardDescription>
          <CardTitle className="text-xl leading-snug">{headline || autoHeadline}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {openingNote && <p className="text-sm leading-relaxed">{openingNote}</p>}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Items reviewed', value: c.totals.itemsMatched },
              { label: 'Outlets represented', value: c.totals.sourcesRepresented },
              { label: 'Themes that moved', value: c.totals.themesFound },
              { label: 'Times you were named', value: c.totals.appearanceCount },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Themes. */}
      {c.themes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No theme cleared the evidence bar</CardTitle>
            <CardDescription>
              Across {c.totals.sourcesRepresented} sources in {coveredDays} days, nothing reached
              three items from at least two outlets. That is a genuine finding about this window,
              not a gap in the analysis — a quiet period is a quiet period.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Themes that moved</h2>
          {c.themes.map((theme, index) => {
            const window = describeResponseWindow(theme);
            return (
              <Card key={theme.key} className="break-inside-avoid">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {index + 1}. {theme.label}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {describeBriefTheme(theme)} · {formatDate(theme.firstSeenMs)} –{' '}
                        {formatDate(theme.lastSeenMs)}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={theme.route === 'ran_without_you' ? 'destructive' : 'default'}>
                        {BRIEF_ROUTE_LABELS[theme.route]}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {BRIEF_THEME_KIND_LABELS[theme.kind]}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{BRIEF_ROUTE_EXPLANATIONS[theme.route]}</p>
                  {window && <p className="text-sm font-medium">{window}</p>}
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Evidence
                    </p>
                    <ul className="space-y-2">
                      {theme.evidence.map((ev) => (
                        <li key={ev.mediaItemId} className="text-sm">
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline decoration-muted-foreground/40 underline-offset-2"
                          >
                            {ev.title}
                          </a>
                          <div className="text-xs text-muted-foreground">
                            {ev.sourceName} · {formatDate(ev.publishedAtMs)}
                            {ev.namesProspect && ' · names you'}
                            {ev.role && BRIEF_EVIDENCE_ROLE_LABELS[ev.role] && !ev.namesProspect && (
                              <span className="ml-1 font-medium text-foreground">
                                · {BRIEF_EVIDENCE_ROLE_LABELS[ev.role]}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Appearances. */}
      {c.appearances.length > 0 && (
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-base">Where you were named</CardTitle>
            <CardDescription>
              Every item in the {coveredDays} days of coverage that mentioned {brief.prospectName} or
              one of its named assets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {c.appearances.map((ev) => (
                <li key={ev.mediaItemId} className="text-sm">
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline decoration-muted-foreground/40 underline-offset-2"
                  >
                    {ev.title}
                  </a>
                  <div className="text-xs text-muted-foreground">
                    {ev.sourceName} · {formatDate(ev.publishedAtMs)}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Future state — explicitly separated from everything measured above. */}
      <Card className="break-inside-avoid border-primary/40">
        <CardHeader>
          <CardDescription className="text-xs uppercase tracking-widest">
            What Press Pilot does with this
          </CardDescription>
          <CardTitle className="text-base">From a one-off brief to a weekly habit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{BRIEF_FUTURE_STATE_NOTE}</p>
          {closingNote && <p className="text-sm leading-relaxed">{closingNote}</p>}
        </CardContent>
      </Card>

      {/* Limits and method. */}
      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle className="text-base">What this brief does not tell you</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {c.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
          <Separator />
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Method</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{BRIEF_METHODOLOGY_NOTE}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide">
              Sources reviewed ({c.sourcesUsed.length})
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {c.sourcesUsed.map((s) => s.name).join(' · ')}
            </p>
          </div>
          {brief.watchTermsUsed.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Terms checked</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {brief.watchTermsUsed.join(' · ')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
