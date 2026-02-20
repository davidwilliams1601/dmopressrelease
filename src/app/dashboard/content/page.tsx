'use client';
export const dynamic = 'force-dynamic';

import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { collection, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe } from 'lucide-react';
import { WebContentTable } from '@/components/content/web-content-table';
import type { WebContent } from '@/lib/types';

export default function ContentHubPage() {
  const { firestore } = useFirebase();
  const { orgId, isLoading: isUserDataLoading } = useUserData();

  const contentQuery = useCollection<WebContent>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'webContent'),
        orderBy('createdAt', 'desc')
      );
    }, [firestore, orgId])
  );

  const items = contentQuery.data || [];

  if (isUserDataLoading || contentQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Content Hub</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-headline font-bold">Content Hub</h1>
        <p className="text-muted-foreground">
          Web-optimised content generated from partner submissions. Use the export options to paste into any CMS.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Web Content
          </CardTitle>
          <CardDescription>
            {items.length} piece{items.length !== 1 ? 's' : ''} of content
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <Globe className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                No web content yet. Select submissions and click &ldquo;Generate Web Content&rdquo; to get started.
              </p>
            </div>
          ) : (
            <WebContentTable items={items} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
