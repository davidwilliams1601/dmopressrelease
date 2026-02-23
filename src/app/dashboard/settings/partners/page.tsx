'use client';

import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, orderBy, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Link as LinkIcon, Users, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { toDate } from '@/lib/utils';
import type { PartnerInvite, User } from '@/lib/types';

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

  const usersRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'users'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, orgId]);

  const { data: invitesData, isLoading: isInvitesLoading } = useCollection<PartnerInvite>(invitesRef);
  const { data: usersData, isLoading: isUsersLoading } = useCollection<User>(usersRef);
  const invites = invitesData || [];
  const partnerAccounts = (usersData || []).filter((u) => u.role === 'Partner');

  if (isUserLoading || isUsersLoading) {
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
                    <TableCell>
                      {invite.createdAt ? format(toDate(invite.createdAt), 'dd MMM yyyy') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Partner Accounts
          </CardTitle>
          <CardDescription>
            {partnerAccounts.length} partner{partnerAccounts.length !== 1 ? 's' : ''} with active accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {partnerAccounts.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No partner accounts yet. Share an invite link above for partners to sign up.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partnerAccounts.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                          {partner.initials || partner.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium">{partner.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{partner.email}</TableCell>
                    <TableCell>
                      {partner.createdAt ? format(toDate(partner.createdAt), 'dd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`mailto:${partner.email}`}>
                          <Mail className="h-4 w-4" />
                          Email
                        </a>
                      </Button>
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
