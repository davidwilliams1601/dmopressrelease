'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Globe, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useRouter } from 'next/navigation';
import { generateWebContentFromRelease } from '@/ai/flows/generate-web-content-from-release';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import type { Release, Organization } from '@/lib/types';

type Props = {
  release: Release;
  orgId: string;
  organization?: Organization | null;
};

type Draft = {
  title: string;
  metaDescription: string;
  introParagraph: string;
  sections: Array<{ heading: string; body: string }>;
  suggestedContentType: string;
};

export function GenerateWebContentCard({ release, orgId, organization }: Props) {
  const { firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const { config } = useVerticalConfig(orgId);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contentType, setContentType] = useState('General');
  const [targetMarket, setTargetMarket] = useState(release.targetMarket || '');
  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  // Use org-level content types if set, otherwise fall back to vertical defaults
  const effectiveContentTypes: Array<{ name: string; description?: string }> =
    organization?.contentTypes && organization.contentTypes.length > 0
      ? organization.contentTypes
      : config.ai.webContentTypes.map((name) => ({ name }));

  const contentTypeNames = effectiveContentTypes.map((t) => t.name);
  const contentTypeDescriptions = new Map(
    effectiveContentTypes
      .filter((t) => t.description)
      .map((t) => [t.name, t.description!])
  );

  const hasBodyCopy = !!release.bodyCopy?.trim();

  const handleGenerate = async () => {
    if (!hasBodyCopy) return;
    setIsGenerating(true);

    try {
      const result = await generateWebContentFromRelease({
        headline: release.headline,
        bodyCopy: release.bodyCopy!,
        brandToneNotes: organization?.brandToneNotes || '',
        contentType: contentType || undefined,
        targetMarket: targetMarket || undefined,
        additionalInstructions: instructions || undefined,
        orgTypeDescription: config.ai.orgTypeDescription,
        webContentStyle: config.ai.webContentStyle,
        suggestedContentTypeInstruction: config.ai.suggestedContentTypeInstruction,
      });

      if (result.success) {
        setDraft(result.data);
        if (result.data.suggestedContentType && contentTypeNames.includes(result.data.suggestedContentType)) {
          setContentType(result.data.suggestedContentType);
        }
      } else {
        toast({ title: 'Generation failed', description: result.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to generate web content.', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!draft) return;
    setIsSaving(true);

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
      sourceSubmissionIds: [],
      sourceReleaseId: release.id,
      createdAt: serverTimestamp(),
    }, {});

    toast({
      title: 'Saved to Content Hub',
      description: 'Web content is ready to edit and export.',
    });

    router.push(`/dashboard/content/${contentRef.id}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Generate Web Content
        </CardTitle>
        <CardDescription>
          Turn this press release into web-optimised copy for your CMS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasBodyCopy && (
          <p className="text-sm text-muted-foreground rounded-md border bg-muted/50 px-3 py-2">
            Add body copy above before generating web content.
          </p>
        )}

        {!draft ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Content Type</Label>
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select content type" />
                  </SelectTrigger>
                  <SelectContent>
                    {effectiveContentTypes.map((type) => (
                      <SelectItem key={type.name} value={type.name}>
                        <span>{type.name}</span>
                        {type.description && (
                          <span className="block text-xs text-muted-foreground font-normal">{type.description}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Market</Label>
                <Input
                  placeholder="e.g. UK, International, France"
                  value={targetMarket}
                  onChange={(e) => setTargetMarket(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Additional Instructions <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                placeholder="e.g. Focus on the family-friendly angle, highlight summer events..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
              />
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating || !hasBodyCopy}>
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Generating...</>
              ) : (
                <><Globe className="h-4 w-4" />Generate Web Content</>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Title (H1)</Label>
                <p className="mt-1 text-base font-semibold">{draft.title}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Meta Description</Label>
                <p className="mt-1 text-sm text-muted-foreground rounded-md border bg-muted/50 px-3 py-2">
                  {draft.metaDescription}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{draft.metaDescription.length} characters</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Intro Paragraph</Label>
                <p className="mt-1 text-sm">{draft.introParagraph}</p>
              </div>
              {draft.sections.length > 0 && (
                <div className="space-y-2">
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
            <div className="space-y-2">
              <Label className="text-sm font-medium">Refine your instructions</Label>
              <p className="text-xs text-muted-foreground">
                Adjust your prompt to steer the next draft &mdash; e.g. &ldquo;make sections 60 words each&rdquo; or &ldquo;add a call to action for each partner&rdquo;
              </p>
              <Textarea
                placeholder="e.g. Focus on the family-friendly angle, highlight summer events..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleGenerate} disabled={isGenerating || isSaving}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regenerate
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <ExternalLink className="h-4 w-4" />
                Save to Content Hub
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
