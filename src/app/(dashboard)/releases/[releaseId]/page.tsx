'use client';

import { useParams, useRouter } from 'next/navigation';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { doc } from 'firebase/firestore';
import type { Release } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ReleaseEditForm } from '@/components/releases/release-edit-form';

export default function ReleaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { firestore } = useFirebase();
  const { orgId, isLoading: isUserDataLoading } = useUserData();
  const releaseId = params.releaseId as string;

  const releaseDoc = useDoc<Release>(
    useMemoFirebase(() => {
      if (!orgId || !releaseId) return null;
      return doc(firestore, 'orgs', orgId, 'releases', releaseId);
    }, [firestore, orgId, releaseId])
  );

  if (isUserDataLoading || releaseDoc.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Loading...</h1>
        </div>
      </div>
    );
  }

  if (releaseDoc.error || !releaseDoc.data) {
    return (
      <div className="flex flex-col gap-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/releases')}
          className="w-fit"
        >
          <ArrowLeft />
          Back to Releases
        </Button>
        <div>
          <h1 className="text-3xl font-headline font-bold">Release Not Found</h1>
          <p className="text-muted-foreground">
            The press release you're looking for doesn't exist or you don't have permission to view it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        onClick={() => router.push('/releases')}
        className="w-fit"
      >
        <ArrowLeft />
        Back to Releases
      </Button>
      <div>
        <h1 className="text-3xl font-headline font-bold">Edit Release</h1>
        <p className="text-muted-foreground">
          Update your press release details and content.
        </p>
      </div>
      <ReleaseEditForm release={releaseDoc.data} orgId={orgId!} />
    </div>
  );
}
