'use client';

import { useState, useCallback } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { useStorage } from '@/firebase';
import {
  uploadSubmissionVideo,
  deleteSubmissionVideo,
  validateVideoFile,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
} from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Video as VideoIcon, X, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export type UploadedVideo = {
  url: string;
  storagePath: string;
  metadata: {
    fileName: string;
    size: number;
    mimeType: string;
    durationSeconds: number;
    uploadedAt: Date;
  };
};

type VideoUploadProps = {
  orgId: string;
  submissionId: string;
  video: UploadedVideo | null;
  onVideoChange: (video: UploadedVideo | null) => void;
};

const MAX_MB = Math.round(MAX_VIDEO_BYTES / (1024 * 1024));

export function VideoUpload({
  orgId,
  submissionId,
  video,
  onVideoChange,
}: VideoUploadProps) {
  const storage = useStorage();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // Validation is async (it decodes metadata to read duration), so it runs
      // before we show any progress UI — a rejected file should never look like
      // it started uploading.
      const validation = await validateVideoFile(file);
      if (!validation.valid) {
        toast({
          title: 'Video not accepted',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }

      const durationSeconds = validation.durationSeconds ?? 0;

      setIsUploading(true);
      setUploadProgress(0);

      try {
        const { storagePath, downloadUrl } = await uploadSubmissionVideo(
          storage,
          orgId,
          submissionId,
          file,
          setUploadProgress
        );

        onVideoChange({
          url: downloadUrl,
          storagePath,
          metadata: {
            fileName: file.name,
            size: file.size,
            mimeType: file.type,
            durationSeconds,
            uploadedAt: new Date(),
          },
        });

        toast({ title: 'Video uploaded' });
      } catch (error) {
        console.error('Error uploading video:', error);
        toast({
          title: 'Upload failed',
          description:
            error instanceof Error ? error.message : 'Failed to upload video',
          variant: 'destructive',
        });
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [storage, orgId, submissionId, onVideoChange, toast]
  );

  const handleRemove = async () => {
    if (!video) return;
    try {
      await deleteSubmissionVideo(storage, video.storagePath);
      onVideoChange(null);
      toast({ title: 'Video removed' });
    } catch (error) {
      console.error('Error deleting video:', error);
      toast({
        title: 'Delete failed',
        description: 'Failed to remove video',
        variant: 'destructive',
      });
    }
  };

  // Dropzone filters non-matching files out before onDrop ever runs, so without this
  // an iPhone .mov would be silently swallowed — nothing uploads, no error, the user
  // just concludes the feature is broken. That is the single most likely first
  // failure for a school, so it gets an explicit message telling them how to fix it.
  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      const rejection = rejections[0];
      if (!rejection) return;

      const tooLarge = rejection.errors.some((e) => e.code === 'file-too-large');
      const tooMany = rejection.errors.some((e) => e.code === 'too-many-files');

      toast({
        title: 'Video not accepted',
        description: tooMany
          ? 'Please add one video at a time.'
          : tooLarge
            ? `Video must be smaller than ${MAX_MB}MB.`
            : 'Video must be an MP4. If this was filmed on an iPhone, open Settings \u2192 Camera \u2192 Formats and choose "Most Compatible", or export the clip as MP4 before uploading.',
        variant: 'destructive',
      });
    },
    [toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: { 'video/mp4': ['.mp4'] },
    maxSize: MAX_VIDEO_BYTES,
    maxFiles: 1,
    multiple: false,
    disabled: isUploading || !!video,
  });

  if (video) {
    return (
      <div className="relative rounded-lg border overflow-hidden">
        <video
          src={video.url}
          controls
          preload="metadata"
          className="w-full aspect-video bg-black"
        />
        <div className="flex items-center justify-between gap-2 p-2">
          <p className="text-xs text-muted-foreground truncate">
            {video.metadata.fileName}
            {video.metadata.durationSeconds > 0 &&
              ` \u00b7 ${Math.round(video.metadata.durationSeconds)}s`}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isUploading}
          >
            <X className="h-4 w-4 mr-1" />
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
        transition-colors duration-200
        ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
        }
        ${isUploading ? 'pointer-events-none opacity-50' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-full bg-muted p-3">
          {isUploading ? (
            <Upload className="h-6 w-6 text-muted-foreground animate-pulse" />
          ) : (
            <VideoIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        {isUploading ? (
          <div className="w-full max-w-xs space-y-2">
            <p className="text-sm text-muted-foreground">
              Uploading… {Math.round(uploadProgress)}%
            </p>
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Keep this page open until the upload finishes.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop video here' : 'Add a short video (optional)'}
            </p>
            <p className="text-xs text-muted-foreground">
              MP4 only, up to {MAX_VIDEO_DURATION_SECONDS} seconds and {MAX_MB}MB
            </p>
          </>
        )}
      </div>
    </div>
  );
}
