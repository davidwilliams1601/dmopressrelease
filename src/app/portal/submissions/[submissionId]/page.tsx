'use client';

import { useParams, useRouter } from 'next/navigation';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
