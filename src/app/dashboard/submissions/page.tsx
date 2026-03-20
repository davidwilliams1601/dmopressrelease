'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import {
  collection,
  orderBy,
  query,
  getDocs,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { SubmissionsTable } from '@/components/submissions/submissions-table';
import { GenerateDraftDialog } from '@/components/submissions/generate-draft-dialog';
import { GenerateWebContentDialog } from '@/components/submissions/generate-web-content-dialog';
import { Inbox, Loader2 } from 'lucide-react';
import type { PartnerSubmission, Tag } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default function SubmissionsPage() {
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  // Pagination state
  const [allSubmissions, setAllSubmissions] = useState<(PartnerSubmission & { id: string })[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isSubsLoading, setIsSubsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Tags still use real-time listener (small collection)
  const tagsRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'tags'),
      orderBy('name', 'asc')
    );
  }, [firestore, orgId]);

  const { data: tagsData } = useCollection<Tag>(tagsRef);
  const tags = tagsData || [];

  // Initial fetch
  useEffect(() => {
    if (!orgId) return;

    let cancelled = false;
    setIsSubsLoading(true);
    setAllSubmissions([]);
    setLastDoc(null);
    setHasMore(true);

    const fetchInitial = async () => {
      const q = query(
        collection(firestore, 'orgs', orgId, 'submissions'),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );
      const snapshot = await getDocs(q);
      if (cancelled) return;

      const items = snapshot.docs.map((doc) => ({
        ...(doc.data() as PartnerSubmission),
        id: doc.id,
      }));
      setAllSubmissions(items);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      setIsSubsLoading(false);
    };

    fetchInitial();
    return () => { cancelled = true; };
  }, [firestore, orgId]);

  const loadMore = useCallback(async () => {
    if (!orgId || !lastDoc || isLoadingMore) return;

    setIsLoadingMore(true);
    const q = query(
      collection(firestore, 'orgs', orgId, 'submissions'),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(PAGE_SIZE)
    );
    const snapshot = await getDocs(q);

    const items = snapshot.docs.map((doc) => ({
      ...(doc.data() as PartnerSubmission),
      id: doc.id,
    }));
    setAllSubmissions((prev) => [...prev, ...items]);
    setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
    setHasMore(snapshot.docs.length === PAGE_SIZE);
    setIsLoadingMore(false);
  }, [firestore, orgId, lastDoc, isLoadingMore]);

  const filteredSubmissions = useMemo(() => {
    let result = allSubmissions;
    if (statusFilter !== 'all') {
      result = result.filter((s) => s.status === statusFilter);
    }
    if (tagFilter !== 'all') {
      result = result.filter((s) => s.tagIds?.includes(tagFilter));
    }
    return result;
  }, [allSubmissions, statusFilter, tagFilter]);

  const selectedSubmissions = allSubmissions.filter((s) => selectedIds.includes(s.id));

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-headline font-bold">Partner Submissions</h1>
          <p className="text-muted-foreground">
            Review content submitted by partners and generate press release drafts.
          </p>
        </div>
        {selectedIds.length > 0 && orgId && (
          <div className="flex items-center gap-2">
            <GenerateWebContentDialog
              orgId={orgId}
              submissions={selectedSubmissions}
              tags={tags}
              onContentCreated={() => setSelectedIds([])}
            />
            <GenerateDraftDialog
              orgId={orgId}
              submissions={selectedSubmissions}
              tags={tags}
              onDraftCreated={() => setSelectedIds([])}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedIds.length > 0 && (
          <Badge variant="secondary">
            {selectedIds.length} selected
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Submissions
          </CardTitle>
          <CardDescription>
            Showing {filteredSubmissions.length} submission{filteredSubmissions.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSubsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                No submissions yet. Partners will appear here once they submit content.
              </p>
            </div>
          ) : (
            <>
              <SubmissionsTable
                submissions={filteredSubmissions}
                tags={tags}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
              {hasMore && (
                <div className="mt-4 flex justify-center">
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
