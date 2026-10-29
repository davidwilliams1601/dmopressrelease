'use client';

/**
 * Loads everything the follow-up view needs for one sent release and turns it into a
 * plan with the shared rules in src/lib/follow-up-core.ts.
 *
 * Sources, in order of preference for each recipient:
 *  1. The per-recipient send rows (sendJobs/{id}/recipients), which carry a snapshot of
 *     the contact and the engagement the webhook records against that exact row.
 *  2. Tracked events matched by email, for sends made before rows carried engagement.
 *  3. For very old jobs with no rows at all, the outlet lists the job was sent to.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { toDate } from '@/lib/utils';
import {
  buildFollowUpPlan,
  followUpKey,
  type Contact,
  type FollowUpPlan,
  type FollowUpRecord,
  type SentRecipient,
} from '@/lib/follow-up-core';
import type { EmailEvent, Recipient, Release, ReleaseFollowUp, SendJob, SendJobRecipient } from '@/lib/types';

const ms = (t: unknown): number | undefined => (t ? toDate(t).getTime() : undefined);

export function useFollowUpPlan(orgId: string, release: Release) {
  const firestore = useFirestore();
  const releaseId = release.id;

  const jobs = useCollection<SendJob>(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'sendJobs'), where('releaseId', '==', releaseId), orderBy('createdAt', 'desc')),
      [firestore, orgId, releaseId]
    )
  );
  const events = useCollection<EmailEvent>(
    useMemoFirebase(
      () =>
        query(
          collection(firestore, 'orgs', orgId, 'events'),
          where('releaseId', '==', releaseId),
          orderBy('timestamp', 'desc'),
          limit(2000)
        ),
      [firestore, orgId, releaseId]
    )
  );
  const followUps = useCollection<ReleaseFollowUp>(
    useMemoFirebase(
      () => collection(firestore, 'orgs', orgId, 'releases', releaseId, 'followUps'),
      [firestore, orgId, releaseId]
    )
  );
  // Every contact the org holds, across all lists (see outlets/[listId] for why the
  // outletListId filter separates these from send-job rows of the same collection ID).
  const allRecipients = useCollection<Recipient>(
    useMemoFirebase(() => query(collectionGroup(firestore, 'recipients'), where('orgId', '==', orgId)), [firestore, orgId])
  );

  const completedJobs = useMemo(
    () => (jobs.data || []).filter((j) => j.status === 'completed'),
    [jobs.data]
  );
  const jobKey = completedJobs.map((j) => j.id).join(',');

  const [rowsByJob, setRowsByJob] = useState<Record<string, SendJobRecipient[]>>({});
  useEffect(() => {
    const unsubs = completedJobs.map((job) =>
      onSnapshot(
        collection(firestore, 'orgs', orgId, 'sendJobs', job.id, 'recipients'),
        (snap) =>
          setRowsByJob((prev) => ({
            ...prev,
            [job.id]: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SendJobRecipient, 'id'>) })),
          })),
        () => setRowsByJob((prev) => ({ ...prev, [job.id]: [] }))
      )
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, orgId, jobKey]);

  const contacts: Array<Contact & { outletListId: string }> = useMemo(
    () =>
      (allRecipients.data || [])
        .filter((r) => typeof r.outletListId === 'string')
        .map((r) => ({
          recipientRef: `orgs/${orgId}/outletLists/${r.outletListId}/recipients/${r.id}`,
          outletListId: r.outletListId,
          name: r.name,
          email: r.email,
          outlet: r.outlet,
          position: r.position,
          editorialFocus: r.editorialFocus,
          topics: r.topics,
          relationshipStatus: r.relationshipStatus,
          doNotContact: r.doNotContact,
        })),
    [allRecipients.data, orgId]
  );

  const plan: FollowUpPlan | null = useMemo(() => {
    if (jobs.isLoading || allRecipients.isLoading) return null;
    const contactByRef = new Map(contacts.map((c) => [c.recipientRef, c]));

    // Engagement from tracked events, by email (fallback for older rows).
    const byEmail = new Map<string, { opens: number; clicks: number; bounced: boolean; optedOut: boolean }>();
    for (const e of events.data || []) {
      if (!e.recipientEmail) continue;
      const k = e.recipientEmail.toLowerCase();
      const v = byEmail.get(k) || { opens: 0, clicks: 0, bounced: false, optedOut: false };
      if (e.eventType === 'open') v.opens++;
      if (e.eventType === 'click') v.clicks++;
      if (e.eventType === 'bounce') v.bounced = true;
      if (e.eventType === 'unsubscribe' || e.eventType === 'spam_report') v.optedOut = true;
      byEmail.set(k, v);
    }

    const recipients = new Map<string, SentRecipient>();
    const add = (r: SentRecipient) => {
      const existing = recipients.get(r.key);
      if (!existing || r.sentAtMs < existing.sentAtMs) recipients.set(r.key, r);
    };

    // Oldest first, so a contact's first send is the one that counts.
    for (const job of [...completedJobs].reverse()) {
      const sentAtMs = ms(job.completedAt) ?? ms(job.createdAt) ?? Date.now();
      const rows = rowsByJob[job.id];
      if (rows === undefined) continue; // still loading
      if (rows.length > 0) {
        for (const row of rows) {
          if (row.networkContactRef) {
            add({
              key: `n_${row.id}`,
              name: 'Press Pilot network contact',
              outlet: '',
              source: 'network',
              sentAtMs,
              delivery: deliveryOf(row.deliveryStatus),
              opens: row.opens || 0,
              clicks: row.clicks || 0,
              optedOut: !!row.optedOut,
            });
            continue;
          }
          const c = row.recipientRef ? contactByRef.get(row.recipientRef) : undefined;
          const email = row.email || c?.email;
          const ev = email ? byEmail.get(email.toLowerCase()) : undefined;
          let delivery = deliveryOf(row.deliveryStatus);
          if (ev?.bounced && delivery === 'delivered') delivery = 'bounced';
          add({
            key: followUpKey(row.recipientRef || email || row.id),
            recipientRef: row.recipientRef,
            name: row.name || c?.name || email || 'Unknown contact',
            email,
            outlet: row.outlet || c?.outlet || '',
            position: c?.position,
            source: 'customer',
            sentAtMs,
            delivery,
            opens: Math.max(row.opens || 0, ev?.opens || 0),
            clicks: Math.max(row.clicks || 0, ev?.clicks || 0),
            optedOut: !!row.optedOut || !!ev?.optedOut,
            editorialFocus: c?.editorialFocus,
            topics: c?.topics,
          });
        }
      } else {
        // Very old job with no per-recipient rows: reconstruct from its lists.
        const excluded = new Set(job.excludedRecipientRefs || []);
        for (const c of contacts) {
          if (!job.outletListIds?.includes(c.outletListId) || excluded.has(c.recipientRef)) continue;
          if (job.targetRecipientRefs && !job.targetRecipientRefs.includes(c.recipientRef)) continue;
          const ev = c.email ? byEmail.get(c.email.toLowerCase()) : undefined;
          add({
            key: followUpKey(c.recipientRef),
            recipientRef: c.recipientRef,
            name: c.name,
            email: c.email,
            outlet: c.outlet,
            position: c.position,
            source: 'customer',
            sentAtMs,
            delivery: ev?.bounced ? 'bounced' : 'delivered',
            opens: ev?.opens || 0,
            clicks: ev?.clicks || 0,
            optedOut: !!ev?.optedOut,
            editorialFocus: c.editorialFocus,
            topics: c.topics,
          });
        }
      }
    }

    const records: Record<string, FollowUpRecord> = {};
    for (const f of followUps.data || []) {
      records[f.id] = {
        status: f.status,
        outcome: f.outcome ?? null,
        channel: f.channel ?? null,
        count: f.count,
        updatedAtMs: ms(f.updatedAt) ?? Date.now(),
        alternativeRecipientRef: f.alternativeRecipientRef,
        alternativeName: f.alternativeName,
      };
    }

    return buildFollowUpPlan({
      recipients: Array.from(recipients.values()),
      records,
      contacts,
      releaseFocus: {
        editorialFocus: release.smartDistribution?.editorialFocus,
        topics: release.smartDistribution?.topics,
      },
      nowMs: Date.now(),
    });
  }, [jobs.isLoading, allRecipients.isLoading, contacts, events.data, completedJobs, rowsByJob, followUps.data, release.smartDistribution]);

  const records = useMemo(() => {
    const m: Record<string, ReleaseFollowUp> = {};
    for (const f of followUps.data || []) m[f.id] = f;
    return m;
  }, [followUps.data]);

  const hasPendingJob = (jobs.data || []).some((j) => j.status === 'pending' || j.status === 'processing');

  return { plan, records, isLoading: plan === null, error: jobs.error || allRecipients.error, hasPendingJob };
}

function deliveryOf(status: SendJobRecipient['deliveryStatus']): SentRecipient['delivery'] {
  switch (status) {
    case 'bounced_hard':
      return 'bounced';
    case 'failed':
      return 'failed';
    case 'suppressed':
      return 'suppressed';
    case 'pending':
      return 'pending';
    default:
      return 'delivered';
  }
}
