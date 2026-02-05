'use client';

import ReleasesTable from '@/components/releases/releases-table';
import { NewReleaseDialog } from '@/components/releases/new-release-dialog';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { collection, query, orderBy } from 'firebase/firestore';
import type { Release } from '@/lib/types';

export default function ReleasesPage() {
  const { firestore } = useFirebase();
  const { orgId, isLoading: isUserDataLoading } = useUserData();

  // Fetch all releases for this organization
  const releasesQuery = useCollection<Release>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'releases'),
        orderBy('createdAt', 'desc')
      );
    }, [firestore, orgId])
  );

  const releases = releasesQuery.data || [];

  if (isUserDataLoading || releasesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Press Releases</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Press Releases</h1>
          <p className="text-muted-foreground">
            Manage your campaigns and communications.
          </p>
        </div>
        {orgId && <NewReleaseDialog orgId={orgId} />}
      </div>
      <ReleasesTable releases={releases} />
      {releases.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No press releases yet. Click "New Release" to create your first one.
          </p>
        </div>
      )}
    </div>
  );
}
