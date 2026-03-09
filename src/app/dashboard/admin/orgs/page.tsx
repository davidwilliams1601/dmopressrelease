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
import { Building2, Users, Send, Mail, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProvisionOrgDialog } from '@/components/admin/provision-org-dialog';
import { EditOrgLimitsDialog } from '@/components/admin/edit-org-limits-dialog';
import { format, formatDistanceToNow } from 'date-fns';

type OrgStat = {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  maxPartners: number | null;
  createdAt: any;
  partnerCount: number;
  submissionCount: number;
  releaseSentCount: number;
  totalEmailsSent: number;
  lastActivityAt: any;
};

type Totals = {
  orgCount: number;
  totalPartners: number;
  totalReleasesSent: number;
  totalEmailsSent: number;
};

const VERTICAL_LABELS: Record<string, string> = {
  dmo: 'DMO',
  charity: 'Charity',
  'trade-body': 'Trade Body',
};

export default function AdminOrgsPage() {
  const { isSuperAdmin, isLoading: isUserLoading } = useUserData();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgStat[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getReport = httpsCallable<void, { orgs: OrgStat[]; totals: Totals }>(functions, 'getSuperAdminReport');
      const result = await getReport();
      setOrgs(result.data.orgs);
      setTotals(result.data.totals);
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
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {VERTICAL_LABELS[org.vertical] || org.vertical}
                      </Badge>
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
                      <EditOrgLimitsDialog
                        orgId={org.id}
                        orgName={org.name}
                        currentMaxPartners={org.maxPartners ?? undefined}
                        onUpdated={loadReport}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
