'use client';

import { useState } from 'react';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Images, Inbox } from 'lucide-react';
import type { PartnerSubmission } from '@/lib/types';

type PickedImage = {
  url: string;
  storagePath: string;
  metadata: {
    fileName: string;
    size: number;
    mimeType: string;
    uploadedAt: Date | any;
  };
};

type SubmissionImagePickerProps = {
  orgId: string;
  onPick: (image: PickedImage) => void;
};

export function SubmissionImagePicker({ orgId, onPick }: SubmissionImagePickerProps) {
  const [open, setOpen] = useState(false);
  const { firestore } = useFirebase();

  const submissionsRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'submissions'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, orgId]);

  const { data: submissions, isLoading } = useCollection<PartnerSubmission>(submissionsRef);

  // Flatten all images from all submissions into a single list
  const allImages = (submissions || []).flatMap((sub) =>
    (sub.imageUrls || []).map((url, i) => ({
      url,
      storagePath: sub.imageStoragePaths?.[i] ?? '',
      metadata: sub.imageMetadata?.[i] ?? {
        fileName: `image-${i}`,
        size: 0,
        mimeType: 'image/jpeg',
        uploadedAt: sub.createdAt,
      },
      partnerName: sub.partnerName,
      submissionTitle: sub.title,
    }))
  );

  const handlePick = (image: (typeof allImages)[number]) => {
    onPick({
      url: image.url,
      storagePath: image.storagePath,
      metadata: image.metadata,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Images className="h-4 w-4" />
          Choose from submissions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose a submission image</DialogTitle>
          <DialogDescription>
            Select an image uploaded by a partner in their submission.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video w-full rounded-lg" />
              ))}
            </div>
          ) : allImages.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                No images found in partner submissions.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {allImages.map((image, i) => (
                <button
                  key={`${image.storagePath}-${i}`}
                  type="button"
                  onClick={() => handlePick(image)}
                  className="group relative overflow-hidden rounded-lg border bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <img
                    src={image.url}
                    alt={image.metadata.fileName}
                    className="aspect-video w-full object-cover transition-opacity group-hover:opacity-80"
                  />
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{image.partnerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{image.submissionTitle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
