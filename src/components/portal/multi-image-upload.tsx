'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useStorage } from '@/firebase';
import { uploadSubmissionImage, deleteSubmissionImage, validateImageFile } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type UploadedImage = {
  url: string;
  storagePath: string;
  metadata: {
    fileName: string;
    size: number;
    mimeType: string;
    uploadedAt: Date;
  };
};

type MultiImageUploadProps = {
  orgId: string;
  submissionId: string;
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
};

export function MultiImageUpload({
  orgId,
  submissionId,
  images,
  onImagesChange,
  maxImages = 5,
}: MultiImageUploadProps) {
  const storage = useStorage();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const remainingSlots = maxImages - images.length;
      const filesToUpload = acceptedFiles.slice(0, remainingSlots);

      if (filesToUpload.length < acceptedFiles.length) {
        toast({
          title: 'Too many files',
          description: `Maximum ${maxImages} images allowed. Only uploading ${filesToUpload.length}.`,
        });
      }

      // Validate all files first
      for (const file of filesToUpload) {
        const validation = validateImageFile(file);
        if (!validation.valid) {
          toast({
            title: 'Invalid file',
            description: `${file.name}: ${validation.error}`,
            variant: 'destructive',
          });
          return;
        }
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        const newImages: UploadedImage[] = [];
        const startIndex = images.length;

        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];
          setUploadProgress(((i + 0.5) / filesToUpload.length) * 100);

          const { storagePath, downloadUrl } = await uploadSubmissionImage(
            storage,
            orgId,
            submissionId,
            file,
            startIndex + i
          );

          newImages.push({
            url: downloadUrl,
            storagePath,
            metadata: {
              fileName: file.name,
              size: file.size,
              mimeType: file.type,
              uploadedAt: new Date(),
            },
          });

          setUploadProgress(((i + 1) / filesToUpload.length) * 100);
        }

        onImagesChange([...images, ...newImages]);

        toast({
          title: 'Images uploaded',
          description: `${newImages.length} image${newImages.length !== 1 ? 's' : ''} uploaded successfully.`,
        });
      } catch (error) {
        console.error('Error uploading images:', error);
        toast({
          title: 'Upload failed',
          description: error instanceof Error ? error.message : 'Failed to upload images',
          variant: 'destructive',
        });
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [storage, orgId, submissionId, images, maxImages, onImagesChange, toast]
  );

  const handleDelete = async (index: number) => {
    const image = images[index];
    try {
      await deleteSubmissionImage(storage, image.storagePath);
      const updated = images.filter((_, i) => i !== index);
      onImagesChange(updated);
      toast({ title: 'Image removed' });
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: 'Delete failed',
        description: 'Failed to delete image',
        variant: 'destructive',
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    maxFiles: maxImages - images.length,
    multiple: true,
    disabled: isUploading || images.length >= maxImages,
  });

  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {images.map((image, i) => (
            <div key={image.storagePath} className="relative rounded-lg border overflow-hidden">
              <img
                src={image.url}
                alt={image.metadata.fileName}
                className="w-full aspect-video object-cover"
              />
              <div className="absolute top-1 right-1">
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleDelete(i)}
                  disabled={isUploading}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length < maxImages && (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
            transition-colors duration-200
            ${isDragActive
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
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            {isUploading ? (
              <div className="w-full max-w-xs space-y-2">
                <p className="text-sm text-muted-foreground">Uploading...</p>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            ) : (
              <>
                <p className="text-sm font-medium">
                  {isDragActive ? 'Drop images here' : 'Drag and drop images here'}
                </p>
                <p className="text-xs text-muted-foreground">
                  or click to browse (max {maxImages} images, 10MB each)
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
