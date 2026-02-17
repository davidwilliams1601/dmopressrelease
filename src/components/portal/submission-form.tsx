'use client';

import { useState } from 'react';
import { useFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { useRouter } from 'next/navigation';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagSelector } from '@/components/shared/tag-selector';
import { MultiImageUpload } from '@/components/portal/multi-image-upload';
import { useToast } from '@/hooks/use-toast';
import { Send } from 'lucide-react';

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

export function SubmissionForm() {
  const { firestore, user } = useFirebase();
  const { orgId, name: userName, email: userEmail } = useUserData();
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [bodyCopy, setBodyCopy] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-generate submission ID for image uploads
  const [submissionId] = useState(() => {
    if (!orgId) return '';
    return doc(collection(firestore, 'orgs', orgId || '_', 'submissions')).id;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orgId || !user) return;

    if (tagIds.length === 0) {
      toast({
        title: 'Tags required',
        description: 'Please select at least one tag for your submission.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const submissionRef = doc(firestore, 'orgs', orgId, 'submissions', submissionId);
      setDocumentNonBlocking(submissionRef, {
        id: submissionId,
        orgId,
        partnerId: user.uid,
        partnerName: userName || user.displayName || 'Partner',
        partnerEmail: userEmail || user.email || '',
        title: title.trim(),
        bodyCopy: bodyCopy.trim(),
        tagIds,
        imageUrls: images.map((img) => img.url),
        imageStoragePaths: images.map((img) => img.storagePath),
        imageMetadata: images.map((img) => img.metadata),
        status: 'submitted',
        createdAt: serverTimestamp(),
      }, {});

      toast({
        title: 'Submission sent',
        description: 'Your content has been submitted for review.',
      });

      router.push('/portal');
    } catch (error: any) {
      console.error('Error creating submission:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit your content. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!orgId) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Content Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Give your submission a short, descriptive title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bodyCopy">Content *</Label>
            <Textarea
              id="bodyCopy"
              placeholder="Write your content here... Include key details, quotes, and any information you'd like the press team to know about."
              value={bodyCopy}
              onChange={(e) => setBodyCopy(e.target.value)}
              required
              className="min-h-[250px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tags *</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Select tags that best describe your content to help the team organize submissions.
          </p>
          <TagSelector orgId={orgId} selectedTagIds={tagIds} onTagsChange={setTagIds} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images (Optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Upload images to accompany your submission. Up to 5 images, 10MB each.
          </p>
          <MultiImageUpload
            orgId={orgId}
            submissionId={submissionId}
            images={images}
            onImagesChange={setImages}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !title.trim() || !bodyCopy.trim()}>
          <Send />
          {isSubmitting ? 'Submitting...' : 'Submit Content'}
        </Button>
      </div>
    </form>
  );
}
