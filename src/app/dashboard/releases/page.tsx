'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import ReleasesTable from '@/components/releases/releases-table';
import { NewReleaseDialog } from '@/components/releases/new-release-dialog';
import { useFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import {
  collection,
  query,
  orderBy,
  getDocs,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Release } from '@/lib/types';

const PAGE_SIZE = 25;

export default function ReleasesPage() {
  const { firestore } = useFirebase();
  const { orgId, isLoading: isUserDataLoading } = useUserData();

  // Pagination state
  const [releases, setReleases] = useState<(Release & { id: string })[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Initial fetch
  useEffect(() => {
    if (!orgId) return;

    let cancelled = false;
    setIsLoading(true);
    setReleases([]);
    setLastDoc(null);
    setHasMore(true);

    const fetchInitial = async () => {
      const q = query(
        collection(firestore, 'orgs', orgId, 'releases'),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );
      const snapshot = await getDocs(q);
      if (cancelled) return;

      const items = snapshot.docs.map((doc) => ({
        ...(doc.data() as Release),
        id: doc.id,
      }));
      setReleases(items);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      setIsLoading(false);
    };

    fetchInitial();
    return () => { cancelled = true; };
  }, [firestore, orgId]);

  const loadMore = useCallback(async () => {
    if (!orgId || !lastDoc || isLoadingMore) return;

    setIsLoadingMore(true);
    const q = query(
      collection(firestore, 'orgs', orgId, 'releases'),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(PAGE_SIZE)
    );
    const snapshot = await getDocs(q);

    const items = snapshot.docs.map((doc) => ({
      ...(doc.data() as Release),
      id: doc.id,
    }));
    setReleases((prev) => [...prev, ...items]);
    setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
    setHasMore(snapshot.docs.length === PAGE_SIZE);
    setIsLoadingMore(false);
  }, [firestore, orgId, lastDoc, isLoadingMore]);

  if (isUserDataLoading || isLoading) {
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

      {releases.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing {releases.length} release{releases.length !== 1 ? 's' : ''}
        </p>
      )}

      <ReleasesTable releases={releases} />

      {releases.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No press releases yet. Click &quot;New Release&quot; to create your first one.
          </p>
        </div>
      )}

      {hasMore && releases.length > 0 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
