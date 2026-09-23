'use client';

/**
 * Opportunity → draft release.
 *
 * Replaces a "Start a draft" link that pointed at /dashboard/releases/new, a route that has
 * never existed. The dialog does three things and deliberately nothing more:
 *
 *  1. Suggests members who could give the story a local face, each with the reasons it was
 *     suggested (profile category, recent story themes, place, keywords). The team picks.
 *  2. Creates a Draft release seeded with a working title and bracketed prompts shaped by the
 *     suggested action. Holding text is flagged, so the existing send gate blocks it until a
 *     person has written the story. No generated copy, no quotes put in anyone's mouth.
 *  3. Marks the opportunity acted on with the release attached, so the chain
 *     opportunity → release → coverage can be counted later.
 *
 * Members, stories and releases are only read while the dialog is open.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import { useOrganization } from '@/hooks/use-organization';
import { useToast } from '@/hooks/use-toast';
import { getVerticalConfig } from '@/lib/verticals';
import { toDate } from '@/lib/utils';
import {
  buildOpportunityDraftSeed,
  rankMembersForOpportunity,
  type MemberSuggestion,
} from '@/lib/opportunity-draft-core';
import type { MediaOpportunity, PartnerSubmission, User } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Loader2 } from 'lucide-react';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function StartDraftDialog({
  opportunity,
  onCreated,
}: {
  opportunity: MediaOpportunity;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileText className="mr-1.5 h-4 w-4" />
          Start a draft
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {open && <StartDraftBody opportunity={opportunity} onDone={() => { setOpen(false); onCreated?.(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function StartDraftBody({ opportunity, onDone }: { opportunity: MediaOpportunity; onDone: () => void }) {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const orgId = opportunity.orgId;
  const { organization } = useOrganization(orgId);
  const vertical = getVerticalConfig(organization?.vertical);
  const memberWord = vertical.nav?.partnersSettings || 'Members';

  const membersQ = useCollection<User>(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'users'), where('role', '==', 'Partner')),
      [firestore, orgId]
    )
  );
  const storiesQ = useCollection<PartnerSubmission>(
    useMemoFirebase(() => query(collection(firestore, 'orgs', orgId, 'submissions')), [firestore, orgId])
  );

  const suggestions: MemberSuggestion[] = useMemo(() => {
    const members = ((membersQ.data || []) as User[]).map((u) => ({
      id: u.id,
      name: u.name || u.email || 'Member',
      businessDescription: u.businessDescription,
      businessCategories: u.businessCategories,
    }));
    const stories = ((storiesQ.data || []) as PartnerSubmission[]).map((s) => ({
      id: s.id,
      partnerId: s.partnerId,
      title: s.title,
      aiThemes: s.aiThemes,
      status: s.status,
      createdAtMs: s.createdAt ? toDate(s.createdAt).getTime() : null,
    }));
    return rankMembersForOpportunity({ opportunity, members, stories });
  }, [membersQ.data, storiesQ.data, opportunity]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [headline, setHeadline] = useState(() => buildOpportunityDraftSeed(opportunity).headline);
  const [campaignType, setCampaignType] = useState<string>('');
  const [audience, setAudience] = useState<string>('');
  const [targetMarket, setTargetMarket] = useState<string>(opportunity.geographyTags?.[0] || '');
  const [saving, setSaving] = useState(false);

  const loading = membersQ.isLoading || storiesQ.isLoading;
  const canSave = headline.trim() && campaignType && audience && targetMarket.trim() && !saving;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    setSaving(true);
    try {
      const chosen = suggestions.filter((s) => picked.has(s.memberId));
      const seed = buildOpportunityDraftSeed(opportunity, chosen);
      const ref = doc(collection(firestore, 'orgs', orgId, 'releases'));
      const title = headline.trim();
      // Awaited rather than non-blocking: the opportunity is only marked acted on once the
      // release it points at actually exists.
      await setDoc(ref, {
        orgId,
        headline: title,
        slug: slugify(title),
        campaignType,
        targetMarket: targetMarket.trim(),
        audience,
        bodyCopy: seed.bodyCopy,
        notesToEditors: null,
        hasHoldingText: seed.hasHoldingText,
        status: 'Draft',
        createdAt: serverTimestamp(),
        sends: 0,
        opens: 0,
        clicks: 0,
        imageUrl: null,
        imageStoragePath: null,
        imageMetadata: null,
        sourceOpportunityId: opportunity.id,
        sourceOpportunityTitle: opportunity.title,
        suggestedPartnerIds: chosen.map((c) => c.memberId),
      });
      try {
        await httpsCallable(getFunctions(), 'setMediaOpportunityStatus')({
          orgId,
          opportunityId: opportunity.id,
          status: 'acted_on',
          releaseId: ref.id,
        });
      } catch {
        // The draft exists; failing to flip the card is not worth losing the user's place.
      }
      toast({ title: 'Draft created', description: 'Replace the bracketed prompts, then untick holding text to send.' });
      onDone();
      router.push(`/dashboard/releases/${ref.id}`);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not create the draft', description: err?.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Start a draft from this opportunity</DialogTitle>
        <DialogDescription>
          Creates a draft release with prompts to replace. Nothing is written for you and nothing is sent.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label htmlFor="opp-headline">Working headline</Label>
          <Input id="opp-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={200} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>Campaign type</Label>
            <Select value={campaignType} onValueChange={setCampaignType}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {vertical.campaignTypes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {vertical.ai.audienceOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="opp-market">Target market</Label>
            <Input id="opp-market" value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)} placeholder="e.g. UK" />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>{memberWord} who could give this a local face</Label>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking profiles and recent stories
            </p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No {memberWord.toLowerCase()} matched on profile categories, recent stories or place. Richer
              profiles (categories and a short description) make this list useful.
            </p>
          ) : (
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s.memberId} className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    id={`m-${s.memberId}`}
                    checked={picked.has(s.memberId)}
                    onCheckedChange={() => toggle(s.memberId)}
                    className="mt-0.5"
                  />
                  <label htmlFor={`m-${s.memberId}`} className="grid cursor-pointer gap-0.5">
                    <span className="text-sm font-medium">{s.memberName}</span>
                    <span className="text-xs text-muted-foreground">{s.reasons.join(' · ')}</span>
                    {s.storyTitles.length > 0 && (
                      <span className="text-xs text-muted-foreground">Stories: {s.storyTitles.join('; ')}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Ticked names go into the draft as a prompt to ask them. Nobody is contacted and no quote is written.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button type="button" onClick={create} disabled={!canSave}>
          {saving ? 'Creating…' : 'Create draft'}
        </Button>
      </DialogFooter>
    </>
  );
}
