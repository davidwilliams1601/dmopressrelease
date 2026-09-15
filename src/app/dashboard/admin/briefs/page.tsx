'use client';
export const dynamic = 'force-dynamic';

/**
 * Superadmin console for Destination Media Opportunity Briefs.
 *
 * The operator job this page exists for: before a trade show, take a slate of prospects,
 * generate a brief for each one, see immediately whether the brief is worth printing, and
 * open the ones that are.
 *
 * "Worth printing" is a real judgement, so the table shows the two numbers that decide it —
 * how many themes cleared the evidence bar, and how many of those ran without the prospect
 * named. A brief with zero themes is still generated and still listed; that is a finding
 * about the source set, and hiding it would be the one failure mode that matters here.
 *
 * Gating follows src/app/dashboard/admin/media-opportunities/page.tsx.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, collectionGroup, orderBy, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { formatTimestamp } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useToast } from '@/hooks/use-toast';
import { ProspectFormDialog } from '@/components/briefs/prospect-form-dialog';
import { FileText, Pencil, Plus, Sparkles } from 'lucide-react';
import type { DestinationBrief, MediaProspect } from '@/lib/types';

export default function AdminBriefsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { userData, isLoading: isUserDataLoading, isSuperAdmin } = useUserData();
  const { firestore } = useFirebase();

  useEffect(() => {
    if (!isUserDataLoading && userData && !isSuperAdmin) {
      router.replace('/dashboard');
    }
  }, [isUserDataLoading, userData, isSuperAdmin, router]);

  const prospectsQuery = useMemoFirebase(
    () => (firestore && isSuperAdmin ? query(collection(firestore, 'mediaProspects'), orderBy('name')) : null),
    [firestore, isSuperAdmin]
  );
  const { data: prospects, isLoading: prospectsLoading } = useCollection<MediaProspect>(prospectsQuery);

  // A collection-group read across every prospect's briefs, so the console can show the
  // latest brief per prospect without one listener per row.
  const briefsQuery = useMemoFirebase(
    () =>
      firestore && isSuperAdmin
        ? query(collectionGroup(firestore, 'briefs'), orderBy('generatedAt', 'desc'))
        : null,
    [firestore, isSuperAdmin]
  );
  const { data: briefs } = useCollection<DestinationBrief>(briefsQuery);

  const latestByProspect = useMemo(() => {
    const map = new Map<string, DestinationBrief>();
    for (const brief of briefs || []) {
      if (!map.has(brief.prospectId)) map.set(brief.prospectId, brief);
    }
    return map;
  }, [briefs]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MediaProspect | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function generate(prospect: MediaProspect) {
    setBusyId(prospect.id);
    try {
      const call = httpsCallable(getFunctions(), 'generateDestinationBrief');
      const res: any = await call({ prospectId: prospect.id });
      const { themesFound, themesWithoutMention, sourcesRepresented } = res.data || {};
      toast({
        title: themesFound ? `${themesFound} themes found` : 'No theme cleared the evidence bar',
        description: themesFound
          ? `${themesWithoutMention} ran without ${prospect.name} named, across ${sourcesRepresented} sources.`
          : `Nothing in the last 30 days across ${sourcesRepresented} sources reached three items from two outlets. Widen the window or the topics.`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not build the brief', description: err?.message });
    } finally {
      setBusyId(null);
    }
  }

  if (isUserDataLoading || !isSuperAdmin) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileText className="h-6 w-6 text-primary" />
            Destination Briefs
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            A retrospective replay of the last 30 days of sector coverage for a prospect: which
            themes moved, how fast a second outlet followed, and whether they were named. Built
            from the same ingested feeds as Media Opportunities — no extra fetching, no model
            calls, every claim linked to its source.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add prospect
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prospects</CardTitle>
          <CardDescription>
            Internal commercial data. Never visible to any customer account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prospectsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !prospects?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No prospects yet. Add one, then generate a brief for it.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Watch terms</TableHead>
                  <TableHead>Latest brief</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects
                  .filter((p) => !p.archived)
                  .map((prospect) => {
                    const latest = latestByProspect.get(prospect.id);
                    return (
                      <TableRow key={prospect.id}>
                        <TableCell>
                          <div className="font-medium">{prospect.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[prospect.organisationType, prospect.country].filter(Boolean).join(' · ')}
                          </div>
                        </TableCell>
                        <TableCell>
                          {prospect.campaign ? (
                            <Badge variant="outline">{prospect.campaign}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <span className="text-xs text-muted-foreground">
                            {prospect.watchTerms?.length
                              ? `${prospect.watchTerms.length} terms · ${prospect.watchTerms.slice(0, 3).join(', ')}${
                                  prospect.watchTerms.length > 3 ? '…' : ''
                                }`
                              : 'None set — the brief cannot say whether they appeared'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {latest ? (
                            <div className="space-y-1">
                              <div className="text-xs">
                                {formatTimestamp(latest.generatedAt, 'd MMM HH:mm')}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant="secondary">
                                  {latest.content?.totals?.themesFound ?? 0} themes
                                </Badge>
                                {(latest.content?.totals?.themesWithoutMention ?? 0) > 0 && (
                                  <Badge variant="destructive">
                                    {latest.content.totals.themesWithoutMention} without you
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(prospect);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => generate(prospect)}
                              disabled={busyId === prospect.id}
                            >
                              <Sparkles className="mr-2 h-4 w-4" />
                              {busyId === prospect.id ? 'Building…' : 'Build brief'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated briefs</CardTitle>
          <CardDescription>
            Each brief stores a frozen snapshot of its evidence, so what you printed stays what
            you printed. If the analysis is wrong, regenerate rather than editing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!briefs?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No briefs generated yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Themes</TableHead>
                  <TableHead>Appearances</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {briefs.map((brief) => (
                  <TableRow key={brief.id}>
                    <TableCell className="font-medium">{brief.prospectName}</TableCell>
                    <TableCell className="text-xs">{formatTimestamp(brief.generatedAt, 'd MMM HH:mm')}</TableCell>
                    <TableCell className="text-xs">
                      {brief.content?.totals?.themesFound ?? 0} found ·{' '}
                      {brief.content?.totals?.themesWithoutMention ?? 0} without them
                    </TableCell>
                    <TableCell className="text-xs">
                      {brief.content?.totals?.appearanceCount ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge variant={brief.status === 'final' ? 'default' : 'outline'}>
                        {brief.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/admin/briefs/${brief.prospectId}/${brief.id}`}>
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProspectFormDialog open={dialogOpen} onOpenChange={setDialogOpen} prospect={editing} />
    </div>
  );
}
