'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, Copy, Check } from 'lucide-react';
import { generateSocialPosts } from '@/ai/flows/generate-social-posts';
import { useToast } from '@/hooks/use-toast';
import type { GenerateSocialPostsOutput } from '@/ai/flows/generate-social-posts';

const PLATFORMS = [
  { key: 'linkedin' as const, label: 'LinkedIn', limit: 3000 },
  { key: 'twitter' as const, label: 'X / Twitter', limit: 280 },
  { key: 'facebook' as const, label: 'Facebook', limit: 2000 },
  { key: 'instagram' as const, label: 'Instagram', limit: 2200 },
];

type SocialPostGeneratorProps = {
  headline: string;
  bodyCopy: string;
  orgName: string;
  orgSlug?: string;
  releaseSlug?: string;
  brandToneNotes?: string;
  targetMarket?: string;
};

export function SocialPostGenerator({
  headline,
  bodyCopy,
  orgName,
  orgSlug,
  releaseSlug,
  brandToneNotes,
  targetMarket,
}: SocialPostGeneratorProps) {
  const releaseUrl =
    orgSlug && releaseSlug
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/releases/${orgSlug}/${releaseSlug}`
      : null;
  const [isGenerating, setIsGenerating] = useState(false);
  const [posts, setPosts] = useState<GenerateSocialPostsOutput | null>(null);
  const [edited, setEdited] = useState<GenerateSocialPostsOutput | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!headline || !bodyCopy || bodyCopy.trim().length < 50) {
      toast({
        title: 'Not enough content',
        description: 'Please add a headline and at least 50 characters of body copy first.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setPosts(null);
    setEdited(null);

    try {
      const result = await generateSocialPosts({
        headline,
        bodyCopy,
        orgName,
        brandToneNotes,
        targetMarket,
      });

      if (!result.success) {
        toast({ title: 'Generation failed', description: result.error, variant: 'destructive' });
        return;
      }

      setPosts(result.data);
      setEdited(result.data);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to generate posts.', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (platform: keyof GenerateSocialPostsOutput) => {
    if (!edited) return;
    await navigator.clipboard.writeText(edited[platform]);
    setCopied(platform);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-headline flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Social Media Posts
            </CardTitle>
            <CardDescription>
              Generate platform-tailored social posts from this press release.
            </CardDescription>
          </div>
          <Button onClick={handleGenerate} disabled={isGenerating} variant="outline">
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles />
                {posts ? 'Regenerate' : 'Generate Posts'}
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {edited && (
        <CardContent>
          <Tabs defaultValue="linkedin">
            <TabsList className="w-full">
              {PLATFORMS.map((p) => (
                <TabsTrigger key={p.key} value={p.key} className="flex-1">
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {PLATFORMS.map((p) => {
              const text = edited[p.key];
              const charCount = text.length;
              const overLimit = charCount > p.limit;

              return (
                <TabsContent key={p.key} value={p.key} className="mt-4 space-y-2">
                  <Textarea
                    value={text}
                    onChange={(e) => setEdited((prev) => prev ? { ...prev, [p.key]: e.target.value } : prev)}
                    className="min-h-[180px] text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${overLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {charCount.toLocaleString()} / {p.limit.toLocaleString()} characters
                      {overLimit && ' — over limit'}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(p.key)}
                    >
                      {copied === p.key ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
          {releaseUrl ? (
            <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <span className="text-xs text-muted-foreground shrink-0">Shareable URL:</span>
              <span className="text-xs font-mono truncate flex-1">{releaseUrl}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 shrink-0"
                onClick={() => { navigator.clipboard.writeText(releaseUrl); }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Posts are editable above. Replace <strong>[Link]</strong> with your URL before posting.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
