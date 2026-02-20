'use client';
export const dynamic = 'force-dynamic';

import { useParams, useRouter } from 'next/navigation';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { doc } from 'firebase/firestore';
import type { WebContent } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { WebContentEditForm } from '@/components/content/web-content-edit-form';

export default function ContentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { firestore } = useFirebase();
  const { orgId, isLoading: isUserDataLoading } = useUserData();
  const contentId = params.contentId as string;

  const contentDoc = useDoc<WebContent>(
    useMemoFirebase(() => {
      if (!orgId || !contentId) return null;
      return doc(firestore, 'orgs', orgId, 'webContent', contentId);
    }, [firestore, orgId, contentId])
  );

  if (isUserDataLoading || contentDoc.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Loading...</h1>
        </div>
      </div>
    );
  }

  if (contentDoc.error || !contentDoc.data) {
    return (
      <div className="flex flex-col gap-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard/content')}
          className="w-fit"
        >
          <ArrowLeft />
          Back to Content Hub
        </Button>
        <div>
          <h1 className="text-3xl font-headline font-bold">Content Not Found</h1>
          <p className="text-muted-foreground">
            The content you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        onClick={() => router.push('/dashboard/content')}
        className="w-fit"
      >
        <ArrowLeft />
        Back to Content Hub
      </Button>
      <div>
        <h1 className="text-3xl font-headline font-bold">Edit Web Content</h1>
        <p className="text-muted-foreground">
          Update content, manage sections, and export for your CMS.
        </p>
      </div>
      <WebContentEditForm content={contentDoc.data} orgId={orgId!} />
    </div>
  );
}
