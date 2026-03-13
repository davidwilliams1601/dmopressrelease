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
import { SendQuarterlyReportDialog } from '@/components/settings/send-quarterly-report-dialog';
import { SendPartnerEmailDialog } from '@/components/settings/send-partner-email-dialog';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { Link as LinkIcon, Users, Mail, Copy, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { PartnerInvite, User } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function PartnersPage() {
  const { orgId, role, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const { config: verticalConfig } = useVerticalConfig(orgId);
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
        <div className="flex items-center gap-2">
          {orgId && partnerAccounts.length > 0 && (
            <>
              <SendPartnerEmailDialog
                orgId={orgId}
                recipients={partnerAccounts.map((p) => ({ id: p.id, name: p.name, email: p.email, businessCategories: p.businessCategories }))}
                availableCategories={verticalConfig.partnerCategories}
                trigger={
                  <Button variant="outline">
                    <Send className="h-4 w-4" />
                    Email all partners
                  </Button>
                }
              />
              <SendQuarterlyReportDialog orgId={orgId} partnerCount={partnerAccounts.length} />
            </>
          )}
          {orgId && <GenerateInviteDialog orgId={orgId} onInviteCreated={() => {}} />}
        </div>
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
                  <TableHead className="text-right">Link</TableHead>
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
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const link = `${window.location.origin}/partner-signup?code=${invite.code}`;
                          navigator.clipboard.writeText(link);
                          toast({ title: 'Copied!', description: 'Invite link copied to clipboard.' });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Copy link
                      </Button>
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
                  <TableHead>Categories</TableHead>
                  <TableHead>Invited via</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partnerAccounts.map((partner) => {
                  const inviteLabel = partner.inviteId
                    ? invites.find((inv) => inv.id === partner.inviteId)?.label
                    : undefined;
                  return (
                  <TableRow key={partner.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                          {partner.initials || partner.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium">{partner.name}</span>
                          {partner.businessDescription && (
                            <p className="text-xs text-muted-foreground max-w-[220px] truncate">{partner.businessDescription}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {partner.businessCategories && partner.businessCategories.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {partner.businessCategories.map((cat) => (
                            <Badge key={cat} variant="secondary" className="text-xs">{cat}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {inviteLabel ? (
                        <span className="text-sm">{inviteLabel}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {partner.createdAt ? format(toDate(partner.createdAt), 'dd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {orgId && (
                        <SendPartnerEmailDialog
                          orgId={orgId}
                          recipients={[{ id: partner.id, name: partner.name, email: partner.email }]}
                          trigger={
                            <Button variant="ghost" size="sm">
                              <Mail className="h-4 w-4" />
                              Email
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
