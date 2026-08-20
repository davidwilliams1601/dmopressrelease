'use client';

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { OUTLET_TYPE_LABEL_BY_VALUE } from '@/lib/media-taxonomy';
import type { Release, RecommendationSnapshot, RecommendationMatchBand } from '@/lib/types';
import { Sparkles, Loader2, EyeOff, Check, X, Coins, Users } from 'lucide-react';

type RecommendationListProps = {
  release: Release;
  orgId: string;
};

const BAND_ORDER: Record<RecommendationMatchBand, number> = { strong: 0, good: 1, possible: 2 };

const BAND_LABEL: Record<RecommendationMatchBand, string> = {
  strong: 'Strong match',
  good: 'Good match',
  possible: 'Possible match',
};

const BAND_VARIANT: Record<RecommendationMatchBand, 'default' | 'secondary' | 'outline'> = {
  strong: 'default',
  good: 'secondary',
  possible: 'outline',
};

function outletLabel(value: string): string {
  return OUTLET_TYPE_LABEL_BY_VALUE[value] || value;
}

/**
 * Combined ranked recommendation list for an approved story — customer-owned contacts
 * shown named, Press Pilot media-network contacts shown anonymised, with Include /
 * Not relevant actions and a pre-send credit-cost summary. See
 * docs/smart-distribution/import-wizard-and-credits.md §5 for the target copy this
 * mirrors.
 */
export function RecommendationList({ release, orgId }: RecommendationListProps) {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const hasFocusTags =
    !!release.smartDistribution &&
    ((release.smartDistribution.editorialFocus?.length ?? 0) > 0 ||
      (release.smartDistribution.geographies?.length ?? 0) > 0 ||
      (release.smartDistribution.topics?.length ?? 0) > 0);

  // Single equality filter only — sorted client-side — so no composite index is needed
  // for this read (only the Cloud Function's own pending-cleanup query needs one; see
  // firestore.indexes.json).
  const snapshotsQuery = useCollection<RecommendationSnapshot>(
    useMemoFirebase(() => {
      if (!orgId || !release.id) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'recommendationSnapshots'),
        where('storyId', '==', release.id)
      );
    }, [firestore, orgId, release.id])
  );

  const rows = useMemo(() => {
    return (snapshotsQuery.data || []).slice().sort((a, b) => {
      const bandDiff = BAND_ORDER[a.matchBand] - BAND_ORDER[b.matchBand];
      if (bandDiff !== 0) return bandDiff;
      return b.matchScore - a.matchScore;
    });
  }, [snapshotsQuery.data]);

  const summary = useMemo(() => {
    const strong = rows.filter((r) => r.matchBand === 'strong').length;
    const good = rows.filter((r) => r.matchBand === 'good').length;
    const possible = rows.filter((r) => r.matchBand === 'possible').length;
    const includedCredits = rows
      .filter((r) => r.decision === 'included')
      .reduce((sum, r) => sum + r.creditCost, 0);
    const includedCount = rows.filter((r) => r.decision === 'included').length;
    return { total: rows.length, strong, good, possible, includedCredits, includedCount };
  }, [rows]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const functions = getFunctions();
      const generate = httpsCallable<
        { orgId: string; storyId: string },
        { generated: number; strongCount: number; goodCount: number; possibleCount: number }
      >(functions, 'generateRecommendations');
      const result = await generate({ orgId, storyId: release.id });
      toast({
        title: 'Recommendations generated',
        description: `Found ${result.data.generated} contact${result.data.generated === 1 ? '' : 's'} — ${result.data.strongCount} strong, ${result.data.goodCount} good, ${result.data.possibleCount} possible.`,
      });
    } catch (error: any) {
      toast({ title: 'Error generating recommendations', description: error.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDecision = async (snapshotId: string, decision: 'included' | 'not_relevant') => {
    setDecidingId(snapshotId);
    try {
      const functions = getFunctions();
      const recordDecision = httpsCallable(functions, 'recordRecommendationDecision');
      await recordDecision({ orgId, storyId: release.id, snapshotId, decision });
    } catch (error: any) {
      toast({ title: 'Error saving decision', description: error.message, variant: 'destructive' });
    } finally {
      setDecidingId(null);
    }
  };

  if (release.approvalStatus !== 'approved') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Recommended contacts
          </CardTitle>
          <CardDescription>
            Recommendations become available once this story is approved.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Recommended contacts
          </CardTitle>
          <CardDescription>
            Combines your own outlet contacts with Press Pilot&apos;s anonymised media network.
            You choose who&apos;s included — nothing sends automatically.
          </CardDescription>
        </div>
        <Button size="sm" onClick={handleGenerate} disabled={isGenerating || !hasFocusTags}>
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate recommendations
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasFocusTags && (
          <Alert>
            <AlertTitle>Add a Smart Distribution focus first</AlertTitle>
            <AlertDescription>
              Tag this story with an editorial focus, geography, or topic above, then generate
              recommendations.
            </AlertDescription>
          </Alert>
        )}

        {snapshotsQuery.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!snapshotsQuery.isLoading && rows.length > 0 && (
          <>
            <Alert>
              <Coins className="h-4 w-4" />
              <AlertTitle>
                We found {summary.total} relevant recommended contact{summary.total === 1 ? '' : 's'} — {summary.strong} strong match{summary.strong === 1 ? '' : 'es'}, {summary.good} good match{summary.good === 1 ? '' : 'es'}, {summary.possible} possible.
              </AlertTitle>
              <AlertDescription>
                {summary.includedCount > 0
                  ? `Selecting ${summary.includedCount} contact${summary.includedCount === 1 ? '' : 's'} will use ${summary.includedCredits} Smart Distribution credit${summary.includedCredits === 1 ? '' : 's'} when this campaign sends.`
                  : 'Your own outlet contacts cost 0 credits. Network contacts use 1 credit each, only when selected and successfully sent.'}
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              {rows.map((row) => {
                const isNetwork = row.source === 'network_contact';
                const isDeciding = decidingId === row.id;
                return (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium flex items-center gap-1.5">
                          {isNetwork && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                          {isNetwork ? row.anonymisedLabel : row.displayName}
                        </span>
                        <Badge variant={BAND_VARIANT[row.matchBand]}>{BAND_LABEL[row.matchBand]}</Badge>
                        <Badge variant="outline">{outletLabel(row.outletCategory)}</Badge>
                        <Badge variant="outline" className="gap-1">
                          <Coins className="h-3 w-3" />
                          {row.creditCost === 0 ? 'Your contact — 0 credits' : '1 credit'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{row.rationale}</p>
                      {row.decision !== 'pending' && (
                        <p className="text-xs font-medium text-muted-foreground">
                          {row.decision === 'included' ? 'Included' : 'Marked not relevant'}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant={row.decision === 'included' ? 'default' : 'outline'}
                        disabled={isDeciding}
                        onClick={() => handleDecision(row.id, 'included')}
                      >
                        {isDeciding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Include
                      </Button>
                      <Button
                        size="sm"
                        variant={row.decision === 'not_relevant' ? 'secondary' : 'outline'}
                        disabled={isDeciding}
                        onClick={() => handleDecision(row.id, 'not_relevant')}
                      >
                        <X className="h-4 w-4" />
                        Not relevant
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!snapshotsQuery.isLoading && rows.length === 0 && hasFocusTags && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-muted-foreground">
            <Users className="h-6 w-6" />
            <p className="text-sm">No recommendations yet — generate them to see matched contacts.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
