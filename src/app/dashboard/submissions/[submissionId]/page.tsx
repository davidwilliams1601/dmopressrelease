'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { analyzeSubmissionThemes } from '@/ai/flows/analyze-submission-themes';
import type { PartnerSubmission, Tag } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function SubmissionDetailPage() {
  const params = useParams();
  const submissionId = params.submissionId as string;
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isReanalyzing, setIsReanalyzing] = useState(false);

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

  const handleStatusChange = (status: string) => {
    if (!submissionRef || !submission) return;
    updateDocumentNonBlocking(submissionRef, {
      status,
      updatedAt: serverTimestamp(),
    });
    toast({ title: 'Status updated', description: `Submission marked as ${status}.` });
  };

  const handleNotesChange = (notes: string) => {
    if (!submissionRef) return;
    updateDocumentNonBlocking(submissionRef, {
      reviewNotes: notes,
      updatedAt: serverTimestamp(),
    });
  };

  const handleReanalyze = async () => {
    if (!submission || !submissionRef) return;
    setIsReanalyzing(true);

    try {
      const result = await analyzeSubmissionThemes({
        title: submission.title,
        bodyCopy: submission.bodyCopy,
      });

      if (result.success) {
        updateDocumentNonBlocking(submissionRef, {
          aiThemes: result.data.themes,
          aiThemeAnalysis: result.data.analysis,
          aiAnalyzedAt: serverTimestamp(),
        });
        toast({ title: 'Analysis updated', description: 'AI themes have been refreshed.' });
      } else {
        toast({ title: 'Analysis failed', description: result.error, variant: 'destructive' });
      }
    } finally {
      setIsReanalyzing(false);
    }
  };

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
          <Link href="/dashboard/submissions">
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
          <Link href="/dashboard/submissions">
            <ArrowLeft />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-headline font-bold">{submission.title}</h1>
          <p className="text-sm text-muted-foreground">
            By {submission.partnerName} ({submission.partnerEmail}) &middot; {formatDate(submission.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
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
                <CardTitle>Images ({submission.imageUrls.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {submission.imageUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`Submission image ${i + 1}`}
                        className="rounded-lg border object-cover aspect-video w-full hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status & Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={submission.status} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {submissionTags.length > 0 && (
                <div>
                  <Label>Tags</Label>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                AI Themes
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReanalyze}
                  disabled={isReanalyzing}
                >
                  {isReanalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Re-analyze
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {submission.aiThemes && submission.aiThemes.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1">
                    {submission.aiThemes.map((theme) => (
                      <Badge key={theme} variant="secondary">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                  {submission.aiThemeAnalysis && (
                    <p className="text-sm text-muted-foreground">{submission.aiThemeAnalysis}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  AI analysis is in progress or not yet available.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Add internal notes about this submission..."
                defaultValue={submission.reviewNotes || ''}
                onBlur={(e) => handleNotesChange(e.target.value)}
                className="min-h-[100px]"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Notes are saved automatically and only visible to the team.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
