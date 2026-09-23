'use client';

/**
 * Log (or edit) one placement.
 *
 * The fast path is "paste the link, press Fetch details": the server reads the page's title,
 * outlet and date (fetchCoverageMetadata). Everything it fills in stays editable, because
 * publisher metadata is often wrong — a syndicated piece carries the original outlet's name,
 * a live blog carries the date it was first opened.
 *
 * Choosing the release that produced the placement pre-selects the members whose stories went
 * into it (submissions whose usedInReleaseIds contains the release). That is the link that
 * turns a clippings list into member-level proof: "your story, this outlet, this date".
 */

import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, query, serverTimestamp, updateDoc, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  COVERAGE_MEDIA_TYPES,
  COVERAGE_MEDIA_TYPE_LABELS,
  COVERAGE_OUTLET_TYPES,
  COVERAGE_OUTLET_TYPE_LABELS,
  COVERAGE_TONES,
  COVERAGE_TONE_LABELS,
  canonicalCoverageUrl,
  normaliseThemes,
  validateCoverageInput,
  type CoverageMediaType,
  type CoverageOutletType,
  type CoverageTone,
} from '@/lib/coverage-core';
import type { CoverageRecord, PartnerSubmission, Release } from '@/lib/types';

type Member = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  userId: string;
  userName: string;
  releases: Release[];
  members: Member[];
  existing?: CoverageRecord | null;
  /** Records already logged, to warn about a duplicate link. */
  existingRecords?: CoverageRecord[];
  /** Pre-select a release (used from the release detail page). */
  defaultReleaseId?: string | null;
  membersLabel?: string;
};

function toDateInput(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateInput(value: string): number | null {
  if (!value) return null;
  // Midday local time, so a date never slips into the previous day across time zones.
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

export function AddCoverageDialog({
  open,
  onOpenChange,
  orgId,
  userId,
  userName,
  releases,
  members,
  existing,
  existingRecords = [],
  defaultReleaseId,
  membersLabel = 'Members',
}: Props) {
  const { firestore, firebaseApp } = useFirebase();
  const { toast } = useToast();

  const [url, setUrl] = useState('');
  const [headline, setHeadline] = useState('');
  const [outletName, setOutletName] = useState('');
  const [publishedDate, setPublishedDate] = useState('');
  const [mediaType, setMediaType] = useState<CoverageMediaType>('online');
  const [outletType, setOutletType] = useState<CoverageOutletType>('regional');
  const [tone, setTone] = useState<CoverageTone>('positive');
  const [releaseId, setReleaseId] = useState<string>('none');
  const [partnerIds, setPartnerIds] = useState<string[]>([]);
  const [submissionIds, setSubmissionIds] = useState<string[]>([]);
  const [themes, setThemes] = useState('');
  const [fromPressPilotSend, setFromPressPilotSend] = useState(false);
  const [audience, setAudience] = useState('');
  const [audienceSource, setAudienceSource] = useState('');
  const [notes, setNotes] = useState('');
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setErrors([]);
    if (existing) {
      setUrl(existing.url || '');
      setHeadline(existing.headline);
      setOutletName(existing.outletName);
      setPublishedDate(toDateInput(existing.publishedAtMs));
      setMediaType(existing.mediaType);
      setOutletType(existing.outletType);
      setTone(existing.tone);
      setReleaseId(existing.releaseId || 'none');
      setPartnerIds(existing.partnerIds || []);
      setSubmissionIds(existing.submissionIds || []);
      setThemes((existing.themes || []).join(', '));
      setFromPressPilotSend(existing.fromPressPilotSend === true);
      setAudience(existing.reportedAudience ? String(existing.reportedAudience) : '');
      setAudienceSource(existing.reportedAudienceSource || '');
      setNotes(existing.notes || '');
    } else {
      setUrl('');
      setHeadline('');
      setOutletName('');
      setPublishedDate(toDateInput(Date.now()));
      setMediaType('online');
      setOutletType('regional');
      setTone('positive');
      setReleaseId(defaultReleaseId || 'none');
      setPartnerIds([]);
      setSubmissionIds([]);
      setThemes('');
      setFromPressPilotSend(!!defaultReleaseId);
      setAudience('');
      setAudienceSource('');
      setNotes('');
      if (defaultReleaseId) void deriveMembers(defaultReleaseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const releaseById = useMemo(() => new Map(releases.map((r) => [r.id, r])), [releases]);

  const duplicate = useMemo(() => {
    const c = canonicalCoverageUrl(url);
    if (!c) return null;
    return existingRecords.find((r) => r.id !== existing?.id && r.canonicalUrl === c) || null;
  }, [url, existingRecords, existing?.id]);

  async function deriveMembers(nextReleaseId: string) {
    if (!nextReleaseId || nextReleaseId === 'none') return;
    try {
      const snap = await getDocs(
        query(collection(firestore, 'orgs', orgId, 'submissions'), where('usedInReleaseIds', 'array-contains', nextReleaseId))
      );
      const subs = snap.docs.map((d) => ({ ...(d.data() as PartnerSubmission), id: d.id }));
      setSubmissionIds(subs.map((s) => s.id));
      setPartnerIds((prev) => Array.from(new Set([...prev, ...subs.map((s) => s.partnerId).filter(Boolean)])));
    } catch {
      // Not fatal: members can still be picked by hand.
    }
  }

  async function handleFetch() {
    setFetching(true);
    try {
      const fn = httpsCallable(getFunctions(firebaseApp), 'fetchCoverageMetadata');
      const res = await fn({ orgId, url });
      const m = res.data as { headline: string | null; outletName: string | null; publishedAtMs: number | null };
      if (m.headline) setHeadline(m.headline);
      if (m.outletName) setOutletName(m.outletName);
      if (m.publishedAtMs) setPublishedDate(toDateInput(m.publishedAtMs));
      toast({ title: 'Details filled in', description: 'Check them before saving — publisher data is not always right.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not read that link', description: err?.message || 'Fill in the details by hand.' });
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    const publishedAtMs = fromDateInput(publishedDate);
    const reportedAudience = audience.trim() ? Number(audience.replace(/[,\s]/g, '')) : null;
    const input = {
      url,
      headline,
      outletName,
      publishedAtMs,
      mediaType,
      outletType,
      tone,
      reportedAudience,
      reportedAudienceSource: audienceSource,
    };
    const v = validateCoverageInput(input, Date.now());
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    setSaving(true);
    const rel = releaseId !== 'none' ? releaseById.get(releaseId) : undefined;
    const payload = {
      orgId,
      url: url.trim(),
      canonicalUrl: canonicalCoverageUrl(url),
      headline: headline.trim(),
      outletName: outletName.trim(),
      publishedAtMs: publishedAtMs as number,
      mediaType,
      outletType,
      tone,
      releaseId: rel ? rel.id : null,
      releaseHeadline: rel ? rel.headline : null,
      submissionIds: rel ? submissionIds : [],
      partnerIds,
      partnerNames: partnerIds.map((id) => memberName.get(id) || 'Member'),
      themes: normaliseThemes(themes),
      fromPressPilotSend,
      reportedAudience: reportedAudience && reportedAudience > 0 ? Math.round(reportedAudience) : null,
      reportedAudienceSource: reportedAudience && reportedAudience > 0 ? audienceSource.trim() : null,
      notes: notes.trim().slice(0, 2000),
      updatedAt: serverTimestamp(),
    };
    try {
      if (existing) {
        await updateDoc(doc(firestore, 'orgs', orgId, 'coverage', existing.id), {
          ...payload,
          createdById: existing.createdById,
        });
        toast({ title: 'Coverage updated' });
      } else {
        await addDoc(collection(firestore, 'orgs', orgId, 'coverage'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdById: userId,
          createdByName: userName,
        });
        toast({ title: 'Coverage logged' });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: err?.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const unselectedMembers = members.filter((m) => !partnerIds.includes(m.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit coverage' : 'Log coverage'}</DialogTitle>
          <DialogDescription>
            One record per placement. Link it to the release and {membersLabel.toLowerCase()} it came from so it counts in their reports.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cov-url">Link</Label>
            <div className="flex gap-2">
              <Input id="cov-url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button type="button" variant="outline" onClick={handleFetch} disabled={fetching || !url.trim()}>
                {fetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Fetch details
              </Button>
            </div>
            {duplicate && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                This link is already logged as “{duplicate.headline}” ({duplicate.outletName}).
              </p>
            )}
            <p className="text-xs text-muted-foreground">Leave blank for print or broadcast with no online version.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cov-headline">Headline</Label>
            <Input id="cov-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="cov-outlet">Outlet</Label>
              <Input id="cov-outlet" value={outletName} onChange={(e) => setOutletName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cov-date">Published</Label>
              <Input id="cov-date" type="date" value={publishedDate} onChange={(e) => setPublishedDate(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Media type</Label>
              <Select value={mediaType} onValueChange={(v) => setMediaType(v as CoverageMediaType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COVERAGE_MEDIA_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{COVERAGE_MEDIA_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Reach</Label>
              <Select value={outletType} onValueChange={(v) => setOutletType(v as CoverageOutletType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COVERAGE_OUTLET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{COVERAGE_OUTLET_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as CoverageTone)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COVERAGE_TONES.map((t) => (
                    <SelectItem key={t} value={t}>{COVERAGE_TONE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {tone === 'sensitive' && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Sensitive placements are left out of shared reports unless you choose to include them.
            </p>
          )}

          <div className="grid gap-2">
            <Label>Release</Label>
            <Select
              value={releaseId}
              onValueChange={(v) => {
                setReleaseId(v);
                if (v !== 'none') {
                  setFromPressPilotSend(releaseById.get(v)?.status === 'Sent');
                  void deriveMembers(v);
                } else {
                  setSubmissionIds([]);
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Not linked to a release" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked to a release</SelectItem>
                {releases.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.headline || 'Untitled'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>{membersLabel} featured</Label>
            <div className="flex flex-wrap gap-2">
              {partnerIds.length === 0 && <span className="text-sm text-muted-foreground">None selected</span>}
              {partnerIds.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1">
                  {memberName.get(id) || 'Member'}
                  <button
                    type="button"
                    aria-label={`Remove ${memberName.get(id) || 'member'}`}
                    onClick={() => setPartnerIds((prev) => prev.filter((p) => p !== id))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            {unselectedMembers.length > 0 && (
              <Select value="" onValueChange={(v) => v && setPartnerIds((prev) => Array.from(new Set([...prev, v])))}>
                <SelectTrigger className="sm:w-72"><SelectValue placeholder={`Add a ${membersLabel.toLowerCase().replace(/s$/, '')}`} /></SelectTrigger>
                <SelectContent>
                  {unselectedMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cov-themes">Themes</Label>
            <Input id="cov-themes" placeholder="e.g. Food and drink, Sustainability" value={themes} onChange={(e) => setThemes(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="cov-sent">Followed a Press Pilot send</Label>
              <p className="text-xs text-muted-foreground">Turn off for coverage that came from elsewhere.</p>
            </div>
            <Switch id="cov-sent" checked={fromPressPilotSend} onCheckedChange={setFromPressPilotSend} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="cov-aud">Reported audience (optional)</Label>
              <Input id="cov-aud" inputMode="numeric" placeholder="e.g. 250000" value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cov-aud-src">Where that figure comes from</Label>
              <Input id="cov-aud-src" placeholder="e.g. Publisher media pack, 2026" value={audienceSource} onChange={(e) => setAudienceSource(e.target.value)} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Only record a figure the outlet or a named third party publishes. Press Pilot does not estimate reach or advertising value.
          </p>

          <div className="grid gap-2">
            <Label htmlFor="cov-notes">Notes</Label>
            <Textarea id="cov-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Seen by your team and any {membersLabel.toLowerCase()} featured. Never included in a shared report.
            </p>
          </div>

          {errors.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existing ? 'Save changes' : 'Log coverage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
