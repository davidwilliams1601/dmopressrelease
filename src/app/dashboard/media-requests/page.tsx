'use client';

import { useState, useMemo } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, orderBy, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaRequestsTable } from '@/components/media-requests/media-requests-table';
import { Newspaper } from 'lucide-react';
import type { MediaRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function MediaRequestsPage() {
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const requestsRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'mediaRequests'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, orgId]);

  const { data: allRequestsData, isLoading: isRequestsLoading } =
    useCollection<MediaRequest>(requestsRef);
  const allRequests = allRequestsData || [];

  const filteredRequests = useMemo(() => {
    if (statusFilter === 'all') return allRequests;
    return allRequests.filter((r) => r.status === statusFilter);
  }, [allRequests, statusFilter]);

  if (isUserLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-headline font-bold">Media Requests</h1>
        <p className="text-muted-foreground">
          Story pitch requests submitted by journalists via the public media portal.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            Requests
          </CardTitle>
          <CardDescription>
            {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isRequestsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-12 text-center">
              <Newspaper className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                No media requests yet. Journalists can submit requests at <strong>/media</strong>.
              </p>
            </div>
          ) : (
            <MediaRequestsTable requests={filteredRequests} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
