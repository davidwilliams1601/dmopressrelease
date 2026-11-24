'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Release } from '@/lib/types';
import { cn, toDate } from '@/lib/utils';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
  DISTRIBUTION_CLASSES,
  DISTRIBUTION_LABELS,
  effectiveDistributionStatus,
  isInNewsroom,
} from '@/lib/release-status';

type ReleasesTableProps = {
  releases: Release[];
};

export default function ReleasesTable({ releases }: ReleasesTableProps) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Status</TableHead>
          <TableHead>Headline</TableHead>
          <TableHead className="hidden text-right md:table-cell">
            Created
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {releases.map((release) => (
          <TableRow
            key={release.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => router.push(`/dashboard/releases/${release.id}`)}
          >
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <Badge
                  variant={
                    release.status === 'Sent'
                      ? 'default'
                      : release.status === 'Ready'
                      ? 'secondary'
                      : release.status === 'Scheduled'
                      ? 'secondary'
                      : 'outline'
                  }
                  className={cn(
                    release.status === 'Ready' &&
                      'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200',
                    release.status === 'Sent' &&
                      'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200',
                    release.status === 'Scheduled' &&
                      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  )}
                >
                  {release.status}
                </Badge>
                {/* Email pill only when it says something the status badge doesn't:
                    in flight, failed, or partly sent. */}
                {(() => {
                  const d = effectiveDistributionStatus(release);
                  if (d !== 'queued' && d !== 'sending' && d !== 'failed' && d !== 'partially_sent') return null;
                  return <Badge className={DISTRIBUTION_CLASSES[d]}>{DISTRIBUTION_LABELS[d]}</Badge>;
                })()}
                {release.status !== 'Sent' && isInNewsroom(release) && (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    In newsroom
                  </Badge>
                )}
                {release.approvalStatus === 'pending' && (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    Awaiting Approval
                  </Badge>
                )}
                {release.hasHoldingText === true && (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    Holding text
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="font-medium">{release.headline}</TableCell>
            <TableCell className="hidden text-right md:table-cell">
              {format(toDate(release.createdAt), 'dd MMM, yyyy')}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
