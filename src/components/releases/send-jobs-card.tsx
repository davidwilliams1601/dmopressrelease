'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import type { SendJob } from '@/lib/types';
import { format } from 'date-fns';
import { Send, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';

type SendJobsCardProps = {
  orgId: string;
  releaseId: string;
};

export function SendJobsCard({ orgId, releaseId }: SendJobsCardProps) {
  const { firestore } = useFirebase();

  const sendJobsQuery = useCollection<SendJob>(
    useMemoFirebase(() => {
      if (!orgId || !releaseId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'sendJobs'),
        where('releaseId', '==', releaseId),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
    }, [firestore, orgId, releaseId])
  );

  const sendJobs = sendJobsQuery.data || [];

  if (sendJobsQuery.isLoading) {
    return null;
  }

  // Log any errors for debugging
  if (sendJobsQuery.error) {
    console.error('SendJobsCard error:', sendJobsQuery.error);
    return null; // Silently fail - sendJobs are optional
  }

  if (sendJobs.length === 0) {
    return null;
  }

  const getStatusIcon = (status: SendJob['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusBadge = (status: SendJob['status']) => {
    const variants = {
      completed: 'default',
      failed: 'destructive',
      processing: 'secondary',
      pending: 'outline',
    } as const;

    return (
      <Badge variant={variants[status]} className="gap-1">
        {getStatusIcon(status)}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <Send className="h-5 w-5" />
          Send History
        </CardTitle>
        <CardDescription>
          Recent distributions of this press release.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sendJobs.map((job) => (
            <div
              key={job.id}
              className="flex items-start justify-between border-b pb-4 last:border-0 last:pb-0"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusBadge(job.status)}
                  <span className="text-sm text-muted-foreground">
                    {format(
                      job.createdAt?.toDate
                        ? job.createdAt.toDate()
                        : new Date(job.createdAt),
                      'dd MMM yyyy, HH:mm'
                    )}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="font-medium">{job.totalRecipients}</span>{' '}
                  recipient{job.totalRecipients !== 1 ? 's' : ''}
                  {job.status === 'completed' && (
                    <>
                      {' • '}
                      <span className="text-green-600">
                        {job.sentCount} sent
                      </span>
                      {job.failedCount > 0 && (
                        <>
                          {' • '}
                          <span className="text-red-600">
                            {job.failedCount} failed
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
                {job.error && (
                  <p className="text-xs text-red-600">{job.error}</p>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {job.outletListIds.length} list
                {job.outletListIds.length !== 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
