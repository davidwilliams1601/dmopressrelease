'use client';

import { useState, useMemo } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, orderBy, query } from 'firebase/firestore';
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
import { SubmissionsTable } from '@/components/submissions/submissions-table';
import { GenerateDraftDialog } from '@/components/submissions/generate-draft-dialog';
import { GenerateWebContentDialog } from '@/components/submissions/generate-web-content-dialog';
import { Inbox } from 'lucide-react';
import type { PartnerSubmission, Tag } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function SubmissionsPage() {
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  const submissionsRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'submissions'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, orgId]);

  const tagsRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'tags'),
      orderBy('name', 'asc')
    );
  }, [firestore, orgId]);

  const { data: allSubmissionsData, isLoading: isSubsLoading } =
    useCollection<PartnerSubmission>(submissionsRef);
  const { data: tagsData } = useCollection<Tag>(tagsRef);
  const allSubmissions = allSubmissionsData || [];
  const tags = tagsData || [];

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
            {filteredSubmissions.length} submission{filteredSubmissions.length !== 1 ? 's' : ''}
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
            <SubmissionsTable
              submissions={filteredSubmissions}
              tags={tags}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
