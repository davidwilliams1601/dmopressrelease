'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import type { MediaRequest } from '@/lib/types';

const statusVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  new: 'default',
  'in-progress': 'secondary',
  completed: 'outline',
  archived: 'outline',
};

type MediaRequestsTableProps = {
  requests: MediaRequest[];
};

export function MediaRequestsTable({ requests }: MediaRequestsTableProps) {
  const formatDate = (date: any) => {
    if (!date) return '-';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Outlet</TableHead>
          <TableHead>Topic</TableHead>
          <TableHead>Deadline</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Received</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((req) => (
          <TableRow key={req.id} className="cursor-pointer hover:bg-muted/50">
            <TableCell className="font-medium">
              <Link href={`/dashboard/media-requests/${req.id}`} className="hover:underline">
                {req.name}
              </Link>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{req.outlet}</TableCell>
            <TableCell className="text-sm max-w-[260px]">
              <span className="line-clamp-1">{req.topic}</span>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {req.deadline || '-'}
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[req.status] || 'secondary'}>
                {req.status === 'in-progress' ? 'In Progress' : req.status.charAt(0).toUpperCase() + req.status.slice(1)}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatDate(req.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
