'use client';

/**
 * The top of a coverage report: the story funnel, headline counts and the breakdowns a board
 * actually asks about — which outlets, what reach tier, which members, which themes.
 *
 * Used by the dashboard coverage page, the Reports page and the public shared report, so the
 * numbers a customer sees and the numbers their board sees are computed by the same code
 * (summariseCoverage in coverage-core.ts) from the same records.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildStoryFunnel,
  describeReportedAudience,
  formatFunnelLine,
  type CountRow,
  type CoverageSummary,
} from '@/lib/coverage-core';

type Props = {
  summary: CoverageSummary;
  funnel?: { submitted: number; issued: number } | null;
  submissionsLabel?: string;
  releasesLabel?: string;
  membersLabel?: string;
  /** Hide the member breakdown, e.g. when the viewer is a single member. */
  hideMembers?: boolean;
};

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: CountRow[]; empty: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <Card className="break-inside-avoid">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 8).map((r) => (
              <li key={r.key} className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate">{r.label}</span>
                  <span className="tabular-nums text-muted-foreground">{r.count}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-muted">
                  <div className="h-1.5 rounded bg-primary" style={{ width: `${max ? (r.count / max) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function CoverageSummaryView({
  summary,
  funnel,
  submissionsLabel = 'Stories submitted',
  releasesLabel = 'Releases issued',
  membersLabel = 'Members',
  hideMembers = false,
}: Props) {
  const storyFunnel = funnel
    ? buildStoryFunnel({
        submitted: funnel.submitted,
        issued: funnel.issued,
        releasesPlaced: summary.releasesWithCoverage,
        placements: summary.placements,
      })
    : null;
  const audience = describeReportedAudience(summary);

  return (
    <div className="flex flex-col gap-4">
      {storyFunnel && (
        <Card className="break-inside-avoid">
          <CardHeader className="pb-2">
            <CardDescription>Story funnel</CardDescription>
            <CardTitle className="text-lg font-semibold leading-snug">
              {formatFunnelLine(storyFunnel, { submitted: submissionsLabel, issued: releasesLabel })}
            </CardTitle>
          </CardHeader>
          {storyFunnel.placementRate !== null && (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                {storyFunnel.placementRate}% of releases issued in this period earned at least one placement.
              </p>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Placements" value={summary.placements} hint={`${summary.fromPressPilotSends} followed a Press Pilot send`} />
        <Stat label="Outlets" value={summary.distinctOutlets} />
        {!hideMembers && <Stat label={`${membersLabel} featured`} value={summary.membersFeatured} />}
        <Stat
          label="Tone"
          value={`${summary.positive} positive`}
          hint={`${summary.neutral} neutral · ${summary.sensitive} sensitive`}
        />
      </div>

      {audience && <p className="text-sm text-muted-foreground">{audience}.</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Breakdown title="Top outlets" rows={summary.topOutlets} empty="No placements yet." />
        <Breakdown title="Reach" rows={summary.byOutletType} empty="No placements yet." />
        {!hideMembers && <Breakdown title={`${membersLabel} featured`} rows={summary.byMember} empty="No members linked yet." />}
        <Breakdown title="Themes" rows={summary.byTheme} empty="No themes tagged yet." />
      </div>
    </div>
  );
}
