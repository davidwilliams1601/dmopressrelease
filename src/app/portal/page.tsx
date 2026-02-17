'use client';

import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, orderBy, query, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Button } from '@/components/ui/button';
import { PenSquare, Inbox } from 'lucide-react';
import Link from 'next/link';
import type { PartnerSubmission } from '@/lib/types';

export const dynamic = 'force-dynamic';

const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  submitted: 'default',
  reviewed: 'secondary',
  used: 'outline',
  archived: 'outline',
};

export default function PortalHomePage() {
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { firestore, user } = useFirebase();

  const submissionsRef = useMemoFirebase(() => {
    if (!orgId || !user) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'submissions'),
      where('partnerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, orgId, user]);

  const { data: submissionsData, isLoading: isSubmissionsLoading } =
    useCollection<PartnerSubmission>(submissionsRef);
  const submissions = submissionsData || [];

  if (isUserLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
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
          <h1 className="text-2xl font-headline font-bold">My Submissions</h1>
          <p className="text-muted-foreground">
            View and manage your content submissions.
          </p>
        </div>
        <Button asChild>
          <Link href="/portal/submit">
            <PenSquare />
            New Submission
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Submissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isSubmissionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                You haven&apos;t submitted any content yet.
              </p>
              <Button asChild className="mt-4">
                <Link href="/portal/submit">
                  <PenSquare />
                  Create Your First Submission
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Themes</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <Link
                        href={`/portal/submissions/${sub.id}`}
                        className="font-medium hover:underline"
                      >
                        {sub.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[sub.status] || 'secondary'}>
                        {sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sub.aiThemes && sub.aiThemes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {sub.aiThemes.slice(0, 3).map((theme) => (
                            <Badge key={theme} variant="outline" className="text-xs">
                              {theme}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Analyzing...</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(sub.createdAt)}</TableCell>
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
