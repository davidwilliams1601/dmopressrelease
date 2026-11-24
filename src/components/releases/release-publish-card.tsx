'use client';

/**
 * Newsroom & email status for one release (Day-1 fix QW-06 / QW-08).
 *
 * Two independent facts, never merged into one "Sent" badge:
 *  - Newsroom: is the release publicly readable? Team members can publish a Ready release
 *    to the newsroom without emailing anyone (newsroomVisible). Legacy 'Sent' releases are
 *    always public.
 *  - Email: what actually happened to the journalist send, from Cloud Function-written
 *    distributionStatus and deliverySummary (accepted / delivered / bounced / failed).
 *    "Accepted" means SendGrid took the message, not that it reached an inbox.
 */

import { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import type { Release } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  DISTRIBUTION_CLASSES,
  DISTRIBUTION_LABELS,
  effectiveDistributionStatus,
  isInNewsroom,
} from '@/lib/release-status';
import { Globe, Mail } from 'lucide-react';

export function ReleasePublishCard({ release, orgId }: { release: Release; orgId: string }) {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const legacySent = release.status === 'Sent';
  const inNewsroom = isInNewsroom(release);
  const awaitingApproval = release.approvalStatus === 'pending';
  const canToggle = !legacySent && release.status === 'Ready' && !awaitingApproval;
  const distribution = effectiveDistributionStatus(release);
  const summary = release.deliverySummary || {};

  async function setNewsroom(visible: boolean) {
    setIsSaving(true);
    try {
      await updateDoc(doc(firestore, 'orgs', orgId, 'releases', release.id), {
        newsroomVisible: visible,
        ...(visible && !release.publishedAt ? { publishedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      });
      toast({ title: visible ? 'Published to your newsroom' : 'Removed from your newsroom' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not update newsroom', description: err?.message || 'Please try again.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Newsroom &amp; email</CardTitle>
        <CardDescription>
          Publishing to your newsroom and emailing journalists are separate steps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="newsroom-visible" className="flex items-center gap-2">
              <Globe className="h-4 w-4" aria-hidden="true" />
              Publish to newsroom
            </Label>
            <p className="text-xs text-muted-foreground">
              {legacySent
                ? 'Sent releases are always public in your newsroom.'
                : awaitingApproval
                ? 'Available once this release is approved.'
                : release.status !== 'Ready'
                ? 'Set the release to Ready to publish it.'
                : inNewsroom
                ? 'Public on your newsroom page and permalink.'
                : 'Make it public on your newsroom page without emailing anyone.'}
            </p>
          </div>
          <Switch
            id="newsroom-visible"
            checked={inNewsroom}
            disabled={!canToggle || isSaving}
            onCheckedChange={setNewsroom}
          />
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4" aria-hidden="true" />
            Email to journalists
            <Badge className={DISTRIBUTION_CLASSES[distribution]} variant={DISTRIBUTION_CLASSES[distribution] ? undefined : 'outline'}>
              {DISTRIBUTION_LABELS[distribution]}
            </Badge>
          </div>
          {release.deliverySummary && (
            <p className="text-sm text-muted-foreground">
              {summary.accepted ?? 0} accepted by the mail service
              {' \u2022 '}
              {summary.delivered ?? 0} delivered
              {(summary.bounced ?? 0) > 0 && <>{' \u2022 '}{summary.bounced} bounced</>}
              {(summary.failed ?? 0) > 0 && <>{' \u2022 '}{summary.failed} failed</>}
            </p>
          )}
          {!release.deliverySummary && legacySent && (
            <p className="text-xs text-muted-foreground">
              Sent before delivery tracking was added. Send History shows per-send counts.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
