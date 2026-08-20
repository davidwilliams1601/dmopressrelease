'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import { useRouter } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Users, Send, Mail, RefreshCw, Network, PoundSterling, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProvisionOrgDialog } from '@/components/admin/provision-org-dialog';
import { EditOrgLimitsDialog } from '@/components/admin/edit-org-limits-dialog';
import { SetOrgParentDialog } from '@/components/admin/set-org-parent-dialog';
import { DeleteOrgDialog } from '@/components/admin/delete-org-dialog';
import { SeedDemoDialog } from '@/components/admin/seed-demo-dialog';
import { ResetPasswordDialog } from '@/components/admin/reset-password-dialog';
import { CreditActionsDialog } from '@/components/admin/credit-actions-dialog';
import { VerticalCategoriesCard } from '@/components/admin/vertical-categories-card';
import { ThemeTaxonomyCard } from '@/components/admin/theme-taxonomy-card';
import { MediaTaxonomyCard } from '@/components/admin/media-taxonomy-card';
import { getRegionLabel } from '@/lib/regions';
import { format, formatDistanceToNow } from 'date-fns';

type OrgStat = {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  maxPartners: number | null;
  maxUsers: number | null;
  tier: string | null;
  adminEmail: string | null;
  createdAt: any;
  partnerCount: number;
  submissionCount: number;
  releaseSentCount: number;
  totalEmailsSent: number;
  lastActivityAt: any;
  parentOrgId: string | null;
  ancestorOrgIds: string[];
  canProvisionChildOrgs: boolean;
  maxChildOrgs: number | null;
  childOrgDefaultTier: string | null;
  contractValueMonthly: number | null;
  region: string | null;
  escalatedInCount: number;
  escalatedInUsedCount: number;
};

type Totals = {
  orgCount: number;
  totalPartners: number;
  totalReleasesSent: number;
  totalEmailsSent: number;
  standaloneMrr: number;
  networkMrr: number;
  totalMrr: number;
};

type NetworkStat = {
  rootOrgId: string;
  rootOrgName: string;
  memberCount: number;
  directChildCount: number;
  maxChildOrgs: number | null;
  maxDepth: number;
  totalPartners: number;
  totalSubmissions: number;
  totalReleasesSent: number;
  totalEmailsSent: number;
  totalEscalated: number;
  totalEscalatedUsed: number;
  escalationConversionRate: number;
  tierDerivedMrr: number;
  contractValueMonthly: number | null;
  members: { id: string; name: string }[];
};

const gbp = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

const VERTICAL_LABELS: Record<string, string> = {
  dmo: 'DMO',
  charity: 'Charity',
  'trade-body': 'Trade Body',
};

export default function AdminOrgsPage() {
  const { isSuperAdmin, isLoading: isUserLoading } = useUserData();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgStat[]>([]);
  const [networks, setNetworks] = useState<NetworkStat[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getReport = httpsCallable<void, { orgs: OrgStat[]; totals: Totals; networks: NetworkStat[] }>(functions, 'getSuperAdminReport');
      const result = await getReport();
      setOrgs(result.data.orgs);
      setTotals(result.data.totals);
      setNetworks(result.data.networks);
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) router.replace('/dashboard');
  }, [isUserLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (!isUserLoading && isSuperAdmin) loadReport();
  }, [isUserLoading, isSuperAdmin, loadReport]);

  if (isUserLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts._seconds ? ts._seconds * 1000 : ts);
      return format(d, 'dd MMM yyyy');
    } catch { return '—'; }
  };

  const formatActivity = (ts: any) => {
    if (!ts) return 'No activity';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts._seconds ? ts._seconds * 1000 : ts);
      return formatDistanceToNow(d, { addSuffix: true });
    } catch { return '—'; }
  };

  const activityColor = (ts: any) => {
    if (!ts) return 'text-muted-foreground';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts._seconds ? ts._seconds * 1000 : ts);
      const daysSince = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 14) return 'text-green-600';
      if (daysSince < 60) return 'text-yellow-600';
      return 'text-red-500';
    } catch { return 'text-muted-foreground'; }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-xs">Super Admin</Badge>
          </div>
          <h1 className="text-3xl font-headline font-bold">Platform Overview</h1>
          <p className="text-muted-foreground">
            Usage and activity across all organisations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadReport} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <ProvisionOrgDialog onOrgProvisioned={loadReport} />
        </div>
      </div>

      <Tabs defaultValue="orgs">
        <TabsList>
          <TabsTrigger value="orgs">Organisations</TabsTrigger>
          <TabsTrigger value="networks">Networks{networks.length > 0 ? ` (${networks.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="orgs" className="flex flex-col gap-6 mt-4">
      {/* Platform-wide stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold font-headline">{totals?.orgCount ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Organisations</p>
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
                <p className="text-2xl font-bold font-headline">{totals?.totalPartners ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Total Partners</p>
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
                <p className="text-2xl font-bold font-headline">{totals?.totalReleasesSent ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Releases Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold font-headline">{totals?.totalEmailsSent.toLocaleString() ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Emails Distributed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-org table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organisations
          </CardTitle>
          <CardDescription>
            {isLoading ? 'Loading...' : `${orgs.length} organisation${orgs.length !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : orgs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No organisations yet. Click "New Organisation" to provision the first.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Partners</TableHead>
                  <TableHead className="text-right">Submissions</TableHead>
                  <TableHead className="text-right">Releases Sent</TableHead>
                  <TableHead className="text-right">Emails Sent</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <code className="text-xs text-muted-foreground">{org.slug}</code>
                        {org.parentOrgId && (
                          <p className="text-xs text-muted-foreground">under <code className="font-mono">{org.parentOrgId}</code></p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="outline" className="text-xs w-fit">
                          {VERTICAL_LABELS[org.vertical] || org.vertical}
                        </Badge>
                        {org.region && (
                          <span className="text-xs text-muted-foreground">{getRegionLabel(org.region)}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {org.tier ? (
                          <Badge variant="secondary" className="text-xs w-fit capitalize">{org.tier}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {org.maxUsers != null && (
                          <span className="text-xs text-muted-foreground">{org.maxUsers} users</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={org.maxPartners != null && org.partnerCount >= org.maxPartners ? 'text-red-500 font-semibold' : ''}>
                        {org.partnerCount}
                      </span>
                      {org.maxPartners != null && (
                        <span className="text-muted-foreground"> / {org.maxPartners}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{org.submissionCount}</TableCell>
                    <TableCell className="text-right">{org.releaseSentCount}</TableCell>
                    <TableCell className="text-right">{org.totalEmailsSent.toLocaleString()}</TableCell>
                    <TableCell>
                      <span className={`text-sm ${activityColor(org.lastActivityAt)}`}>
                        {formatActivity(org.lastActivityAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(org.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <SeedDemoDialog
                          orgId={org.id}
                          orgName={org.name}
                          mode={org.releaseSentCount === 0 && org.partnerCount === 0 ? 'seed' : 'reset'}
                          onDone={loadReport}
                        />
                        <EditOrgLimitsDialog
                          orgId={org.id}
                          orgName={org.name}
                          currentMaxPartners={org.maxPartners ?? undefined}
                          currentMaxUsers={org.maxUsers ?? undefined}
                          currentTier={org.tier ?? undefined}
                          currentContractValueMonthly={org.contractValueMonthly}
                          isNetworkRoot={org.canProvisionChildOrgs || (!org.parentOrgId && org.ancestorOrgIds.length === 0 && networks.some((n) => n.rootOrgId === org.id))}
                          currentCanProvisionChildOrgs={org.canProvisionChildOrgs}
                          currentMaxChildOrgs={org.maxChildOrgs}
                          currentChildOrgDefaultTier={org.childOrgDefaultTier}
                          onUpdated={loadReport}
                        />
                        <SetOrgParentDialog
                          orgId={org.id}
                          orgName={org.name}
                          currentParentOrgId={org.parentOrgId}
                          onUpdated={loadReport}
                        />
                        <ResetPasswordDialog
                          orgName={org.name}
                          adminEmail={org.adminEmail}
                        />
                        <CreditActionsDialog
                          orgId={org.id}
                          orgName={org.name}
                          onUpdated={loadReport}
                        />
                        <DeleteOrgDialog
                          orgId={org.id}
                          orgName={org.name}
                          onDeleted={loadReport}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="networks" className="flex flex-col gap-6 mt-4">
          {/* Revenue segmentation */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <PoundSterling className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-headline">{totals ? gbp(totals.totalMrr) : '—'}</p>
                    <p className="text-xs text-muted-foreground">Platform MRR (tier-derived)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-headline">{totals ? gbp(totals.standaloneMrr) : '—'}</p>
                    <p className="text-xs text-muted-foreground">Standalone-org revenue</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Network className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-headline">{totals ? gbp(totals.networkMrr) : '—'}</p>
                    <p className="text-xs text-muted-foreground">Network-member revenue</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Layers className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-headline">{networks.length}</p>
                    <p className="text-xs text-muted-foreground">Active networks</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Federated Networks
              </CardTitle>
              <CardDescription>
                {isLoading ? 'Loading...' : `${networks.length} network${networks.length !== 1 ? 's' : ''} — root org plus its member orgs`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : networks.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  No federated networks yet. A network appears here once an org is flagged "can provision child orgs" or has at least one daughter org attached via re-parenting.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Network</TableHead>
                      <TableHead>Shape</TableHead>
                      <TableHead className="text-right">Seats</TableHead>
                      <TableHead className="text-right">Tier-derived MRR</TableHead>
                      <TableHead className="text-right">Contract value</TableHead>
                      <TableHead className="text-right">Escalations</TableHead>
                      <TableHead className="text-right">Conversion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {networks.map((net) => {
                      const seatsUsed = net.directChildCount;
                      const overCap = net.maxChildOrgs != null && seatsUsed > net.maxChildOrgs;
                      const mrrGap = net.contractValueMonthly != null ? net.contractValueMonthly - net.tierDerivedMrr : null;
                      return (
                        <TableRow key={net.rootOrgId}>
                          <TableCell>
                            <p className="font-medium">{net.rootOrgName}</p>
                            <p className="text-xs text-muted-foreground">{net.memberCount} member org{net.memberCount !== 1 ? 's' : ''}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {net.maxDepth >= 2 ? '3+ level' : '2 level'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {net.maxChildOrgs != null ? (
                              <span className={overCap ? 'text-red-500 font-semibold' : ''}>
                                {seatsUsed} / {net.maxChildOrgs}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{seatsUsed} (uncapped)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{gbp(net.tierDerivedMrr)}</TableCell>
                          <TableCell className="text-right">
                            {net.contractValueMonthly != null ? (
                              <div className="flex flex-col items-end">
                                <span>{gbp(net.contractValueMonthly)}</span>
                                {mrrGap != null && mrrGap !== 0 && (
                                  <span className={`text-xs ${mrrGap < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                    {mrrGap > 0 ? '+' : ''}{gbp(mrrGap)} vs tier estimate
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not set</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {net.totalEscalated} sent up
                          </TableCell>
                          <TableCell className="text-right">
                            {net.totalEscalated > 0 ? `${Math.round(net.escalationConversionRate * 100)}%` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Tier-derived MRR sums each member org's plan price and is an estimate, not an invoice figure. "Contract value" is only shown once set manually via Edit Limits on the root org — set it for network deals where actual Enterprise billing differs from the sum of member tiers. Seat count reflects direct daughter orgs only; "Escalations" and "Conversion" measure how many member submissions were pushed up to a parent and, of those, drafted into an actual release.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <VerticalCategoriesCard />
      <ThemeTaxonomyCard />
      <MediaTaxonomyCard />
    </div>
  );
}
