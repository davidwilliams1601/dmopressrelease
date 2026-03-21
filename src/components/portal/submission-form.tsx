'use client';

import { useState, useEffect } from 'react';
import { useFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { useRouter } from 'next/navigation';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagSelector } from '@/components/shared/tag-selector';
import { MultiImageUpload } from '@/components/portal/multi-image-upload';
import { useToast } from '@/hooks/use-toast';
import { Send, Sparkles, Loader2, Check, X, Info } from 'lucide-react';
import type { SocialHandles } from '@/lib/types';
import { improveSubmissionCopy } from '@/ai/flows/improve-submission-copy';

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

const SOCIAL_FIELDS: { key: keyof SocialHandles; label: string; placeholder: string }[] = [
  { key: 'instagram', label: 'Instagram', placeholder: '@yourhandle' },
  { key: 'twitter', label: 'X / Twitter', placeholder: '@yourhandle' },
  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/yourpage' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/company/yourorg' },
  { key: 'tiktok', label: 'TikTok', placeholder: '@yourhandle' },
];

export function SubmissionForm() {
  const { firestore, user } = useFirebase();
  const { orgId, name: userName, email: userEmail, socialHandles: savedHandles } = useUserData();
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [bodyCopy, setBodyCopy] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [socialHandles, setSocialHandles] = useState<SocialHandles>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI improve state
  const [isImproving, setIsImproving] = useState(false);
  const [improvedCopy, setImprovedCopy] = useState<string | null>(null);

  // Pre-populate social handles from saved profile
  useEffect(() => {
    if (savedHandles) {
      setSocialHandles(savedHandles);
    }
  }, [savedHandles]);

  // Pre-generate submission ID for image uploads — generated once orgId is available
  const [submissionId, setSubmissionId] = useState('');
  useEffect(() => {
    if (orgId && !submissionId) {
      setSubmissionId(doc(collection(firestore, 'orgs', orgId, 'submissions')).id);
    }
  }, [orgId, firestore, submissionId]);

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
      // Strip empty handle values before saving
      const cleanHandles = Object.fromEntries(
        Object.entries(socialHandles).filter(([, v]) => v && v.trim())
      ) as SocialHandles;

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
        partnerSocialHandles: cleanHandles,
        createdAt: serverTimestamp(),
      }, {});

      // Persist handles back to user profile so future submissions pre-populate
      if (Object.keys(cleanHandles).length > 0) {
        const userRef = doc(firestore, 'orgs', orgId, 'users', user.uid);
        updateDocumentNonBlocking(userRef, { socialHandles: cleanHandles });
      }

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

  const handleImprove = async () => {
    if (!bodyCopy.trim()) {
      toast({
        title: 'Nothing to improve',
        description: 'Write some content first, then use AI to polish it.',
        variant: 'destructive',
      });
      return;
    }

    setIsImproving(true);
    setImprovedCopy(null);

    try {
      const result = await improveSubmissionCopy({
        title: title.trim() || 'Untitled',
        bodyCopy: bodyCopy.trim(),
        partnerName: userName || undefined,
      });

      if (result.success) {
        setImprovedCopy(result.data.improvedCopy);
      } else {
        toast({ title: 'Improvement failed', description: result.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsImproving(false);
    }
  };

  const acceptImprovedCopy = () => {
    if (improvedCopy) {
      setBodyCopy(improvedCopy);
      setImprovedCopy(null);
    }
  };

  const dismissImprovedCopy = () => {
    setImprovedCopy(null);
  };

  if (!orgId || !submissionId) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Content Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-blue-200 bg-blue-50 text-blue-900 [&>svg]:text-blue-600">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Please create a separate submission for each piece of news or content. For example, an Easter event and a summer promotion should be two separate submissions — this helps the press team use your content more effectively.
            </AlertDescription>
          </Alert>
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

            {/* AI improve suggestion panel */}
            {improvedCopy ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI suggestion
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={dismissImprovedCopy}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {improvedCopy}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={acceptImprovedCopy}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Use this
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleImprove}
                    disabled={isImproving}
                  >
                    {isImproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Try again
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={dismissImprovedCopy}
                  >
                    Keep original
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={handleImprove}
                  disabled={isImproving || !bodyCopy.trim()}
                >
                  {isImproving ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Improving...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" /> Improve with AI</>
                  )}
                </Button>
              </div>
            )}
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
          <CardTitle>Social Profiles (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add your social handles so the press team can tag you in coverage. Saved to your profile for future submissions.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`social-${key}`}>{label}</Label>
                <Input
                  id={`social-${key}`}
                  placeholder={placeholder}
                  value={socialHandles[key] || ''}
                  onChange={(e) =>
                    setSocialHandles((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
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
