'use client';

import { provideCampaignEffectivenessInsights } from '@/ai/flows/provide-campaign-effectiveness-insights';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOrganization } from '@/lib/data';
import type { EngagementStats } from '@/lib/types';
import { Wand2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function AiInsights({ stats }: { stats: EngagementStats }) {
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState('');
  const { toast } = useToast();
  const organization = getOrganization();

  const handleGenerateInsights = async () => {
    setIsLoading(true);
    setInsights('');
    try {
      const result = await provideCampaignEffectivenessInsights({
        numReleases: stats.releases,
        numSends: stats.sends,
        opens: stats.opens,
        clicks: stats.clicks,
        pageViews: stats.pageViews,
        brandToneNotes: organization.brandToneNotes,
      });
      setInsights(result.insights);
    } catch (error) {
      console.error('Failed to generate insights:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not generate AI insights. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <Wand2 className="text-accent" />
          <span>AI-Powered Insights</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <div className="flex-1">
          {isLoading && (
            <div className="flex items-center justify-center space-x-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Analyzing campaign data...</span>
            </div>
          )}
          {insights && (
            <div className="prose prose-sm dark:prose-invert animate-in fade-in">
              <p>{insights}</p>
            </div>
          )}
          {!isLoading && !insights && (
            <p className="text-sm text-muted-foreground">
              Click the button to generate insights on your campaign
              effectiveness based on engagement stats and your brand's tone.
            </p>
          )}
        </div>
        <Button onClick={handleGenerateInsights} disabled={isLoading}>
          <Wand2 />
          {isLoading ? 'Generating...' : 'Generate Insights'}
        </Button>
      </CardContent>
    </Card>
  );
}
