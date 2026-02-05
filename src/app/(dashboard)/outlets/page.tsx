'use client';
export const dynamic = 'force-dynamic';

import { Card, CardContent } from '@/components/ui/card';
import { NewOutletListDialog } from '@/components/outlets/new-outlet-list-dialog';
import { OutletListsTable } from '@/components/outlets/outlet-lists-table';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { collection, query, orderBy } from 'firebase/firestore';
import type { OutletList } from '@/lib/types';

export default function OutletsPage() {
  const { firestore } = useFirebase();
  const { orgId, isLoading: isUserDataLoading } = useUserData();

  const outletListsQuery = useCollection<OutletList>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'outletLists'),
        orderBy('createdAt', 'desc')
      );
    }, [firestore, orgId])
  );

  const outletLists = outletListsQuery.data || [];

  if (isUserDataLoading || outletListsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Outlet Lists</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Outlet Lists</h1>
          <p className="text-muted-foreground">
            Manage your media contact lists for distribution.
          </p>
        </div>
        {orgId && <NewOutletListDialog orgId={orgId} />}
      </div>

      {outletLists.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <OutletListsTable outletLists={outletLists} />
          </CardContent>
        </Card>
      ) : (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground">
              No outlet lists yet. Click "New List" to create your first one.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

