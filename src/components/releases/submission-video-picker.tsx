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
import { Video, Inbox } from 'lucide-react';
import type { PartnerSubmission } from '@/lib/types';

export type PickedVideo = {
  url: string;
  storagePath: string;
  submissionId: string;
  metadata: {
    fileName: string;
    size: number;
    mimeType: string;
    durationSeconds?: number;
    uploadedAt: Date | any;
  };
};

type SubmissionVideoPickerProps = {
  orgId: string;
  onPick: (video: PickedVideo) => void;
};

export function SubmissionVideoPicker({ orgId, onPick }: SubmissionVideoPickerProps) {
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

  // A submission carries at most one video, so this is a filter rather than a flatten.
  const allVideos = (submissions || [])
    .filter((sub) => !!sub.videoUrl)
    .map((sub) => ({
      url: sub.videoUrl as string,
      storagePath: sub.videoStoragePath ?? '',
      submissionId: sub.id,
      // Fallback must carry every field the real metadata does, otherwise the union
      // narrows and durationSeconds disappears from the picked type.
      metadata: sub.videoMetadata ?? {
        fileName: 'video.mp4',
        size: 0,
        mimeType: 'video/mp4',
        durationSeconds: 0,
        uploadedAt: sub.createdAt,
      },
      partnerName: sub.partnerName,
      submissionTitle: sub.title,
      transcript: sub.videoTranscript,
    }));

  const handlePick = (video: (typeof allVideos)[number]) => {
    onPick({
      url: video.url,
      storagePath: video.storagePath,
      submissionId: video.submissionId,
      metadata: video.metadata,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Video className="h-4 w-4" />
          Choose from submissions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a video</DialogTitle>
          <DialogDescription>
            Videos submitted by your partners. The release will link to the clip
            rather than embed it, so journalists can download and use it.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="aspect-video w-full rounded-lg" />
            ))}
          </div>
        ) : allVideos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No videos yet</p>
            <p className="text-xs text-muted-foreground">
              Partner submissions with a video attached will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {allVideos.map((video) => (
              <div key={video.submissionId} className="rounded-lg border overflow-hidden">
                <video
                  src={video.url}
                  controls
                  preload="metadata"
                  className="w-full aspect-video bg-black"
                />
                <div className="p-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium truncate">
                      {video.submissionTitle || 'Untitled submission'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {video.partnerName}
                      {video.metadata.durationSeconds
                        ? ` \u00b7 ${Math.round(video.metadata.durationSeconds)}s`
                        : ''}
                    </p>
                  </div>
                  {video.transcript ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {video.transcript}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={() => handlePick(video)}
                  >
                    Use this video
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
