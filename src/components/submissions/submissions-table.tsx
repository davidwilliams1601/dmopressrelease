'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Check, Archive, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { PartnerSubmission, Tag } from '@/lib/types';

// Score band helpers
function scoreColor(score: number | undefined): string {
  if (score === undefined) return 'text-muted-foreground bg-muted';
  if (score >= 7) return 'text-green-800 bg-green-100 border-green-200';
  if (score >= 4) return 'text-amber-800 bg-amber-100 border-amber-200';
  return 'text-red-800 bg-red-100 border-red-200';
}

function ScoreBadge({ score }: { score: number | undefined }) {
  if (score === undefined) {
    return (
      <span className="inline-flex items-center justify-center w-10 h-7 rounded border text-xs font-medium text-muted-foreground bg-muted border-border">
        —
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center w-10 h-7 rounded border text-xs font-semibold ${scoreColor(score)}`}
    >
      {score}/10
    </span>
  );
}

const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  submitted: 'default',
  reviewed: 'secondary',
  used: 'outline',
  archived: 'outline',
};

type QuickAction = (submissionId: string, status: 'reviewed' | 'archived') => Promise<void>;

type SubmissionsTableProps = {
  submissions: PartnerSubmission[];
  tags: Tag[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onQuickAction?: QuickAction;
};

export function SubmissionsTable({
  submissions,
  tags,
  selectedIds,
  onSelectionChange,
  onQuickAction,
}: SubmissionsTableProps) {
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const [pendingAction, setPendingAction] = useState<Record<string, string>>({});

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

  const handleQuickAction = async (
    submissionId: string,
    status: 'reviewed' | 'archived'
  ) => {
    if (!onQuickAction) return;
    setPendingAction((prev) => ({ ...prev, [submissionId]: status }));
    try {
      await onQuickAction(submissionId, status);
    } finally {
      setPendingAction((prev) => {
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
    }
  };

  const formatDate = (date: any) => {
    if (!date) return '-';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={selectedIds.length === submissions.length && submissions.length > 0}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead className="w-20">Score</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-36">Type</TableHead>
            <TableHead className="w-40">Themes</TableHead>
            <TableHead className="w-32">Partner</TableHead>
            <TableHead className="w-20">Status</TableHead>
            <TableHead className="w-20">Date</TableHead>
            {onQuickAction && <TableHead className="w-20 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((sub) => {
            const isPending = !!pendingAction[sub.id];
            const isArchived = sub.status === 'archived';

            return (
              <TableRow
                key={sub.id}
                className={isArchived ? 'opacity-50' : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(sub.id)}
                    onCheckedChange={() => toggleSelection(sub.id)}
                  />
                </TableCell>

                {/* Score */}
                <TableCell>
                  {sub.aiEditorialRationale ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">
                          <ScoreBadge score={sub.aiEditorialScore} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs">{sub.aiEditorialRationale}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <ScoreBadge score={sub.aiEditorialScore} />
                  )}
                </TableCell>

                {/* Title + rationale snippet */}
                <TableCell>
                  <Link
                    href={`/dashboard/submissions/${sub.id}`}
                    className="font-medium hover:underline block leading-snug"
                  >
                    {sub.title}
                  </Link>
                  {sub.aiEditorialRationale && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {sub.aiEditorialRationale}
                    </p>
                  )}
                </TableCell>

                {/* Content type */}
                <TableCell>
                  {sub.aiContentType ? (
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                      {sub.aiContentType}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* AI themes */}
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
                    <span className="text-xs text-muted-foreground">Analysing…</span>
                  )}
                </TableCell>

                {/* Partner */}
                <TableCell className="text-sm truncate max-w-[8rem]">
                  {sub.partnerName}
                </TableCell>

                {/* Status */}
                <TableCell>
                  <Badge variant={statusVariant[sub.status] || 'secondary'} className="text-xs">
                    {sub.status}
                  </Badge>
                </TableCell>

                {/* Date */}
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(sub.createdAt)}
                </TableCell>

                {/* Quick actions */}
                {onQuickAction && (
                  <TableCell className="text-right">
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-auto text-muted-foreground" />
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        {sub.status !== 'reviewed' && sub.status !== 'used' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-green-700 hover:text-green-800 hover:bg-green-50"
                                onClick={() => handleQuickAction(sub.id, 'reviewed')}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Accept</TooltipContent>
                          </Tooltip>
                        )}
                        {sub.status !== 'archived' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => handleQuickAction(sub.id, 'archived')}
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Archive</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
