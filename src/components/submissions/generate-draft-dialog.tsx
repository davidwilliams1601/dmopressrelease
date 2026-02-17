'use client';

import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useRouter } from 'next/navigation';
import { generateDraftFromSubmissions } from '@/ai/flows/generate-draft-from-submissions';
import type { PartnerSubmission, Tag, Organization } from '@/lib/types';

type GenerateDraftDialogProps = {
  orgId: string;
  submissions: PartnerSubmission[];
  tags: Tag[];
  onDraftCreated: () => void;
};

export function GenerateDraftDialog({
  orgId,
  submissions,
  tags,
  onDraftCreated,
}: GenerateDraftDialogProps) {
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetMarket, setTargetMarket] = useState('');
  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState<{
    headline: string;
    bodyCopy: string;
    suggestedCampaignType: string;
    suggestedAudience: string;
  } | null>(null);
  const { firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const tagMap = new Map(tags.map((t) => [t.id, t]));

  const orgRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return doc(firestore, 'orgs', orgId);
  }, [firestore, orgId]);

  const { data: org } = useDoc<Organization>(orgRef);

  const handleGenerate = async () => {
    setIsGenerating(true);

    try {
      const result = await generateDraftFromSubmissions({
        submissions: submissions.map((s) => ({
          title: s.title,
          bodyCopy: s.bodyCopy,
          partnerName: s.partnerName,
          tags: (s.tagIds || []).map((id) => tagMap.get(id)?.name || id),
          aiThemes: s.aiThemes,
        })),
        brandToneNotes: org?.brandToneNotes || '',
        targetMarket: targetMarket || undefined,
        additionalInstructions: instructions || undefined,
      });

      if (result.success) {
        setDraft(result.data);
      } else {
        toast({
          title: 'Generation failed',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate draft.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateRelease = () => {
    if (!draft) return;

    // Create the release
    const releaseRef = doc(collection(firestore, 'orgs', orgId, 'releases'));
    const slug = draft.headline
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60);

    setDocumentNonBlocking(releaseRef, {
      id: releaseRef.id,
      orgId,
      headline: draft.headline,
      slug,
      bodyCopy: draft.bodyCopy,
      campaignType: draft.suggestedCampaignType || 'General',
      targetMarket: targetMarket || '',
      audience: draft.suggestedAudience || 'Consumer',
      status: 'Draft',
      sends: 0,
      opens: 0,
      clicks: 0,
      createdAt: serverTimestamp(),
    }, {});

    // Mark submissions as used
    for (const sub of submissions) {
      const subRef = doc(firestore, 'orgs', orgId, 'submissions', sub.id);
      updateDocumentNonBlocking(subRef, {
        status: 'used',
        usedInReleaseIds: [...(sub.usedInReleaseIds || []), releaseRef.id],
        updatedAt: serverTimestamp(),
      });
    }

    toast({
      title: 'Release created',
      description: 'A draft press release has been created from the selected submissions.',
    });

    setOpen(false);
    setDraft(null);
    onDraftCreated();

    router.push(`/dashboard/releases/${releaseRef.id}`);
  };

  const handleClose = () => {
    setOpen(false);
    setDraft(null);
    setTargetMarket('');
    setInstructions('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button>
          <Sparkles />
          Generate Draft ({submissions.length} selected)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        {draft ? (
          <>
            <DialogHeader>
              <DialogTitle>Generated Press Release Draft</DialogTitle>
              <DialogDescription>
                Review the draft below. Click &ldquo;Create as Release&rdquo; to save it as a new press release you can edit further.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm font-medium">Headline</Label>
                <p className="mt-1 text-lg font-semibold">{draft.headline}</p>
              </div>
              <div className="flex gap-2">
                <Badge>{draft.suggestedCampaignType}</Badge>
                <Badge variant="secondary">{draft.suggestedAudience}</Badge>
              </div>
              <div>
                <Label className="text-sm font-medium">Body Copy</Label>
                <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/50 p-4 text-sm max-h-[300px] overflow-y-auto">
                  {draft.bodyCopy}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Regenerate
              </Button>
              <Button onClick={handleCreateRelease}>
                Create as Release
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate Press Release Draft</DialogTitle>
              <DialogDescription>
                AI will combine {submissions.length} selected submission{submissions.length !== 1 ? 's' : ''} into a press release draft.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm font-medium">Selected Submissions</Label>
                <div className="mt-1 space-y-2">
                  {submissions.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="shrink-0">{s.partnerName}</Badge>
                      <span className="truncate">{s.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetMarket">Target Market (optional)</Label>
                <Input
                  id="targetMarket"
                  placeholder="e.g. UK, International, France"
                  value={targetMarket}
                  onChange={(e) => setTargetMarket(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instructions">Additional Instructions (optional)</Label>
                <Textarea
                  id="instructions"
                  placeholder="e.g. Focus on the family-friendly angle, mention the summer season..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles />
                    Generate Draft
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
