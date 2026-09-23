'use client';

import { format } from 'date-fns';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  COVERAGE_MEDIA_TYPE_LABELS,
  COVERAGE_OUTLET_TYPE_LABELS,
  COVERAGE_TONE_LABELS,
  type SharedCoverageRecord,
} from '@/lib/coverage-core';

type Row = Pick<
  SharedCoverageRecord,
  'id' | 'url' | 'headline' | 'outletName' | 'publishedAtMs' | 'mediaType' | 'outletType' | 'tone' | 'releaseHeadline' | 'partnerNames' | 'themes'
>;

type Props<T extends Row> = {
  records: T[];
  onEdit?: (record: T) => void;
  onDelete?: (record: T) => void;
  membersLabel?: string;
  showMembers?: boolean;
  emptyText?: string;
};

const TONE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  positive: 'default',
  neutral: 'secondary',
  sensitive: 'outline',
};

export function CoverageTable<T extends Row>({
  records,
  onEdit,
  onDelete,
  membersLabel = 'Members',
  showMembers = true,
  emptyText = 'No coverage logged for this period.',
}: Props<T>) {
  if (records.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  const sorted = [...records].sort((a, b) => b.publishedAtMs - a.publishedAtMs);
  const editable = !!(onEdit || onDelete);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Published</TableHead>
          <TableHead>Coverage</TableHead>
          <TableHead className="hidden md:table-cell">Type</TableHead>
          {showMembers && <TableHead className="hidden lg:table-cell">{membersLabel}</TableHead>}
          <TableHead className="w-24">Tone</TableHead>
          {editable && <TableHead className="no-print w-24 text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((r) => (
          <TableRow key={r.id} className="break-inside-avoid">
            <TableCell className="whitespace-nowrap align-top text-sm">{format(new Date(r.publishedAtMs), 'd MMM yyyy')}</TableCell>
            <TableCell className="align-top">
              <div className="font-medium">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 hover:underline">
                    {r.headline}
                    <ExternalLink className="no-print mt-1 h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  r.headline
                )}
              </div>
              <div className="text-sm text-muted-foreground">{r.outletName}</div>
              {r.releaseHeadline && <div className="text-xs text-muted-foreground">From: {r.releaseHeadline}</div>}
              {r.themes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.themes.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs font-normal">{t}</Badge>
                  ))}
                </div>
              )}
            </TableCell>
            <TableCell className="hidden align-top text-sm md:table-cell">
              {COVERAGE_MEDIA_TYPE_LABELS[r.mediaType]}
              <div className="text-xs text-muted-foreground">{COVERAGE_OUTLET_TYPE_LABELS[r.outletType]}</div>
            </TableCell>
            {showMembers && (
              <TableCell className="hidden align-top text-sm lg:table-cell">
                {r.partnerNames.length ? r.partnerNames.join(', ') : <span className="text-muted-foreground">—</span>}
              </TableCell>
            )}
            <TableCell className="align-top">
              <Badge variant={TONE_VARIANT[r.tone] || 'secondary'}>{COVERAGE_TONE_LABELS[r.tone]}</Badge>
            </TableCell>
            {editable && (
              <TableCell className="no-print align-top text-right">
                {onEdit && (
                  <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => onEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {onDelete && (
                  <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => onDelete(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
