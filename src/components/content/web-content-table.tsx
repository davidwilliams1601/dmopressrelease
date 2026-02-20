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
import type { WebContent } from '@/lib/types';
import { cn, toDate } from '@/lib/utils';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

type WebContentTableProps = {
  items: WebContent[];
};

function statusVariant(status: WebContent['status']) {
  if (status === 'Published') return 'default';
  if (status === 'Ready') return 'secondary';
  return 'outline';
}

function statusClass(status: WebContent['status']) {
  if (status === 'Ready') return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200';
  if (status === 'Published') return 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200';
  return '';
}

export function WebContentTable({ items }: WebContentTableProps) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[110px]">Status</TableHead>
          <TableHead>Title</TableHead>
          <TableHead className="hidden md:table-cell">Content Type</TableHead>
          <TableHead className="hidden md:table-cell">Target Market</TableHead>
          <TableHead className="hidden text-right md:table-cell">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => router.push(`/dashboard/content/${item.id}`)}
          >
            <TableCell>
              <Badge
                variant={statusVariant(item.status)}
                className={cn(statusClass(item.status))}
              >
                {item.status}
              </Badge>
            </TableCell>
            <TableCell className="font-medium">{item.title}</TableCell>
            <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
              {item.contentType}
            </TableCell>
            <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
              {item.targetMarket || '—'}
            </TableCell>
            <TableCell className="hidden text-right md:table-cell">
              {format(toDate(item.createdAt), 'dd MMM, yyyy')}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
