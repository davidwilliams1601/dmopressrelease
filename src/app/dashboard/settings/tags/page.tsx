'use client';

import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, orderBy, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TagManager } from '@/components/settings/tag-manager';
import { TagIcon } from 'lucide-react';
import type { Tag } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function TagsPage() {
  const { orgId, role, isLoading: isUserLoading, userData } = useUserData();
  const { firestore } = useFirebase();
  const isAdmin = role === 'Admin';

  const tagsRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'tags'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, orgId]);

  const { data: tagsData, isLoading: isTagsLoading } = useCollection<Tag>(tagsRef);
  const tags = tagsData || [];

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
        <p className="text-muted-foreground">You need admin permissions to manage tags.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-headline font-bold">Content Tags</h1>
        <p className="text-muted-foreground">
          Create tags that partners can use to categorize their submissions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagIcon className="h-5 w-5" />
            Tags
          </CardTitle>
          <CardDescription>
            {tags.length} tag{tags.length !== 1 ? 's' : ''} created
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isTagsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <TagManager orgId={orgId!} userId={userData?.id || ''} tags={tags} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
