'use client';

/**
 * One Media Opportunity, rendered so a customer can judge it without trusting us.
 *
 * Layout rules that are product decisions, not styling choices:
 *  1. The deterministic evidence line ("4 items across 3 sources in the past 5 days")
 *     sits directly under the generated summary, so a reader always sees the measured
 *     fact next to the interpretation of it.
 *  2. Every source is a real outbound link with its real publication date. If we cannot
 *     show that, the card should never have been written (generation enforces >= 2).
 *  3. The caveat is always visible — not behind a tooltip, not in small print.
 *  4. There is no "send" on this card. The MVP ends at save / brief / dismiss. Any route
 *     from an opportunity to a distribution send is deliberately absent.
 */

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { formatTimestamp } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  OPPORTUNITY_ACTION_DESCRIPTIONS,
  OPPORTUNITY_ACTION_LABELS,
  OPPORTUNITY_CONFIDENCE_EXPLANATIONS,
  OPPORTUNITY_CONFIDENCE_LABELS,
  OPPORTUNITY_FEEDBACK_LABELS,
  OPPORTUNITY_MOMENTUM_EXPLANATIONS,
  OPPORTUNITY_MOMENTUM_LABELS,
  OPPORTUNITY_URGENCY_LABELS,
  describeEvidence,
  type MediaOpportunityFeedbackReason,
} from '@/lib/media-opportunities';
import type { MediaOpportunity } from '@/lib/types';
import {
  Bookmark,
  CheckCircle2,
  ExternalLink,
  FileText,
  MessageSquare,
  X,
} from 'lucide-react';

const URGENCY_VARIANT: Record<MediaOpportunity['urgency'], 'default' | 'secondary' | 'outline'> = {
  today: 'default',
  this_week: 'secondary',
  plan_ahead: 'outline',
};

const FEEDBACK_REASONS: MediaOpportunityFeedbackReason[] = [
  'relevant',
  'not_relevant',
  'too_late',
  'no_angle',
  'wrong_geography',
  'sensitive_subject',
];

export function OpportunityCard({
  opportunity,
  onChanged,
}: {
  opportunity: MediaOpportunity;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const isResolved =
    opportunity.status === 'dismissed' ||
    opportunity.status === 'acted_on' ||
    opportunity.status === 'expired';

  async function setStatus(status: 'saved' | 'dismissed' | 'acted_on' | 'new') {
    setBusy(status);
    try {
      const call = httpsCallable(getFunctions(), 'setMediaOpportunityStatus');
      await call({ orgId: opportunity.orgId, opportunityId: opportunity.id, status });
      toast({
        title:
          status === 'saved'
            ? 'Saved to your shortlist'
            : status === 'dismissed'
              ? 'Dismissed'
              : status === 'acted_on'
                ? 'Marked as acted on'
                : 'Reopened',
      });
      onChanged?.();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Could not update this opportunity',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function sendFeedback(reason: MediaOpportunityFeedbackReason) {
    setBusy('feedback');
    try {
      const call = httpsCallable(getFunctions(), 'submitMediaOpportunityFeedback');
      await call({ orgId: opportunity.orgId, opportunityId: opportunity.id, reason });
      toast({
        title: 'Thank you — that helps',
        description:
          reason === 'relevant'
            ? 'We will look for more like this one.'
            : 'We will use this to stop surfacing opportunities like this one.',
      });
      onChanged?.();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Could not record that',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={isResolved ? 'opacity-70' : undefined}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={URGENCY_VARIANT[opportunity.urgency]}>
            {OPPORTUNITY_URGENCY_LABELS[opportunity.urgency]}
          </Badge>
          <Badge variant="outline" title={OPPORTUNITY_MOMENTUM_EXPLANATIONS[opportunity.momentum]}>
            {OPPORTUNITY_MOMENTUM_LABELS[opportunity.momentum]}
          </Badge>
          <Badge
            variant="outline"
            title={OPPORTUNITY_CONFIDENCE_EXPLANATIONS[opportunity.confidence]}
          >
            {OPPORTUNITY_CONFIDENCE_LABELS[opportunity.confidence]} confidence
          </Badge>
          {opportunity.status !== 'new' && (
            <Badge variant="secondary">
              {opportunity.status === 'saved'
                ? 'Saved'
                : opportunity.status === 'dismissed'
                  ? 'Dismissed'
                  : opportunity.status === 'acted_on'
                    ? 'Acted on'
                    : 'Expired'}
            </Badge>
          )}
        </div>

        <CardTitle className="text-lg leading-snug">{opportunity.title}</CardTitle>

        <p className="text-sm text-muted-foreground">{opportunity.summary}</p>

        {/* The measured fact, immediately below the interpretation of it. */}
        <p className="text-xs font-medium text-foreground">
          {describeEvidence(
            opportunity.itemCount,
            opportunity.distinctSourceCount,
            opportunity.windowDays
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="text-sm font-semibold">
            {OPPORTUNITY_ACTION_LABELS[opportunity.suggestedAction]}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {OPPORTUNITY_ACTION_DESCRIPTIONS[opportunity.suggestedAction]}
          </p>
        </div>

        {opportunity.rationale?.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Why you
            </h4>
            <ul className="list-inside list-disc space-y-1 text-sm">
              {opportunity.rationale.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sources
          </h4>
          <ul className="space-y-1.5">
            {opportunity.evidence.map((e) => (
              <li key={e.mediaItemId} className="text-sm">
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-start gap-1.5 hover:underline"
                >
                  <span>{e.title}</span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                </a>
                <span className="block text-xs text-muted-foreground">
                  {e.sourceName} · {formatTimestamp(e.publishedAt, 'd MMM yyyy')}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {opportunity.matchedReleaseHeadlines && opportunity.matchedReleaseHeadlines.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Your matching stories
            </h4>
            <ul className="list-inside list-disc space-y-1 text-sm">
              {opportunity.matchedReleaseHeadlines.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Always visible, never behind a tooltip. */}
        <p className="text-xs italic text-muted-foreground">{opportunity.caveat}</p>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {opportunity.status !== 'saved' && !isResolved && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => setStatus('saved')}
            >
              <Bookmark className="mr-1.5 h-4 w-4" />
              Save
            </Button>
          )}

          {!isResolved && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => setStatus('acted_on')}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              We acted on this
            </Button>
          )}

          {/*
            Deliberately a link to the release composer with the theme pre-filled as a
            starting point — not a generated draft, and definitely not a send. The person
            writes it; Press Pilot only tells them what is worth writing about.
          */}
          <Button size="sm" variant="outline" asChild>
            <a
              href={`/dashboard/releases/new?theme=${encodeURIComponent(opportunity.title)}`}
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Start a draft
            </a>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={busy !== null}>
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Give feedback
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Was this worth showing you?</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {FEEDBACK_REASONS.map((reason) => (
                <DropdownMenuItem key={reason} onClick={() => sendFeedback(reason)}>
                  {OPPORTUNITY_FEEDBACK_LABELS[reason]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {!isResolved && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-muted-foreground"
              disabled={busy !== null}
              onClick={() => setStatus('dismissed')}
            >
              <X className="mr-1.5 h-4 w-4" />
              Dismiss
            </Button>
          )}

          {opportunity.status === 'dismissed' && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={busy !== null}
              onClick={() => setStatus('new')}
            >
              Undo dismiss
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
