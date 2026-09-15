'use client';

/**
 * Create or edit a Destination Brief prospect.
 *
 * The field that matters is `watchTerms`. Everything interesting a brief says — "you were
 * in this theme", "this ran without you" — is decided by whether one of these terms appears
 * in the coverage. So the form explains that rather than presenting it as one input among
 * many, and terms under three characters are dropped server-side.
 */

import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_MEDIA_TAXONOMY } from '@/lib/media-taxonomy';
import type { MediaProspect, VerticalId } from '@/lib/types';

const VERTICALS: VerticalId[] = ['dmo', 'charity', 'trade-body', 'publisher', 'education'];

export function ProspectFormDialog({
  open,
  onOpenChange,
  prospect,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect?: MediaProspect | null;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState('');
  const [organisationType, setOrganisationType] = useState('');
  const [country, setCountry] = useState('');
  const [vertical, setVertical] = useState<VerticalId>('dmo');
  const [watchTerms, setWatchTerms] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [geographies, setGeographies] = useState<string[]>([]);
  const [campaign, setCampaign] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(prospect?.name || '');
    setOrganisationType(prospect?.organisationType || '');
    setCountry(prospect?.country || '');
    setVertical(prospect?.vertical || 'dmo');
    setWatchTerms((prospect?.watchTerms || []).join(', '));
    setTopics(prospect?.priorityTopics || []);
    setGeographies(prospect?.priorityGeographies || []);
    setCampaign(prospect?.campaign || '');
    setContactName(prospect?.contactName || '');
    setContactRole(prospect?.contactRole || '');
    setNotes(prospect?.notes || '');
  }, [open, prospect]);

  const parsedTerms = watchTerms
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const tooShort = parsedTerms.filter((t) => t.length < 3);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    setIsSaving(true);
    try {
      const call = httpsCallable(getFunctions(), 'upsertMediaProspect');
      await call({
        prospectId: prospect?.id,
        name,
        organisationType,
        country,
        vertical,
        watchTerms: parsedTerms,
        priorityTopics: topics,
        priorityGeographies: geographies,
        campaign,
        contactName,
        contactRole,
        notes,
      });
      toast({ title: prospect ? 'Prospect updated' : 'Prospect added' });
      onOpenChange(false);
      onSaved?.();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prospect ? 'Edit prospect' : 'Add prospect'}</DialogTitle>
          <DialogDescription>
            Briefs are built from feeds already ingested by Press Pilot. Nothing here triggers
            any new fetching.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-name">Organisation name</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Visit Kent" />
            </div>
            <div>
              <Label htmlFor="p-type">Organisation type</Label>
              <Input
                id="p-type"
                value={organisationType}
                onChange={(e) => setOrganisationType(e.target.value)}
                placeholder="Regional DMO"
              />
            </div>
            <div>
              <Label htmlFor="p-country">Country / region</Label>
              <Input id="p-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United Kingdom" />
            </div>
            <div>
              <Label htmlFor="p-vertical">Source set</Label>
              <Select value={vertical} onValueChange={(v) => setVertical(v as VerticalId)}>
                <SelectTrigger id="p-vertical">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERTICALS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="p-terms">Watch terms</Label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Comma separated. The organisation&apos;s name, its destination, flagship events,
              venues and notable members. These decide whether the brief can say a theme ran
              without them, so be generous but precise. Terms shorter than three characters are
              ignored.
            </p>
            <Input
              id="p-terms"
              value={watchTerms}
              onChange={(e) => setWatchTerms(e.target.value)}
              placeholder="Visit Kent, Canterbury, Whitstable, Turner Contemporary"
            />
            {tooShort.length > 0 && (
              <p className="mt-1 text-xs text-destructive">
                Ignored as too short: {tooShort.join(', ')}
              </p>
            )}
          </div>

          <div>
            <Label>Priority topics</Label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Leave all unselected to consider every topic present in the window.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_MEDIA_TAXONOMY.topics.map((topic) => (
                <button key={topic} type="button" onClick={() => toggle(topics, setTopics, topic)}>
                  <Badge variant={topics.includes(topic) ? 'default' : 'outline'} className="cursor-pointer">
                    {topic}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Priority geographies</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DEFAULT_MEDIA_TAXONOMY.geography.map((geo) => (
                <button key={geo} type="button" onClick={() => toggle(geographies, setGeographies, geo)}>
                  <Badge variant={geographies.includes(geo) ? 'default' : 'outline'} className="cursor-pointer">
                    {geo}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="p-campaign">Campaign</Label>
              <Input id="p-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="WTM 2026" />
            </div>
            <div>
              <Label htmlFor="p-contact">Contact</Label>
              <Input id="p-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-role">Contact role</Label>
              <Input id="p-role" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="p-notes">Internal notes</Label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Never rendered on a printed brief.
            </p>
            <Textarea id="p-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isSaving || !name.trim()}>
            {isSaving ? 'Saving…' : 'Save prospect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
