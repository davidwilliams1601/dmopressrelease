'use client';
export const dynamic = 'force-dynamic';

import { useParams, useRouter } from 'next/navigation';
import { useFirebase, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import type { OutletList, Recipient } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { NewRecipientDialog } from '@/components/outlets/new-recipient-dialog';
import { RecipientsTable } from '@/components/outlets/recipients-table';

export default function OutletListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { firestore } = useFirebase();
  const { orgId, isLoading: isUserDataLoading } = useUserData();
  const listId = params.listId as string;

  const listDoc = useDoc<OutletList>(
    useMemoFirebase(() => {
      if (!orgId || !listId) return null;
      return doc(firestore, 'orgs', orgId, 'outletLists', listId);
    }, [firestore, orgId, listId])
  );

  const recipientsQuery = useCollection<Recipient>(
    useMemoFirebase(() => {
      if (!orgId || !listId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'outletLists', listId, 'recipients'),
        orderBy('createdAt', 'desc')
      );
    }, [firestore, orgId, listId])
  );

  const recipients = recipientsQuery.data || [];

  if (isUserDataLoading || listDoc.isLoading || recipientsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Loading...</h1>
        </div>
      </div>
    );
  }

  if (listDoc.error || !listDoc.data) {
    return (
      <div className="flex flex-col gap-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard/outlets')}
          className="w-fit"
        >
          <ArrowLeft />
          Back to Outlet Lists
        </Button>
        <div>
          <h1 className="text-3xl font-headline font-bold">List Not Found</h1>
          <p className="text-muted-foreground">
            The outlet list you're looking for doesn't exist or you don't have permission to view it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        onClick={() => router.push('/dashboard/outlets')}
        className="w-fit"
      >
        <ArrowLeft />
        Back to Outlet Lists
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">{listDoc.data.name}</h1>
          <p className="text-muted-foreground">
            {listDoc.data.description || 'No description'}
          </p>
        </div>
        {orgId && listId && (
          <NewRecipientDialog orgId={orgId} listId={listId} />
        )}
      </div>

      {recipients.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <RecipientsTable recipients={recipients} orgId={orgId!} listId={listId} />
          </CardContent>
        </Card>
      ) : (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground">
              No recipients yet. Click "Add Recipient" to add your first contact.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
