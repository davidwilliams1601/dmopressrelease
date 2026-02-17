'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import type { PartnerSubmission, Tag } from '@/lib/types';

const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  submitted: 'default',
  reviewed: 'secondary',
  used: 'outline',
  archived: 'outline',
};

type SubmissionsTableProps = {
  submissions: PartnerSubmission[];
  tags: Tag[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
};

export function SubmissionsTable({
  submissions,
  tags,
  selectedIds,
  onSelectionChange,
}: SubmissionsTableProps) {
  const tagMap = new Map(tags.map((t) => [t.id, t]));

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === submissions.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(submissions.map((s) => s.id));
    }
  };

  const formatDate = (date: any) => {
    if (!date) return '-';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox
              checked={selectedIds.length === submissions.length && submissions.length > 0}
              onCheckedChange={toggleAll}
            />
          </TableHead>
          <TableHead>Partner</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Tags</TableHead>
          <TableHead>Themes</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {submissions.map((sub) => (
          <TableRow key={sub.id}>
            <TableCell>
              <Checkbox
                checked={selectedIds.includes(sub.id)}
                onCheckedChange={() => toggleSelection(sub.id)}
              />
            </TableCell>
            <TableCell className="text-sm">{sub.partnerName}</TableCell>
            <TableCell>
              <Link
                href={`/dashboard/submissions/${sub.id}`}
                className="font-medium hover:underline"
              >
                {sub.title}
              </Link>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {sub.tagIds?.slice(0, 3).map((tagId) => {
                  const tag = tagMap.get(tagId);
                  if (!tag) return null;
                  return (
                    <Badge
                      key={tagId}
                      variant="outline"
                      className="text-xs"
                      style={{ borderColor: tag.color || undefined, color: tag.color || undefined }}
                    >
                      {tag.name}
                    </Badge>
                  );
                })}
              </div>
            </TableCell>
            <TableCell>
              {sub.aiThemes && sub.aiThemes.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {sub.aiThemes.slice(0, 2).map((theme) => (
                    <Badge key={theme} variant="secondary" className="text-xs">
                      {theme}
                    </Badge>
                  ))}
                  {sub.aiThemes.length > 2 && (
                    <span className="text-xs text-muted-foreground">
                      +{sub.aiThemes.length - 2}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Analyzing...</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[sub.status] || 'secondary'}>
                {sub.status}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">{formatDate(sub.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
