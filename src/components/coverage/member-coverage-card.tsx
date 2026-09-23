'use client';

/**
 * "Where your story appeared" in the member portal.
 *
 * This is the member-facing half of the Seen → Heard → Renewed loop: a member who can see
 * their own story in print is a member with a reason to renew. Firestore rules let a Partner
 * read only placements whose partnerIds include them, so the query must filter on that; the
 * submission filter is applied client-side.
 */

import { collection, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import type { CoverageRecord } from '@/lib/types';

export function MemberCoverageCard({ orgId, submissionId }: { orgId: string; submissionId?: string }) {
  const { firestore, user } = useFirebase();
  const coverage = useCollection<CoverageRecord>(
    useMemoFirebase(() => {
      if (!user) return null;
      return query(collection(firestore, 'orgs', orgId, 'coverage'), where('partnerIds', 'array-contains', user.uid));
    }, [firestore, orgId, user])
  );

  const records = ((coverage.data || []) as CoverageRecord[])
    .filter((r) => !submissionId || (r.submissionIds || []).includes(submissionId))
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs);

  if (!records.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Where your story appeared</CardTitle>
        <CardDescription>
          {records.length} {records.length === 1 ? 'placement' : 'placements'} so far.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {records.map((r) => (
            <li key={r.id} className="text-sm">
              <div className="font-medium">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 hover:underline">
                    {r.headline}
                    <ExternalLink className="mt-1 h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  r.headline
                )}
              </div>
              <div className="text-muted-foreground">
                {r.outletName} · {format(new Date(r.publishedAtMs), 'd MMM yyyy')}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
