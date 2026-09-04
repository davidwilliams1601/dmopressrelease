'use client';

import { useParams, useRouter } from 'next/navigation';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Instagram, Twitter, Facebook, Linkedin } from 'lucide-react';
import Link from 'next/link';
import type { PartnerSubmission, Tag } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function PartnerSubmissionDetailPage() {
  const params = useParams();
  const submissionId = params.submissionId as string;
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();

  const submissionRef = useMemoFirebase(() => {
    if (!orgId || !submissionId) return null;
    return doc(firestore, 'orgs', orgId, 'submissions', submissionId);
  }, [firestore, orgId, submissionId]);

  const { data: submission, isLoading: isSubLoading } =
    useDoc<PartnerSubmission>(submissionRef);

  const tagsRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'tags'),
      orderBy('name', 'asc')
    );
  }, [firestore, orgId]);

  const { data: allTagsData } = useCollection<Tag>(tagsRef);
  const allTags = allTagsData || [];

  if (isUserLoading || isSubLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Submission not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/portal">
            <ArrowLeft />
            Back to Submissions
          </Link>
        </Button>
      </div>
    );
  }

  const submissionTags = allTags.filter((t) => submission.tagIds?.includes(t.id));

  const formatDate = (date: any) => {
    if (!date) return '-';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/portal">
            <ArrowLeft />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-headline font-bold">{submission.title}</h1>
          <p className="text-sm text-muted-foreground">
            Submitted {formatDate(submission.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm">{submission.bodyCopy}</div>
            </CardContent>
          </Card>

          {submission.imageUrls && submission.imageUrls.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Images</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {submission.imageUrls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Submission image ${i + 1}`}
                      className="rounded-lg border object-cover aspect-video w-full"
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* The school needs to see its own video back — both to confirm the right
              clip uploaded, and to check the transcript is accurate before anything
              built on it goes out to journalists. */}
          {submission.videoUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Video</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <video
                  src={submission.videoUrl}
                  controls
                  preload="metadata"
                  className="w-full rounded-lg border bg-black aspect-video"
                />

                <div>
                  <h4 className="text-sm font-medium mb-2">Transcript</h4>

                  {submission.videoTranscriptStatus === 'pending' && (
                    <p className="text-sm text-muted-foreground">
                      We&rsquo;re writing up what&rsquo;s said in this clip. It usually
                      takes a minute or two.
                    </p>
                  )}

                  {submission.videoTranscriptStatus === 'failed' && (
                    <p className="text-sm text-muted-foreground">
                      We couldn&rsquo;t write up this clip automatically, but your video
                      has uploaded fine and the team can still watch it.
                    </p>
                  )}

                  {submission.videoTranscriptStatus === 'complete' &&
                    (submission.videoTranscript ? (
                      <div className="whitespace-pre-wrap text-sm text-muted-foreground rounded-lg border bg-muted/40 p-3">
                        {submission.videoTranscript}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        We couldn&rsquo;t hear any speech in this clip.
                      </p>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Badge className="mt-1">{submission.status}</Badge>
              </div>

              {submissionTags.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tags</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {submissionTags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        style={{ borderColor: tag.color || undefined, color: tag.color || undefined }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {submission.aiThemes && submission.aiThemes.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">AI Themes</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {submission.aiThemes.map((theme) => (
                      <Badge key={theme} variant="secondary">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {submission.aiThemeAnalysis && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">AI Analysis</p>
                  <p className="mt-1 text-sm">{submission.aiThemeAnalysis}</p>
                </div>
              )}

              {submission.partnerSocialHandles && Object.values(submission.partnerSocialHandles).some(Boolean) && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Social Profiles</p>
                  <div className="mt-1 space-y-1">
                    {submission.partnerSocialHandles.instagram && (
                      <div className="flex items-center gap-2 text-sm">
                        <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{submission.partnerSocialHandles.instagram}</span>
                      </div>
                    )}
                    {submission.partnerSocialHandles.twitter && (
                      <div className="flex items-center gap-2 text-sm">
                        <Twitter className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{submission.partnerSocialHandles.twitter}</span>
                      </div>
                    )}
                    {submission.partnerSocialHandles.facebook && (
                      <div className="flex items-center gap-2 text-sm">
                        <Facebook className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{submission.partnerSocialHandles.facebook}</span>
                      </div>
                    )}
                    {submission.partnerSocialHandles.linkedin && (
                      <div className="flex items-center gap-2 text-sm">
                        <Linkedin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{submission.partnerSocialHandles.linkedin}</span>
                      </div>
                    )}
                    {submission.partnerSocialHandles.tiktok && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-xs font-bold text-muted-foreground">TT</span>
                        <span>{submission.partnerSocialHandles.tiktok}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
