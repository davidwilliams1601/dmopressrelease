'use client';

import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, orderBy, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { GenerateInviteDialog } from '@/components/settings/generate-invite-dialog';
import { Link as LinkIcon } from 'lucide-react';
import type { PartnerInvite } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function PartnersPage() {
  const { orgId, role, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const isAdmin = role === 'Admin';

  const invitesRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'invites'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, orgId]);

  const { data: invitesData, isLoading: isInvitesLoading } = useCollection<PartnerInvite>(invitesRef);
  const invites = invitesData || [];

  if (isUserLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">You need admin permissions to manage partner invites.</p>
      </div>
    );
  }

  const formatDate = (date: any) => {
    if (!date) return '-';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-headline font-bold">Partner Invites</h1>
          <p className="text-muted-foreground">
            Generate invite links for partners to join your organization.
          </p>
        </div>
        {orgId && <GenerateInviteDialog orgId={orgId} onInviteCreated={() => {}} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Invite Links
          </CardTitle>
          <CardDescription>
            {invites.length} invite{invites.length !== 1 ? 's' : ''} created
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isInvitesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : invites.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No invite links yet. Generate one to invite partners.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">
                      {invite.label || <span className="text-muted-foreground">No label</span>}
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-2 py-1 text-xs font-mono">
                        {invite.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={invite.status === 'active' ? 'default' : 'secondary'}>
                        {invite.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invite.useCount}{invite.maxUses ? ` / ${invite.maxUses}` : ''}
                    </TableCell>
                    <TableCell>{formatDate(invite.createdAt)}</TableCell>
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
