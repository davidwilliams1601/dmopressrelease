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
import { enhancePressReleaseTone } from '@/ai/flows/enhance-press-release-tone';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

type AiToneEnhancerProps = {
  bodyCopy: string;
  brandToneNotes: string;
  onApplyEnhancement: (enhancedCopy: string) => void;
};

export function AiToneEnhancer({
  bodyCopy,
  brandToneNotes,
  onApplyEnhancement,
}: AiToneEnhancerProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedCopy, setEnhancedCopy] = useState<string | null>(null);
  const { toast } = useToast();

  const handleEnhance = async () => {
    if (!bodyCopy || bodyCopy.trim().length < 50) {
      toast({
        title: 'Body copy too short',
        description: 'Please add at least 50 characters of body copy to enhance the tone.',
        variant: 'destructive',
      });
      return;
    }

    if (!brandToneNotes) {
      toast({
        title: 'Brand tone notes missing',
        description: 'Please add brand tone notes in Settings to use this feature.',
        variant: 'destructive',
      });
      return;
    }

    setIsEnhancing(true);
    setEnhancedCopy(null);

    try {
      const result = await enhancePressReleaseTone({
        bodyCopy,
        brandToneNotes,
      });

      setEnhancedCopy(result.enhancedBodyCopy);
    } catch (error) {
      console.error('Error enhancing tone:', error);
      toast({
        title: 'Failed to enhance tone',
        description: 'There was an error enhancing the tone. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-headline flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Tone Enhancer
            </CardTitle>
            <CardDescription>
              Enhance your body copy to match your brand's tone and voice.
            </CardDescription>
          </div>
          <Button
            onClick={handleEnhance}
            disabled={isEnhancing}
            variant="outline"
          >
            {isEnhancing ? (
              <>
                <Loader2 className="animate-spin" />
                Enhancing...
              </>
            ) : (
              <>
                <Sparkles />
                Enhance Tone
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {enhancedCopy && (
        <CardContent>
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-medium mb-2">Enhanced Version:</p>
              <Textarea
                value={enhancedCopy}
                onChange={(e) => setEnhancedCopy(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                You can edit the enhanced version above before applying it.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  onApplyEnhancement(enhancedCopy);
                  toast({
                    title: 'Enhancement applied',
                    description: 'The enhanced copy has been updated in your form.',
                  });
                  setEnhancedCopy(null);
                }}
              >
                Apply Enhancement
              </Button>
              <Button
                variant="outline"
                onClick={() => setEnhancedCopy(null)}
              >
                Discard
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
