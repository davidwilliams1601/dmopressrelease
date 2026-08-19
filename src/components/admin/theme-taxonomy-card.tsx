'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, X, Plus, RotateCcw, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

const VERTICAL_LABELS: Record<string, string> = {
  dmo: 'DMO',
  charity: 'Charity',
  'trade-body': 'Trade Body',
  education: 'Education',
};

const VERTICAL_IDS = ['dmo', 'charity', 'trade-body', 'education'];

type ThemeTaxonomy = Record<string, string[]>;

/**
 * Sibling to VerticalCategoriesCard, editing the curated theme taxonomy per vertical
 * (federated-tenants step 8 pilot). A vertical with an empty list keeps today's
 * free-text AI theme behaviour unchanged — populating a list here constrains
 * analyzeSubmissionThemes (and the manual "Re-analyze" flow) to only classify into it.
 */
export function ThemeTaxonomyCard() {
  const [taxonomy, setTaxonomy] = useState<ThemeTaxonomy>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingVertical, setSavingVertical] = useState<string | null>(null);
  const [newTheme, setNewTheme] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const loadTaxonomy = useCallback(async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getTaxonomy = httpsCallable<void, { verticals: ThemeTaxonomy }>(functions, 'getVerticalThemeTaxonomy');
      const result = await getTaxonomy();
      setTaxonomy(result.data.verticals);
    } catch (error: any) {
      toast({ title: 'Error loading theme taxonomy', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadTaxonomy(); }, [loadTaxonomy]);

  const handleSave = async (verticalId: string) => {
    setSavingVertical(verticalId);
    try {
      const functions = getFunctions();
      const updateTaxonomy = httpsCallable(functions, 'updateVerticalThemeTaxonomy');
      await updateTaxonomy({ verticalId, themes: taxonomy[verticalId] || [] });
      toast({ title: 'Saved', description: `${VERTICAL_LABELS[verticalId]} theme taxonomy updated.` });
    } catch (error: any) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
    } finally {
      setSavingVertical(null);
    }
  };

  const handleRemove = (verticalId: string, theme: string) => {
    setTaxonomy((prev) => ({
      ...prev,
      [verticalId]: prev[verticalId].filter((t) => t !== theme),
    }));
  };

  const handleAdd = (verticalId: string) => {
    const value = (newTheme[verticalId] || '').trim();
    if (!value) return;
    if (taxonomy[verticalId]?.includes(value)) {
      toast({ title: 'Already exists', description: `"${value}" is already in the list.`, variant: 'destructive' });
      return;
    }
    setTaxonomy((prev) => ({
      ...prev,
      [verticalId]: [...(prev[verticalId] || []), value],
    }));
    setNewTheme((prev) => ({ ...prev, [verticalId]: '' }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Theme Taxonomy
        </CardTitle>
        <CardDescription>
          Curated theme lists used to constrain AI theme classification for cross-org trend detection.
          An empty list means that vertical keeps free-text AI themes, unconstrained. Changes apply to
          new submissions and manual re-analysis immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="education">
            <TabsList>
              {VERTICAL_IDS.map((id) => (
                <TabsTrigger key={id} value={id}>{VERTICAL_LABELS[id]}</TabsTrigger>
              ))}
            </TabsList>
            {VERTICAL_IDS.map((verticalId) => (
              <TabsContent key={verticalId} value={verticalId} className="space-y-4 pt-4">
                <div className="flex flex-wrap gap-2">
                  {(taxonomy[verticalId] || []).map((theme) => (
                    <Badge key={theme} variant="secondary" className="gap-1 pr-1 text-sm">
                      {theme}
                      <button
                        type="button"
                        onClick={() => handleRemove(verticalId, theme)}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        aria-label={`Remove ${theme}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {(taxonomy[verticalId] || []).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No curated taxonomy — AI themes stay free-text for this vertical.
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Add a theme…"
                    value={newTheme[verticalId] || ''}
                    onChange={(e) => setNewTheme((prev) => ({ ...prev, [verticalId]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(verticalId); } }}
                    className="max-w-xs"
                  />
                  <Button variant="outline" size="sm" onClick={() => handleAdd(verticalId)}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    onClick={() => handleSave(verticalId)}
                    disabled={savingVertical === verticalId}
                  >
                    {savingVertical === verticalId ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                    ) : (
                      'Save changes'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadTaxonomy}
                    disabled={!!savingVertical}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {(taxonomy[verticalId] || []).length} theme{(taxonomy[verticalId] || []).length === 1 ? '' : 's'}
                  </span>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
