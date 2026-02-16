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
              <Badge
                variant={
                  release.status === 'Sent'
                    ? 'default'
                    : release.status === 'Ready'
                    ? 'secondary'
                    : 'outline'
                }
                className={cn(
                  release.status === 'Ready' &&
                    'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200',
                  release.status === 'Sent' &&
                    'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
                )}
              >
                {release.status}
              </Badge>
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
