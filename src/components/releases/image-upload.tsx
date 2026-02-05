'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useStorage } from '@/firebase';
import { uploadReleaseImage, deleteReleaseImage, validateImageFile } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ImageUploadProps = {
  orgId: string;
  releaseId: string;
  currentImageUrl?: string;
  currentStoragePath?: string;
  onUploadComplete: (imageUrl: string, storagePath: string, metadata: {
    fileName: string;
    size: number;
    mimeType: string;
    uploadedAt: Date;
  }) => void;
  onDelete: () => void;
};

export function ImageUpload({
  orgId,
  releaseId,
  currentImageUrl,
  currentStoragePath,
  onUploadComplete,
  onDelete,
}: ImageUploadProps) {
  const storage = useStorage();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(currentImageUrl);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];

      // Validate the file
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast({
          title: 'Invalid file',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        // If there's an existing image, delete it first
        if (currentStoragePath) {
          await deleteReleaseImage(storage, currentStoragePath);
        }

        // Simulate progress (Firebase upload doesn't provide real-time progress for small files)
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 10, 90));
        }, 100);

        // Upload the new image
        const { storagePath, downloadUrl } = await uploadReleaseImage(
          storage,
          orgId,
          releaseId,
          file
        );

        clearInterval(progressInterval);
        setUploadProgress(100);

        // Update preview
        setPreviewUrl(downloadUrl);

        // Call the completion callback
        onUploadComplete(downloadUrl, storagePath, {
          fileName: file.name,
          size: file.size,
          mimeType: file.type,
          uploadedAt: new Date(),
        });

        toast({
          title: 'Image uploaded',
          description: 'Your image has been uploaded successfully.',
        });
      } catch (error) {
        console.error('Error uploading image:', error);
        toast({
          title: 'Upload failed',
          description: error instanceof Error ? error.message : 'Failed to upload image',
          variant: 'destructive',
        });
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [storage, orgId, releaseId, currentStoragePath, onUploadComplete, toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    maxFiles: 1,
    multiple: false,
  });

  const handleDelete = async () => {
    if (!currentStoragePath) return;

    try {
      await deleteReleaseImage(storage, currentStoragePath);
      setPreviewUrl(undefined);
      onDelete();

      toast({
        title: 'Image deleted',
        description: 'Your image has been removed.',
      });
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: 'Delete failed',
        description: 'Failed to delete image',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      {previewUrl ? (
        // Image Preview
        <div className="relative rounded-lg border border-border overflow-hidden">
          <img
            src={previewUrl}
            alt="Release image"
            className="w-full h-auto max-h-[400px] object-contain bg-muted"
          />
          <div className="absolute top-2 right-2">
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={handleDelete}
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        // Dropzone
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-colors duration-200
            ${isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }
            ${isUploading ? 'pointer-events-none opacity-50' : ''}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-muted p-4">
              {isUploading ? (
                <Upload className="h-8 w-8 text-muted-foreground animate-pulse" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            {isUploading ? (
              <div className="w-full max-w-xs space-y-2">
                <p className="text-sm text-muted-foreground">Uploading...</p>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium">
                    {isDragActive ? 'Drop your image here' : 'Drag and drop an image here'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or click to browse (max 10MB)
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Supports: JPG, PNG, GIF, WEBP
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
