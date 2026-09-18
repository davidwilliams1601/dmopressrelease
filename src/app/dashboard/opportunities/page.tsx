'use client';

/**
 * Media Opportunities queue — the customer-facing surface of the intelligence layer.
 *
 * Read-only by design. The page shows what Press Pilot noticed, what it thinks the
 * organisation could do about it, and the sources behind that view. It cannot send
 * anything and offers no route to a distribution send: see docs/media-opportunities-mvp.md.
 *
 * Three states matter and all three are handled explicitly:
 *  - Add-on not enabled  -> an honest explanation of what the add-on does, no fake data.
 *  - Enabled, nothing found -> "a quiet week" is a legitimate, deliberate result.
 *  - Enabled, 1-5 cards  -> precision over volume; a long list would be the bug.
 */

import { useMemo, useState } from 'react';
import { collection, doc, orderBy, query } from 'firebase/firestore';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { OpportunityCard } from '@/components/opportunities/opportunity-card';
import { OPPORTUNITY_METHODOLOGY_NOTE } from '@/lib/media-opportunities';
import type { MediaOpportunity, MediaOpportunitySettings } from '@/lib/types';
import { Info, Radar } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function OpportunitiesPage() {
  const { orgId, isLoading: isUserLoading } = useUserData();
  const { firestore } = useFirebase();
  const [statusFilter, setStatusFilter] = useState<string>('open');

  const settingsRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return doc(firestore, 'orgs', orgId, 'mediaOpportunitySettings', 'config');
  }, [firestore, orgId]);

  const opportunitiesRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'mediaOpportunities'),
      orderBy('generatedAt', 'desc')
    );
  }, [firestore, orgId]);

  const { data: settings, isLoading: isSettingsLoading } =
    useDoc<MediaOpportunitySettings>(settingsRef);
  const { data: allData, isLoading: isOpportunitiesLoading } =
    useCollection<MediaOpportunity>(opportunitiesRef);
  const all = allData || [];

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return all;
    if (statusFilter === 'open') return all.filter((o) => o.status === 'new' || o.status === 'saved');
    return all.filter((o) => o.status === statusFilter);
  }, [all, statusFilter]);

  if (isUserLoading || isSettingsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isEnabled = settings?.enabled === true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold">Media Opportunities</h1>
        <p className="text-muted-foreground">
          Themes moving in your sector where you have something of your own to say.
        </p>
      </div>

      {!isEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radar className="h-5 w-5" />
              Media Opportunities is not switched on for your organisation
            </CardTitle>
            <CardDescription>
              An add-on to your Press Pilot subscription. It monitors a curated set of
              travel-trade, regional, sector and official sources, groups related coverage into
              themes, and shows you only the themes where your own approved stories give you a
              credible contribution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              It is a recommendation service. It does not contact anyone on your behalf and it
              does not publish or send anything.
            </p>
            <p>
              Speak to us about enabling it, and we will set up your themes and watchlist with
              you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open (new &amp; saved)</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="saved">Saved</SelectItem>
                <SelectItem value="acted_on">Acted on</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            {!isOpportunitiesLoading && (
              <p className="text-sm text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? 'opportunity' : 'opportunities'}
              </p>
            )}
          </div>

          {isOpportunitiesLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {statusFilter === 'open'
                    ? 'Nothing worth your attention this week'
                    : 'Nothing here'}
                </CardTitle>
                <CardDescription>
                  {statusFilter === 'open'
                    ? 'Press Pilot only raises an opportunity when a theme has real momentum across several sources and you have something of your own to contribute. A quiet week is a real answer, not a gap.'
                    : 'Try a different status filter.'}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((opportunity) => (
                <OpportunityCard key={opportunity.id} opportunity={opportunity} />
              ))}
            </div>
          )}

          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Info className="h-4 w-4" />
                How this works
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {OPPORTUNITY_METHODOLOGY_NOTE}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
