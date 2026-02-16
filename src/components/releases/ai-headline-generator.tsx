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
import { Sparkles, Loader2 } from 'lucide-react';
import { generatePressReleaseHeadline } from '@/ai/flows/generate-press-release-headline';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

type AiHeadlineGeneratorProps = {
  bodyCopy: string;
  targetMarket: string;
  toneNotes?: string;
  onSelectHeadline: (headline: string) => void;
};

export function AiHeadlineGenerator({
  bodyCopy,
  targetMarket,
  toneNotes,
  onSelectHeadline,
}: AiHeadlineGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [headlines, setHeadlines] = useState<string[]>([]);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!bodyCopy || bodyCopy.trim().length < 50) {
      toast({
        title: 'Body copy too short',
        description: 'Please add at least 50 characters of body copy to generate headlines.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setHeadlines([]);

    try {
      const result = await generatePressReleaseHeadline({
        bodyCopy,
        targetMarket,
        toneNotes: toneNotes || '',
      });

      if (!result.success) {
        console.error('Error generating headlines:', result.error);
        toast({
          title: 'Failed to generate headlines',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      setHeadlines(result.data.headlineOptions);
    } catch (error) {
      console.error('Error generating headlines:', error);
      toast({
        title: 'Failed to generate headlines',
        description: 'There was an error generating headlines. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-headline flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Headline Generator
            </CardTitle>
            <CardDescription>
              Generate compelling headline options based on your content.
            </CardDescription>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            variant="outline"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles />
                Generate
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {headlines.length > 0 && (
        <CardContent>
          <div className="grid gap-3">
            {headlines.map((headline, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <Badge variant="outline" className="mb-2">
                    Option {index + 1}
                  </Badge>
                  <p className="font-medium">{headline}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    onSelectHeadline(headline);
                    toast({
                      title: 'Headline applied',
                      description: 'The headline has been updated in your form.',
                    });
                  }}
                >
                  Use This
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
