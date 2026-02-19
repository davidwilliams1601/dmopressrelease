'use client';

import { useParams } from 'next/navigation';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import type { MediaRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';

const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  new: 'default',
  'in-progress': 'secondary',
  completed: 'outline',
  archived: 'outline',
};

function formatDate(date: any) {
  if (!date) return '-';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MediaRequestDetailPage() {
  const params = useParams();
  const requestId = params.requestId as string;
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const requestRef = useMemoFirebase(() => {
    if (!orgId || !requestId) return null;
    return doc(firestore, 'orgs', orgId, 'mediaRequests', requestId);
  }, [firestore, orgId, requestId]);

  const { data: request, isLoading: isRequestLoading } = useDoc<MediaRequest>(requestRef);

  const handleStatusChange = (status: string) => {
    if (!requestRef || !request) return;
    updateDocumentNonBlocking(requestRef, {
      status,
      updatedAt: serverTimestamp(),
    });
    toast({ title: 'Status updated', description: `Request marked as ${status}.` });
  };

  if (isUserLoading || isRequestLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Media request not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard/media-requests">
            <ArrowLeft />
            Back to Media Requests
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/media-requests">
            <ArrowLeft />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-headline font-bold">{request.name}</h1>
          <p className="text-sm text-muted-foreground">
            {request.outlet} &middot; {request.email} &middot; Received {formatDate(request.createdAt)}
          </p>
        </div>
        <Badge variant={statusVariant[request.status] || 'secondary'}>
          {request.status === 'in-progress' ? 'In Progress' : request.status.charAt(0).toUpperCase() + request.status.slice(1)}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Story Topic / Angle</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{request.topic}</p>
            </CardContent>
          </Card>

          {(request.destinations || request.deadline || request.additionalInfo) && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {request.destinations && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Destinations of Interest</Label>
                    <p className="mt-1 text-sm">{request.destinations}</p>
                  </div>
                )}
                {request.deadline && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Deadline</Label>
                    <p className="mt-1 text-sm">{request.deadline}</p>
                  </div>
                )}
                {request.additionalInfo && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Additional Information</Label>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{request.additionalInfo}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Name</Label>
                <p className="mt-1">{request.name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Email</Label>
                <p className="mt-1">
                  <a href={`mailto:${request.email}`} className="text-primary hover:underline">
                    {request.email}
                  </a>
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Publication</Label>
                <p className="mt-1">{request.outlet}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={request.status} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
