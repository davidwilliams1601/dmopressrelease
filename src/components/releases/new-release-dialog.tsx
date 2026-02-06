'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PlusCircle } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDocumentNonBlocking } from '@/firebase';
import { collection, serverTimestamp, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { ImageUpload } from './image-upload';

type NewReleaseDialogProps = {
  orgId: string;
};

export function NewReleaseDialog({ orgId }: NewReleaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // Generate a release ID upfront for image upload
  const [releaseId] = useState(() => doc(collection(firestore, 'orgs', orgId, 'releases')).id);
  
  // Image state
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [imageStoragePath, setImageStoragePath] = useState<string | undefined>();
  const [imageMetadata, setImageMetadata] = useState<{
    fileName: string;
    size: number;
    mimeType: string;
    uploadedAt: Date;
  } | undefined>();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const headline = formData.get('headline') as string;

    try {
      const releasesRef = collection(firestore, 'orgs', orgId, 'releases');

      // Create slug from headline
      const slug = headline
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Use the pre-generated ID
      const releaseRef = doc(releasesRef, releaseId);

      await addDocumentNonBlocking(releaseRef, {
        orgId,
        headline,
        slug,
        campaignType: formData.get('campaignType') as string,
        targetMarket: formData.get('targetMarket') as string,
        audience: formData.get('audience') as string,
        bodyCopy: formData.get('bodyCopy') as string || '',
        status: 'Draft',
        createdAt: serverTimestamp(),
        sends: 0,
        opens: 0,
        clicks: 0,
        imageUrl: imageUrl || null,
        imageStoragePath: imageStoragePath || null,
        imageMetadata: imageMetadata || null,
      });

      toast({
        title: 'Press release created',
        description: 'Your press release has been created successfully.',
      });

      setOpen(false);
      // Reset form and image state
      (e.target as HTMLFormElement).reset();
      setImageUrl(undefined);
      setImageStoragePath(undefined);
      setImageMetadata(undefined);
    } catch (error) {
      console.error('Error creating press release:', error);
      toast({
        title: 'Error creating press release',
        description: 'There was a problem creating your press release. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = (
    url: string,
    storagePath: string,
    metadata: { fileName: string; size: number; mimeType: string; uploadedAt: Date }
  ) => {
    setImageUrl(url);
    setImageStoragePath(storagePath);
    setImageMetadata(metadata);
  };

  const handleImageDelete = () => {
    setImageUrl(undefined);
    setImageStoragePath(undefined);
    setImageMetadata(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle />
          <span>New Release</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Press Release</DialogTitle>
          <DialogDescription>
            Fill in the details for your new press release. You can edit it later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="headline">Headline *</Label>
              <Input
                id="headline"
                name="headline"
                placeholder="e.g., New Culinary Trail Launches in Canterbury"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="campaignType">Campaign Type *</Label>
              <Select name="campaignType" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Seasonal">Seasonal</SelectItem>
                  <SelectItem value="Product Launch">Product Launch</SelectItem>
                  <SelectItem value="Event">Event</SelectItem>
                  <SelectItem value="Partnership">Partnership</SelectItem>
                  <SelectItem value="Award">Award</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="targetMarket">Target Market *</Label>
              <Input
                id="targetMarket"
                name="targetMarket"
                placeholder="e.g., UK, International, France, Belgium"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="audience">Audience *</Label>
              <Select name="audience" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select audience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Consumer">Consumer</SelectItem>
                  <SelectItem value="Travel Trade">Travel Trade</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Featured Image (Optional)</Label>
              <ImageUpload
                orgId={orgId}
                releaseId={releaseId}
                currentImageUrl={imageUrl}
                currentStoragePath={imageStoragePath}
                onUploadComplete={handleImageUpload}
                onDelete={handleImageDelete}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bodyCopy">Body Copy</Label>
              <Textarea
                id="bodyCopy"
                name="bodyCopy"
                placeholder="Write your press release content here..."
                className="min-h-[200px]"
              />
              <p className="text-sm text-muted-foreground">
                Optional: Add your press release content now or later.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Release'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
