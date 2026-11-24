'use client';

/**
 * Per-organisation Media Opportunities configuration, rendered inside Settings.
 *
 * Two deliberate constraints:
 *  1. `enabled` is an org-Admin Active/Paused switch. Media Opportunities is included on
 *     Professional and above, so it is the customer's choice — unless Press Pilot has set
 *     adminDisabledOverride, in which case the switch is hidden and a paused notice shown.
 *  2. Topics and geographies come from the controlled taxonomy (src/lib/media-taxonomy.ts),
 *     the same vocabulary the ingestion tagger uses. Free text is allowed only for the
 *     watchlist, where the point is a destination or member name no taxonomy would carry.
 */

import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_MEDIA_TAXONOMY } from '@/lib/media-taxonomy';
import type { MediaOpportunitySettings } from '@/lib/types';
import { Radar } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useUserData } from '@/hooks/use-user-data';
import { useEntitlements } from '@/hooks/use-entitlements';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';

function TermToggles({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isOn = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          >
            <Badge variant={isOn ? 'default' : 'outline'} className="cursor-pointer">
              {option}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

export function OpportunitySettingsCard({ orgId }: { orgId: string }) {
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const settingsRef = useMemoFirebase(
    () => (orgId ? doc(firestore, 'orgs', orgId, 'mediaOpportunitySettings', 'config') : null),
    [firestore, orgId]
  );
  const { data: settings, isLoading } = useDoc<MediaOpportunitySettings>(settingsRef);
  const { can, isLoading: isEntitlementsLoading } = useEntitlements();
  const canUseOpportunities = can('mediaOpportunities');

  const [topics, setTopics] = useState<string[]>([]);
  const [geographies, setGeographies] = useState<string[]>([]);
  const [muted, setMuted] = useState<string[]>([]);
  const [watchlist, setWatchlist] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const { role } = useUserData();
  const isAdmin = role === 'Admin';
  const isPausedByPressPilot = settings?.adminDisabledOverride === true;

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled === true);
    setTopics(settings.priorityTopics || []);
    setGeographies(settings.priorityGeographies || []);
    setMuted(settings.mutedTopics || []);
    setWatchlist((settings.watchlistTerms || []).join(', '));
  }, [settings]);

  // The same controlled vocabulary the ingestion tagger keys its keyword map to, so a
  // topic a customer selects here is a topic the backend can actually detect.
  const topicOptions = DEFAULT_MEDIA_TAXONOMY.topics;
  const geographyOptions = DEFAULT_MEDIA_TAXONOMY.geography;

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    setIsSaving(true);
    try {
      const call = httpsCallable(getFunctions(), 'updateMediaOpportunitySettings');
      await call({
        orgId,
        // The org Admin's choice. The callable re-checks tier and adminDisabledOverride.
        enabled: isPausedByPressPilot ? false : enabled,
        priorityTopics: topics,
        priorityGeographies: geographies,
        mutedTopics: muted,
        watchlistTerms: watchlist
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      toast({ title: 'Media Opportunities settings saved' });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || isEntitlementsLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!canUseOpportunities) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5" />
            Media Opportunities
          </CardTitle>
          <CardDescription>
            Spots themes moving in your sector&apos;s media and matches them to stories you
            already have.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpgradePrompt feature="mediaOpportunities" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radar className="h-5 w-5" />
          Media Opportunities
          <Badge variant={settings?.enabled ? 'default' : 'secondary'} className="ml-1">
            {settings?.enabled ? 'Active' : isPausedByPressPilot ? 'Paused by Press Pilot' : 'Paused'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Included in your plan. Tell Press Pilot what to watch for you — these settings shape
          which themes reach your opportunities queue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isPausedByPressPilot ? (
          <p className="text-sm text-muted-foreground">
            Press Pilot has paused Media Opportunities for your organisation. Contact Press Pilot
            support to switch it back on.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="mo-enabled">Receive sector themes</Label>
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? 'Switch off to pause new themes. Your settings are kept.'
                  : 'Only an organisation Admin can change this.'}
              </p>
            </div>
            <Switch id="mo-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={!isAdmin} />
          </div>
        )}
        <div className="space-y-2">
          <Label>Priority topics</Label>
          <p className="text-xs text-muted-foreground">
            Leave all unselected and Press Pilot falls back to the tags on your own approved
            stories, so you are never silent by default.
          </p>
          <TermToggles
            options={topicOptions}
            selected={topics}
            onToggle={(v) => toggle(topics, setTopics, v)}
          />
        </div>

        <div className="space-y-2">
          <Label>Priority geographies</Label>
          <p className="text-xs text-muted-foreground">
            Leave unselected to use your organisation&apos;s own region.
          </p>
          <TermToggles
            options={geographyOptions}
            selected={geographies}
            onToggle={(v) => toggle(geographies, setGeographies, v)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="watchlist">Watchlist terms</Label>
          <p className="text-xs text-muted-foreground">
            Comma separated. Your destination, flagship events, venues or named members — the
            things a topic list cannot capture.
          </p>
          <Input
            id="watchlist"
            value={watchlist}
            onChange={(e) => setWatchlist(e.target.value)}
            placeholder="Kent, Canterbury Cathedral, Whitstable Oyster Festival"
          />
        </div>

        <div className="space-y-2">
          <Label>Never surface</Label>
          <p className="text-xs text-muted-foreground">
            Topics to exclude for you regardless of how much coverage they attract.
          </p>
          <TermToggles
            options={topicOptions}
            selected={muted}
            onToggle={(v) => toggle(muted, setMuted, v)}
          />
        </div>

        <Button onClick={save} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save settings'}
        </Button>
      </CardContent>
    </Card>
  );
}
