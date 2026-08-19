'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUserData } from '@/hooks/use-user-data';
import { useOrganization } from '@/hooks/use-organization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Building2, Users, Send, ArrowUpRight, RefreshCw, Network as NetworkIcon, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CreateChildOrgDialog } from '@/components/network/create-child-org-dialog';

type OrgRollupNode = {
  id: string;
  name: string;
  slug: string;
  parentOrgId: string | null;
  depth: number;
  partnerCount: number;
  submissionCount: number;
  releaseSentCount: number;
  totalEmailsSent: number;
  lastActivityAt: any;
  escalatedInCount: number;
  escalatedInUsedCount: number;
};

type RollupTotals = {
  orgCount: number;
  totalPartners: number;
  totalSubmissions: number;
  totalReleasesSent: number;
  totalEmailsSent: number;
  totalEscalated: number;
  totalEscalatedUsed: number;
  escalationConversionRate: number;
};

type RollupResult = {
  org: { id: string; name: string; slug: string };
  nodes: OrgRollupNode[];
  totals: RollupTotals;
};

type ThemeTrendRow = {
  theme: string;
  submissionsCurrent: number;
  submissionsPrior: number;
  volumeChangePct: number | null;
  escalatedCount: number;
  escalationRate: number;
  releaseCount: number;
  totalSends: number;
  totalOpens: number;
  totalClicks: number;
  openRate: number;
  openRateVsNetworkMean: number | null;
};

type ThemeTrendsResult = {
  org: { id: string; name: string; slug: string };
  windowDays: number;
  networkMeanOpenRate: number;
  themes: ThemeTrendRow[];
};

function themeDigestLine(row: ThemeTrendRow): string {
  const parts: string[] = [];
  if (row.volumeChangePct !== null) {
    const direction = row.volumeChangePct >= 0 ? 'up' : 'down';
    parts.push(`${row.theme} submissions ${direction} ${Math.abs(row.volumeChangePct)}% this month`);
  } else {
    parts.push(`${row.theme} submissions are new this month (${row.submissionsCurrent})`);
  }
  if (row.openRateVsNetworkMean !== null && row.totalSends > 0) {
    parts.push(`average open rate ${row.openRateVsNetworkMean}x the network mean`);
  }
  return parts.join('; ');
}

function formatActivity(ts: any) {
  if (!ts) return 'No activity';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts._seconds ? ts._seconds * 1000 : ts);
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

export default function NetworkRollupPage() {
  const { orgId, role, isLoading: isUserLoading } = useUserData();
  const { organization, isLoading: isOrgLoading } = useOrganization(orgId);
  const router = useRouter();
  const [rollup, setRollup] = useState<RollupResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [themeTrends, setThemeTrends] = useState<ThemeTrendsResult | null>(null);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  const canSeeNetwork = !!organization && (organization.canProvisionChildOrgs || !!organization.parentOrgId);
  // Free-within-Enterprise pilot digest (federated-tenants step 8) — not tied to
  // canProvisionChildOrgs/parentOrgId, since it's purely a tier entitlement.
  const canSeeThemeTrends = organization?.tier === 'enterprise';
  const directChildCount = rollup ? rollup.nodes.filter((n) => n.depth === 1).length : 0;
  const canCreateMemberOrgs =
    !!organization?.canProvisionChildOrgs && !!organization?.maxChildOrgs && role === 'Admin';

  const loadRollup = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    setError(null);
    try {
      const functions = getFunctions();
      const getOrgRollup = httpsCallable<{ orgId: string }, RollupResult>(functions, 'getOrgRollup');
      const result = await getOrgRollup({ orgId });
      setRollup(result.data);
    } catch (err: any) {
      console.error('Failed to load network rollup:', err);
      setError(err?.message || 'Failed to load network rollup.');
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  const loadThemeTrends = useCallback(async () => {
    if (!orgId) return;
    setIsLoadingTrends(true);
    setTrendsError(null);
    try {
      const functions = getFunctions();
      const getThemeTrends = httpsCallable<{ scope: { type: 'org-subtree'; orgId: string } }, ThemeTrendsResult>(
        functions,
        'getThemeTrends'
      );
      const result = await getThemeTrends({ scope: { type: 'org-subtree', orgId } });
      setThemeTrends(result.data);
    } catch (err: any) {
      console.error('Failed to load theme trends:', err);
      setTrendsError(err?.message || 'Failed to load theme trends.');
    } finally {
      setIsLoadingTrends(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!isUserLoading && !isOrgLoading && organization && !canSeeNetwork) {
      router.replace('/dashboard');
    }
  }, [isUserLoading, isOrgLoading, organization, canSeeNetwork, router]);

  useEffect(() => {
    if (!isUserLoading && !isOrgLoading && canSeeNetwork) loadRollup();
  }, [isUserLoading, isOrgLoading, canSeeNetwork, loadRollup]);

  useEffect(() => {
    if (!isUserLoading && !isOrgLoading && canSeeNetwork && canSeeThemeTrends) loadThemeTrends();
  }, [isUserLoading, isOrgLoading, canSeeNetwork, canSeeThemeTrends, loadThemeTrends]);

  if (isUserLoading || isOrgLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!canSeeNetwork) return null;

  const descendantCount = rollup ? rollup.totals.orgCount - 1 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Network</h1>
          <p className="text-muted-foreground">
            {organization?.name} and every member organisation beneath it, rolled up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadRollup} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canCreateMemberOrgs && organization && (
            <CreateChildOrgDialog
              parentOrgName={organization.name}
              seatsUsed={directChildCount}
              maxChildOrgs={organization.maxChildOrgs!}
              onCreated={loadRollup}
            />
          )}
        </div>
      </div>

      {canCreateMemberOrgs && organization?.maxChildOrgs != null && (
        <p className="text-sm text-muted-foreground -mt-4">
          {directChildCount} of {organization.maxChildOrgs} licensed seats used
          {directChildCount >= organization.maxChildOrgs ? ' — contact Press Pilot to license more.' : '.'}
        </p>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {isLoading && !rollup ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : rollup ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-headline">{descendantCount}</p>
                    <p className="text-xs text-muted-foreground">Member Organisations</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-headline">{rollup.totals.totalPartners}</p>
                    <p className="text-xs text-muted-foreground">Partners Across Network</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <NetworkIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-headline">{rollup.totals.totalSubmissions}</p>
                    <p className="text-xs text-muted-foreground">Submissions Across Network</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Send className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-headline">{rollup.totals.totalReleasesSent}</p>
                    <p className="text-xs text-muted-foreground">Releases Sent Across Network</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <ArrowUpRight className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-headline">{rollup.totals.totalEscalated}</p>
                    <p className="text-xs text-muted-foreground">
                      Stories Pushed Up
                      {rollup.totals.totalEscalated > 0 && (
                        <> · {Math.round(rollup.totals.escalationConversionRate * 100)}% drafted</>
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Member organisations</CardTitle>
              <CardDescription>
                Every organisation in this network, including {organization?.name} itself. Indentation shows
                where each one sits in the tree.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organisation</TableHead>
                    <TableHead className="text-right">Partners</TableHead>
                    <TableHead className="text-right">Submissions</TableHead>
                    <TableHead className="text-right">Releases Sent</TableHead>
                    <TableHead className="text-right">Stories Pushed Up</TableHead>
                    <TableHead>Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...rollup.nodes]
                    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name))
                    .map((node) => (
                      <TableRow key={node.id}>
                        <TableCell style={{ paddingLeft: `${16 + node.depth * 24}px` }}>
                          <span className={node.depth === 0 ? 'font-semibold' : ''}>{node.name}</span>
                        </TableCell>
                        <TableCell className="text-right">{node.partnerCount}</TableCell>
                        <TableCell className="text-right">{node.submissionCount}</TableCell>
                        <TableCell className="text-right">{node.releaseSentCount}</TableCell>
                        <TableCell className="text-right">
                          {node.escalatedInCount > 0
                            ? `${node.escalatedInCount} (${node.escalatedInUsedCount} drafted)`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatActivity(node.lastActivityAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {canSeeThemeTrends && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Theme trends
                </CardTitle>
                <CardDescription>
                  Submission volume, escalation, and release engagement by theme across{' '}
                  {organization?.name}&apos;s network, over the last {themeTrends?.windowDays ?? 30} days vs the{' '}
                  {themeTrends?.windowDays ?? 30} days before that. Free with Enterprise — a pilot on real network
                  data before this generalises further.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {trendsError && (
                  <p className="text-sm text-destructive">{trendsError}</p>
                )}
                {isLoadingTrends && !themeTrends ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : themeTrends && themeTrends.themes.length > 0 ? (
                  <>
                    <ul className="space-y-2">
                      {themeTrends.themes.slice(0, 5).map((row) => (
                        <li key={row.theme} className="flex items-start gap-2 text-sm">
                          {row.volumeChangePct !== null && row.volumeChangePct < 0 ? (
                            <TrendingDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          ) : (
                            <TrendingUp className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                          )}
                          <span>{themeDigestLine(row)}.</span>
                        </li>
                      ))}
                    </ul>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Theme</TableHead>
                          <TableHead className="text-right">Submissions (30d)</TableHead>
                          <TableHead className="text-right">vs prior 30d</TableHead>
                          <TableHead className="text-right">Escalation rate</TableHead>
                          <TableHead className="text-right">Open rate</TableHead>
                          <TableHead className="text-right">vs network mean</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {themeTrends.themes.map((row) => (
                          <TableRow key={row.theme}>
                            <TableCell className="font-medium">{row.theme}</TableCell>
                            <TableCell className="text-right">{row.submissionsCurrent}</TableCell>
                            <TableCell className="text-right">
                              {row.volumeChangePct === null ? 'New' : `${row.volumeChangePct > 0 ? '+' : ''}${row.volumeChangePct}%`}
                            </TableCell>
                            <TableCell className="text-right">{Math.round(row.escalationRate * 100)}%</TableCell>
                            <TableCell className="text-right">
                              {row.totalSends > 0 ? `${Math.round(row.openRate * 100)}%` : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {row.openRateVsNetworkMean !== null && row.totalSends > 0 ? `${row.openRateVsNetworkMean}x` : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Not enough themed submissions in this network yet to show trends.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
