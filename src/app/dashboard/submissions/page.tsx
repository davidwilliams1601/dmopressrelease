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
  doc,
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
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
import { Inbox, Loader2, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { PartnerSubmission, Tag } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default function SubmissionsPage() {
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [scoreFilter, setScoreFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('score');

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

  // Initial fetch — always ordered by createdAt desc from Firestore;
  // client-side sort then applies for score ordering
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

  // Quick accept / archive from table row
  const handleQuickAction = useCallback(async (
    submissionId: string,
    status: 'reviewed' | 'archived'
  ) => {
    if (!orgId) return;
    const ref = doc(firestore, 'orgs', orgId, 'submissions', submissionId);
    await updateDocumentNonBlocking(ref, { status, updatedAt: serverTimestamp() });
    setAllSubmissions((prev) =>
      prev.map((s) => s.id === submissionId ? { ...s, status } : s)
    );
    toast({
      title: status === 'reviewed' ? 'Accepted' : 'Archived',
      description: status === 'reviewed'
        ? 'Submission marked as accepted.'
        : 'Submission moved to archive.',
    });
  }, [firestore, orgId, toast]);

  const filteredAndSorted = useMemo(() => {
    let result = allSubmissions;

    // Status filter — 'pending' shows submitted + reviewed
    if (statusFilter === 'pending') {
      result = result.filter((s) => s.status === 'submitted' || s.status === 'reviewed');
    } else if (statusFilter !== 'all') {
      result = result.filter((s) => s.status === statusFilter);
    }

    // Score filter
    if (scoreFilter === 'high') {
      result = result.filter((s) => (s.aiEditorialScore ?? 0) >= 7);
    } else if (scoreFilter === 'medium') {
      result = result.filter((s) => {
        const sc = s.aiEditorialScore ?? 0;
        return sc >= 4 && sc < 7;
      });
    } else if (scoreFilter === 'low') {
      result = result.filter((s) => (s.aiEditorialScore ?? 0) > 0 && (s.aiEditorialScore ?? 0) < 4);
    }

    // Sort
    if (sortBy === 'score') {
      result = [...result].sort(
        (a, b) => (b.aiEditorialScore ?? 0) - (a.aiEditorialScore ?? 0)
      );
    }
    // 'date' keeps Firestore's existing createdAt desc order

    return result;
  }, [allSubmissions, statusFilter, scoreFilter, sortBy]);

  const selectedSubmissions = allSubmissions.filter((s) => selectedIds.includes(s.id));

  // Summary stats
  const stats = useMemo(() => {
    const pending = allSubmissions.filter(
      (s) => s.status === 'submitted' || s.status === 'reviewed'
    );
    const highScore = pending.filter((s) => (s.aiEditorialScore ?? 0) >= 7);
    const accepted = allSubmissions.filter((s) => s.status === 'reviewed' || s.status === 'used');
    return { pending: pending.length, highScore: highScore.length, accepted: accepted.length };
  }, [allSubmissions]);

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
          <h1 className="text-2xl font-headline font-bold">Story Pitches</h1>
          <p className="text-muted-foreground">
            Review and triage incoming submissions. Sorted by editorial score by default.
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

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Awaiting triage</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-green-600 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-green-700">{stats.highScore}</p>
            <p className="text-xs text-muted-foreground">High score (7+)</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-muted-foreground shrink-0" />
          <div>
            <p className="text-2xl font-bold">{stats.accepted}</p>
            <p className="text-xs text-muted-foreground">Accepted</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Needs triage</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="reviewed">Accepted</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <Select value={scoreFilter} onValueChange={setScoreFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Score" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scores</SelectItem>
            <SelectItem value="high">High (7–10)</SelectItem>
            <SelectItem value="medium">Medium (4–6)</SelectItem>
            <SelectItem value="low">Low (1–3)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Sort: Score ↓</SelectItem>
            <SelectItem value="date">Sort: Newest first</SelectItem>
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
            Showing {filteredAndSorted.length} submission{filteredAndSorted.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSubsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                No submissions match these filters.
              </p>
            </div>
          ) : (
            <>
              <SubmissionsTable
                submissions={filteredAndSorted}
                tags={tags}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onQuickAction={handleQuickAction}
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
