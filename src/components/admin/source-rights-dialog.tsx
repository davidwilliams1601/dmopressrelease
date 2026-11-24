'use client';

/**
 * Records the rights decision for one media source (Super Admin). A staged source stays
 * switched off and is never fetched until it is cleared here with a written scope.
 */

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { MediaSource } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Decision = 'cleared' | 'refused' | 'pending';

export function SourceRightsDialog({ source }: { source: MediaSource }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(source.rightsNote || '');
  const [enable, setEnable] = useState(false);
  const [saving, setSaving] = useState<Decision | null>(null);

  async function decide(status: Decision) {
    setSaving(status);
    try {
      const call = httpsCallable(getFunctions(), 'setMediaSourceRights');
      await call({ sourceId: source.id, status, note, enable: status === 'cleared' && enable });
      toast({
        title:
          status === 'cleared'
            ? enable
              ? 'Rights cleared and source switched on'
              : 'Rights cleared (source still off)'
            : status === 'refused'
            ? 'Marked refused and switched off'
            : 'Back to rights-pending',
      });
      setOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: err?.message });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs">
          Rights…
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rights for {source.name}</DialogTitle>
          <DialogDescription>
            {source.rightsRef ? `Research pack row ${source.rightsRef}. ` : ''}
            {source.stagingNote || 'A public feed confers no right to collect, store or report on it.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rights-note">Scope and expiry</Label>
            <Textarea
              id="rights-note"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Email from publisher 24 Nov 2026: headline + link + 200-char excerpt, 3-hourly fetch, 90-day retention, customer reports allowed. Review Nov 2027."
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="rights-enable" checked={enable} onCheckedChange={(v) => setEnable(v === true)} />
            <Label htmlFor="rights-enable" className="text-sm font-normal">
              Switch the source on when clearing
            </Label>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" disabled={saving !== null} onClick={() => decide('pending')}>
            Back to pending
          </Button>
          <Button variant="outline" disabled={saving !== null} onClick={() => decide('refused')}>
            Refused
          </Button>
          <Button disabled={saving !== null || note.trim().length < 10} onClick={() => decide('cleared')}>
            Rights cleared
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
