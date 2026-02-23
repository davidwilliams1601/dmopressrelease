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
import { Building2 } from 'lucide-react';
import { ProvisionOrgDialog } from '@/components/admin/provision-org-dialog';
import { format } from 'date-fns';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  createdAt?: any;
};

export default function AdminOrgsPage() {
  const { isSuperAdmin, isLoading: isUserLoading } = useUserData();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);

  const loadOrgs = useCallback(async () => {
    setIsLoadingOrgs(true);
    try {
      const functions = getFunctions();
      const listOrgs = httpsCallable<void, OrgRow[]>(functions, 'listAllOrgs');
      const result = await listOrgs();
      setOrgs(result.data || []);
    } catch (error) {
      console.error('Failed to load orgs:', error);
    } finally {
      setIsLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) {
      router.replace('/dashboard');
    }
  }, [isUserLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (!isUserLoading && isSuperAdmin) {
      loadOrgs();
    }
  }, [isUserLoading, isSuperAdmin, loadOrgs]);

  if (isUserLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return format(d, 'dd MMM yyyy');
    } catch {
      return '—';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-xs">Super Admin</Badge>
          </div>
          <h1 className="text-3xl font-headline font-bold">Organisations</h1>
          <p className="text-muted-foreground">
            Provision and manage all DMO accounts on this platform.
          </p>
        </div>
        <ProvisionOrgDialog onOrgProvisioned={loadOrgs} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            All Organisations
          </CardTitle>
          <CardDescription>
            {isLoadingOrgs ? 'Loading...' : `${orgs.length} organisation${orgs.length !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingOrgs ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : orgs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No organisations yet. Click "New Organisation" to provision the first DMO.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug / ID</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-2 py-1 text-xs font-mono">{org.slug || org.id}</code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(org.createdAt)}</TableCell>
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
