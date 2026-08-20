'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import { toDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Radio } from 'lucide-react';
import { format } from 'date-fns';
import { MediaNetworkImportWizard } from '@/components/admin/media-network-import-wizard';
import { MediaNetworkBatchReview } from '@/components/admin/media-network-batch-review';
import type { MediaNetworkImportBatch } from '@/lib/types';

/**
 * Superadmin console for Press Pilot's own media network — import history / review
 * queue on one tab. Follows the same page-gating convention as
 * src/app/dashboard/admin/orgs/page.tsx (redirect non-superadmins to /dashboard).
 */
export default function MediaNetworkAdminPage() {
  const { isSuperAdmin, isLoading: isUserLoading } = useUserData();
  const router = useRouter();

  const [batches, setBatches] = useState<MediaNetworkImportBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewBatch, setReviewBatch] = useState<MediaNetworkImportBatch | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const loadBatches = useCallback(async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const listBatches = httpsCallable<unknown, MediaNetworkImportBatch[]>(functions, 'listMediaNetworkBatches');
      const result = await listBatches();
      setBatches(result.data);
    } catch (err) {
      console.error('Failed to load media network batches:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isUserLoading && !isSuperAdmin) router.replace('/dashboard');
  }, [isUserLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (!isUserLoading && isSuperAdmin) loadBatches();
  }, [isUserLoading, isSuperAdmin, loadBatches]);

  if (isUserLoading || !isSuperAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Radio className="h-6 w-6" /> Media network
          </h1>
          <p className="text-muted-foreground">
            Press Pilot&apos;s own media-contact network — imported, reviewed, and published here.
            Nothing becomes recommendable to any organisation until you explicitly publish it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadBatches} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <MediaNetworkImportWizard onImported={loadBatches} />
        </div>
      </div>

      <Tabs defaultValue="batches">
        <TabsList>
          <TabsTrigger value="batches">Import history &amp; review queue</TabsTrigger>
        </TabsList>
        <TabsContent value="batches">
          <Card>
            <CardHeader>
              <CardTitle>Import batches</CardTitle>
              <CardDescription>Every upload lands here first. Review a batch to approve or reject individual rows, then publish.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : batches.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No batches imported yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="text-right">Ready</TableHead>
                      <TableHead className="text-right">Duplicate</TableHead>
                      <TableHead className="text-right">Invalid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{batch.fileName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{batch.sourceType}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {batch.uploadedAt ? format(toDate(batch.uploadedAt), 'd MMM yyyy HH:mm') : '—'}
                        </TableCell>
                        <TableCell className="text-right">{batch.readyCount}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{batch.duplicateCount}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{batch.invalidCount}</TableCell>
                        <TableCell>
                          <Badge variant={batch.status === 'published' ? 'default' : 'secondary'}>{batch.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReviewBatch(batch);
                              setReviewOpen(true);
                            }}
                          >
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MediaNetworkBatchReview
        batch={reviewBatch}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onPublished={loadBatches}
      />
    </div>
  );
}
