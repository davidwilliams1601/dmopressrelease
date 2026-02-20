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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useRouter } from 'next/navigation';
import { generateWebContentFromSubmissions } from '@/ai/flows/generate-web-content-from-submissions';
import type { PartnerSubmission, Tag, Organization } from '@/lib/types';

const CONTENT_TYPES = ["What's New", 'Event Listing', 'Destination Guide', 'Seasonal Update', 'General'];

type GenerateWebContentDialogProps = {
  orgId: string;
  submissions: PartnerSubmission[];
  tags: Tag[];
  onContentCreated: () => void;
};

export function GenerateWebContentDialog({
  orgId,
  submissions,
  tags,
  onContentCreated,
}: GenerateWebContentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [contentType, setContentType] = useState('General');
  const [targetMarket, setTargetMarket] = useState('');
  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState<{
    title: string;
    metaDescription: string;
    introParagraph: string;
    sections: Array<{ heading: string; body: string }>;
    suggestedContentType: string;
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
      const result = await generateWebContentFromSubmissions({
        submissions: submissions.map((s) => ({
          title: s.title,
          bodyCopy: s.bodyCopy,
          partnerName: s.partnerName,
          tags: (s.tagIds || []).map((id) => tagMap.get(id)?.name || id),
          aiThemes: s.aiThemes,
        })),
        brandToneNotes: org?.brandToneNotes || '',
        contentType: contentType || undefined,
        targetMarket: targetMarket || undefined,
        additionalInstructions: instructions || undefined,
      });

      if (result.success) {
        setDraft(result.data);
        if (result.data.suggestedContentType && CONTENT_TYPES.includes(result.data.suggestedContentType)) {
          setContentType(result.data.suggestedContentType);
        }
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
        description: error.message || 'Failed to generate web content.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!draft) return;

    const contentRef = doc(collection(firestore, 'orgs', orgId, 'webContent'));

    setDocumentNonBlocking(contentRef, {
      id: contentRef.id,
      orgId,
      title: draft.title,
      metaDescription: draft.metaDescription,
      introParagraph: draft.introParagraph,
      sections: draft.sections,
      contentType: contentType || draft.suggestedContentType || 'General',
      targetMarket: targetMarket || '',
      status: 'Draft',
      sourceSubmissionIds: submissions.map((s) => s.id),
      createdAt: serverTimestamp(),
    }, {});

    toast({
      title: 'Content saved',
      description: 'Web content has been saved to the Content Hub.',
    });

    setOpen(false);
    setDraft(null);
    onContentCreated();

    router.push(`/dashboard/content/${contentRef.id}`);
  };

  const handleClose = () => {
    setOpen(false);
    setDraft(null);
    setContentType('General');
    setTargetMarket('');
    setInstructions('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Globe />
          Generate Web Content ({submissions.length} selected)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        {draft ? (
          <>
            <DialogHeader>
              <DialogTitle>Generated Web Content</DialogTitle>
              <DialogDescription>
                Review the content below. Click &ldquo;Save to Content Hub&rdquo; to save it for editing and export.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm font-medium">Title (H1)</Label>
                <p className="mt-1 text-lg font-semibold">{draft.title}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Meta Description</Label>
                <p className="mt-1 text-sm text-muted-foreground border rounded-md p-3 bg-muted/50">
                  {draft.metaDescription}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{draft.metaDescription.length} characters</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Intro Paragraph</Label>
                <p className="mt-1 text-sm">{draft.introParagraph}</p>
              </div>
              {draft.sections.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Sections</Label>
                  {draft.sections.map((section, i) => (
                    <div key={i} className="rounded-md border bg-muted/50 p-3">
                      <p className="font-semibold text-sm">{section.heading}</p>
                      <p className="text-sm mt-1 text-muted-foreground">{section.body}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{contentType || draft.suggestedContentType}</Badge>
                {targetMarket && <Badge variant="outline">{targetMarket}</Badge>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Regenerate
              </Button>
              <Button onClick={handleSave}>
                Save to Content Hub
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate Web Content</DialogTitle>
              <DialogDescription>
                AI will generate web-optimised content from {submissions.length} selected submission{submissions.length !== 1 ? 's' : ''}.
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
                <Label htmlFor="contentType">Content Type</Label>
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select content type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  placeholder="e.g. Focus on the family-friendly angle, highlight summer events..."
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
                    <Globe />
                    Generate Content
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
