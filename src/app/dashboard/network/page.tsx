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
import { Building2, Users, Send, ArrowUpRight, RefreshCw, Network as NetworkIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

  const canSeeNetwork = !!organization && (organization.canProvisionChildOrgs || !!organization.parentOrgId);

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

  useEffect(() => {
    if (!isUserLoading && !isOrgLoading && organization && !canSeeNetwork) {
      router.replace('/dashboard');
    }
  }, [isUserLoading, isOrgLoading, organization, canSeeNetwork, router]);

  useEffect(() => {
    if (!isUserLoading && !isOrgLoading && canSeeNetwork) loadRollup();
  }, [isUserLoading, isOrgLoading, canSeeNetwork, loadRollup]);

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
        <Button variant="outline" size="sm" onClick={loadRollup} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

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
        </>
      ) : null}
    </div>
  );
}
