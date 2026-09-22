'use client';

/**
 * The Destination Media Opportunity Brief document.
 *
 * Deliberately one component with no data fetching and no editing affordances, because it is
 * rendered in two places that must never drift apart: the superadmin page it is printed from
 * (src/app/dashboard/admin/briefs/[prospectId]/[briefId]/page.tsx) and the tokenised public
 * link a prospect opens (src/app/brief/[token]/page.tsx). If those two renders could differ,
 * "here is the brief I showed you" stops being a true sentence.
 *
 * It renders the frozen `content` snapshot recorded at generation. Nothing here is derived
 * from live data, nothing here is editable, and the internal sending gate is never shown:
 * `content.sendability` is stripped before the public payload is ever built, and this
 * component would have nowhere to put it anyway.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import type { DestinationBriefContent } from '@/lib/types';

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export type BriefDocumentProps = {
  prospectName: string;
  /** The human framing, or empty to print the measured summary. */
  headline?: string | null;
  openingNote?: string | null;
  closingNote?: string | null;
  content: DestinationBriefContent;
  watchTermsUsed: string[];
};

export function BriefDocument({
  prospectName,
  headline,
  openingNote,
  closingNote,
  content: c,
  watchTermsUsed,
}: BriefDocumentProps) {
  const coveredDays = briefCoveredDays(c);
  const resolvedHeadline =
    (headline || '').trim() ||
    describeBriefHeadline({
      themesFound: c.totals.themesFound,
      themesWithoutMention: c.totals.themesWithoutMention,
      sourcesRepresented: c.totals.sourcesRepresented,
      windowDays: c.windowDays,
      dataSpanDays: c.dataSpanDays,
    });

  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription className="text-xs uppercase tracking-widest">
            What happened in {coveredDays === 1 ? 'a single day' : `${coveredDays} days`} of coverage
          </CardDescription>
          <CardTitle className="text-xl leading-snug">{resolvedHeadline}</CardTitle>
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
              Every item in the {coveredDays} days of coverage that mentioned {prospectName} or
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
          {watchTermsUsed.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Terms checked</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {watchTermsUsed.join(' · ')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
