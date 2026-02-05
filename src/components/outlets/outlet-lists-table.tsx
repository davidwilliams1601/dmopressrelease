'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OutletList } from '@/lib/types';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

type OutletListsTableProps = {
  outletLists: OutletList[];
};

export function OutletListsTable({ outletLists }: OutletListsTableProps) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-center">Recipients</TableHead>
          <TableHead className="hidden text-right md:table-cell">
            Created
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {outletLists.map((list) => (
          <TableRow
            key={list.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => router.push(`/outlets/${list.id}`)}
          >
            <TableCell className="font-medium">{list.name}</TableCell>
            <TableCell className="text-muted-foreground max-w-md truncate">
              {list.description || 'No description'}
            </TableCell>
            <TableCell className="text-center">
              <Badge variant="secondary">
                {list.recipientCount || 0}
              </Badge>
            </TableCell>
            <TableCell className="hidden text-right md:table-cell">
              {format(
                list.createdAt?.toDate ? list.createdAt.toDate() : new Date(list.createdAt),
                'dd MMM, yyyy'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
