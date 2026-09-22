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
import { useToast } from '@/hooks/use-toast';
import {
  BRIEF_GATE_EXPLANATION,
  BRIEF_GATE_OVERRIDE_HINT,
  briefCoveredDays,
  describeBriefHeadline,
} from '@/lib/destination-briefs';
import { ArrowLeft, Check, Link2, Printer, X } from 'lucide-react';
import { BriefDocument } from '@/components/briefs/brief-document';
import { BRIEF_SHARE_LINK_EXPLANATION } from '@/lib/destination-briefs';
import type { BriefShareLink, DestinationBrief } from '@/lib/types';


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
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    if (brief && !loadedFraming) {
      setHeadline(brief.headline || '');
      setOpeningNote(brief.openingNote || '');
      setClosingNote(brief.closingNote || '');
      setLoadedFraming(true);
    }
  }, [brief, loadedFraming]);

  // Share links. Read through a callable because /briefShareLinks is closed to clients, so
  // there is no listener here — the list is refreshed after creating or revoking a link and
  // whenever the brief is opened.
  const [shareLinks, setShareLinks] = useState<BriefShareLink[] | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  async function loadShareLinks() {
    try {
      const call = httpsCallable(getFunctions(), 'listBriefShareLinks');
      const res = await call({ prospectId, briefId });
      setShareLinks(((res.data as any)?.links || []) as BriefShareLink[]);
    } catch {
      setShareLinks([]);
    }
  }

  useEffect(() => {
    if (isSuperAdmin) void loadShareLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, prospectId, briefId]);

  async function createShareLink() {
    setIsSharing(true);
    try {
      const call = httpsCallable(getFunctions(), 'createBriefShareLink');
      const res = await call({ prospectId, briefId });
      const url = (res.data as any)?.url as string;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast({ title: 'Link created and copied', description: url });
      await loadShareLinks();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not create link', description: err?.message });
    } finally {
      setIsSharing(false);
    }
  }

  async function revokeShareLink(token: string) {
    setIsSharing(true);
    try {
      const call = httpsCallable(getFunctions(), 'revokeBriefShareLink');
      await call({ token });
      toast({ title: 'Link withdrawn' });
      await loadShareLinks();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not withdraw link', description: err?.message });
    } finally {
      setIsSharing(false);
    }
  }

  async function saveFraming(status: 'draft' | 'final', override = false) {
    setIsSaving(true);
    try {
      const call = httpsCallable(getFunctions(), 'updateDestinationBrief');
      await call({
        prospectId,
        briefId,
        headline,
        openingNote,
        closingNote,
        status,
        ...(override ? { override: true, overrideReason } : {}),
      });
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

  // Briefs generated before the gate existed carry no sendability block. They are shown as
  // unassessed rather than judged against thresholds they were never measured on.
  const gate = c.sendability;
  const blocked = gate ? !gate.sendable : false;

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
          <Button
            variant="outline"
            onClick={() => saveFraming('final')}
            disabled={isSaving || blocked}
            title={blocked ? 'Below the sending bar — see the checks below' : undefined}
          >
            Mark final
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Screen-only sending gate. Never printed: the prospect sees the findings, not our
          internal bar for whether the findings were worth their time. */}
      {gate && (
        <Card
          className={`no-print ${blocked ? 'border-destructive/40 bg-destructive/5' : 'border-emerald-600/30'}`}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {blocked ? 'Below the sending bar' : 'Clears the sending bar'}
              <Badge variant={blocked ? 'destructive' : 'default'}>
                {gate.checks.filter((chk) => chk.passed).length}/{gate.checks.length} checks
              </Badge>
            </CardTitle>
            <CardDescription>{BRIEF_GATE_EXPLANATION}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {gate.checks.map((chk) => (
                <li key={chk.id} className="flex gap-2 text-sm">
                  {chk.passed ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    <span className={chk.passed ? '' : 'font-medium'}>{chk.label}</span>
                    <span className="block text-xs text-muted-foreground">{chk.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            {blocked && (
              <div className="space-y-2 border-t pt-3">
                <Label htmlFor="override">Override reason</Label>
                <Textarea
                  id="override"
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Why this brief is worth sending despite the failed checks."
                />
                <p className="text-xs text-muted-foreground">{BRIEF_GATE_OVERRIDE_HINT}</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSaving || overrideReason.trim().length < 15}
                  onClick={() => saveFraming('final', true)}
                >
                  Override and mark final
                </Button>
              </div>
            )}

            {brief.gateOverride && (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                Marked final below the bar. Stated reason: “{brief.gateOverride.reason}”
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Screen-only share links. A brief sent as an attachment goes dark the moment it
          leaves; a link tells you whether it was opened and whether it was forwarded. */}
      <Card className="no-print">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Share link</CardTitle>
              <CardDescription>{BRIEF_SHARE_LINK_EXPLANATION}</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={createShareLink}
              disabled={isSharing || brief.status !== 'final'}
              title={
                brief.status !== 'final'
                  ? 'Mark the brief final first — that is where the sending bar is checked.'
                  : undefined
              }
            >
              <Link2 className="mr-2 h-4 w-4" />
              Create link
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {brief.status !== 'final' && (
            <p className="text-xs text-muted-foreground">
              Only a final brief can be shared, so a link can never route around the sending bar.
            </p>
          )}
          {shareLinks && shareLinks.length === 0 && brief.status === 'final' && (
            <p className="text-xs text-muted-foreground">No link issued yet.</p>
          )}
          {(shareLinks || []).map((link) => (
            <div key={link.token} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="break-all text-xs">{link.url}</code>
                <div className="flex items-center gap-2">
                  {link.revoked ? (
                    <Badge variant="outline">withdrawn</Badge>
                  ) : (
                    <Badge variant="secondary">live</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(link.url)}
                  >
                    Copy
                  </Button>
                  {!link.revoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeShareLink(link.token)}
                      disabled={isSharing}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {link.viewCount === 0
                  ? 'Not opened yet.'
                  : `${link.viewCount} ${link.viewCount === 1 ? 'open' : 'opens'} by ${link.distinctViewerCount} ${link.distinctViewerCount === 1 ? 'reader' : 'readers'}`}
                {link.firstViewedAtMs ? ` · first ${formatDate(link.firstViewedAtMs)}` : ''}
                {link.lastViewedAtMs && link.lastViewedAtMs !== link.firstViewedAtMs
                  ? ` · last ${formatDate(link.lastViewedAtMs)}`
                  : ''}
                {link.expiresAtMs ? ` · expires ${formatDate(link.expiresAtMs)}` : ''}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

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
      {/* Rendered by the same component the public share link uses, so what a prospect opens
          is the document that was printed here and not a second implementation of it. */}
      <BriefDocument
        prospectName={brief.prospectName}
        headline={headline}
        openingNote={openingNote}
        closingNote={closingNote}
        content={c}
        watchTermsUsed={brief.watchTermsUsed}
      />
    </div>
  );
}
