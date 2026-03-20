'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { SendJob } from '@/lib/types';
import { format } from 'date-fns';
import { toDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  CalendarClock,
  Ban,
} from 'lucide-react';

type SendJobsCardProps = {
  orgId: string;
  releaseId: string;
};

export function SendJobsCard({ orgId, releaseId }: SendJobsCardProps) {
  const { firestore, firebaseApp } = useFirebase();
  const { toast } = useToast();
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);

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

  const handleCancelScheduled = async (jobId: string) => {
    setCancellingJobId(jobId);
    try {
      const functions = getFunctions(firebaseApp);
      const cancelScheduledSend = httpsCallable(functions, 'cancelScheduledSend');
      await cancelScheduledSend({ orgId, sendJobId: jobId });
      toast({
        title: 'Scheduled send cancelled',
        description: 'The scheduled send has been cancelled.',
      });
    } catch (error) {
      console.error('Error cancelling scheduled send:', error);
      toast({
        title: 'Error cancelling send',
        description: 'There was a problem cancelling the scheduled send. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCancellingJobId(null);
    }
  };

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
      case 'scheduled':
        return <CalendarClock className="h-4 w-4 text-blue-600" />;
      case 'cancelled':
        return <Ban className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: SendJob['status']) => {
    const variants: Record<SendJob['status'], 'default' | 'destructive' | 'secondary' | 'outline'> = {
      completed: 'default',
      failed: 'destructive',
      processing: 'secondary',
      pending: 'outline',
      scheduled: 'secondary',
      cancelled: 'outline',
    };

    const extraClasses: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    };

    return (
      <Badge
        variant={variants[status]}
        className={`gap-1 ${extraClasses[status] || ''}`}
      >
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
                    {format(toDate(job.createdAt), 'dd MMM yyyy, HH:mm')}
                  </span>
                </div>
                {job.status === 'scheduled' && job.scheduledAt && (
                  <p className="text-sm text-blue-600 flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Scheduled for {format(toDate(job.scheduledAt), 'dd MMM yyyy, HH:mm')}
                  </p>
                )}
                <div className="text-sm">
                  <span className="font-medium">{job.totalRecipients}</span>{' '}
                  recipient{job.totalRecipients !== 1 ? 's' : ''}
                  {job.status === 'completed' && (
                    <>
                      {' \u2022 '}
                      <span className="text-green-600">
                        {job.sentCount} sent
                      </span>
                      {job.failedCount > 0 && (
                        <>
                          {' \u2022 '}
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
              <div className="flex items-center gap-2">
                {job.status === 'scheduled' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancelScheduled(job.id)}
                    disabled={cancellingJobId === job.id}
                  >
                    {cancellingJobId === job.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Ban className="h-3 w-3" />
                    )}
                    Cancel
                  </Button>
                )}
                <div className="text-right text-xs text-muted-foreground">
                  {job.outletListIds.length} list
                  {job.outletListIds.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
