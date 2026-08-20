'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Newspaper, X, Plus, RotateCcw, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  MEDIA_TAXONOMY_CATEGORY_LABELS,
  DEFAULT_MEDIA_TAXONOMY,
  type MediaTaxonomyCategory,
} from '@/lib/media-taxonomy';

const CATEGORIES: MediaTaxonomyCategory[] = ['editorialFocus', 'geography', 'outletType', 'topics'];

type Taxonomy = Record<MediaTaxonomyCategory, string[]>;

/**
 * Superadmin control for Smart Distribution's controlled taxonomy — editorial focus,
 * geography, outlet type and topics — used to standardise both customer-uploaded
 * contacts (via the import wizard's alias mapping) and the Press Pilot media network.
 * Sibling to ThemeTaxonomyCard, same /platform/config document, different field
 * (mediaTaxonomy vs verticals) so the two features don't collide.
 */
export function MediaTaxonomyCard() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy>(DEFAULT_MEDIA_TAXONOMY);
  const [isLoading, setIsLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState<MediaTaxonomyCategory | null>(null);
  const [newValue, setNewValue] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const loadTaxonomy = useCallback(async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getTaxonomy = httpsCallable<void, { taxonomy: Taxonomy }>(functions, 'getMediaTaxonomy');
      const result = await getTaxonomy();
      setTaxonomy(result.data.taxonomy);
    } catch (error: any) {
      toast({ title: 'Error loading media taxonomy', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadTaxonomy(); }, [loadTaxonomy]);

  const handleSave = async (category: MediaTaxonomyCategory) => {
    setSavingCategory(category);
    try {
      const functions = getFunctions();
      const updateTaxonomy = httpsCallable(functions, 'updateMediaTaxonomy');
      await updateTaxonomy({ category, values: taxonomy[category] || [] });
      toast({ title: 'Saved', description: `${MEDIA_TAXONOMY_CATEGORY_LABELS[category]} taxonomy updated.` });
    } catch (error: any) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCategory(null);
    }
  };

  const handleRemove = (category: MediaTaxonomyCategory, value: string) => {
    setTaxonomy((prev) => ({
      ...prev,
      [category]: prev[category].filter((v) => v !== value),
    }));
  };

  const handleAdd = (category: MediaTaxonomyCategory) => {
    const value = (newValue[category] || '').trim();
    if (!value) return;
    if (taxonomy[category]?.includes(value)) {
      toast({ title: 'Already exists', description: `"${value}" is already in the list.`, variant: 'destructive' });
      return;
    }
    setTaxonomy((prev) => ({
      ...prev,
      [category]: [...(prev[category] || []), value],
    }));
    setNewValue((prev) => ({ ...prev, [category]: '' }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="h-5 w-5" />
          Media Taxonomy
        </CardTitle>
        <CardDescription>
          Controlled vocabulary for Smart Distribution — editorial focus, geography, outlet type
          and topics. Used to standardise the import wizard's column mapping and to label
          Press Pilot media-network recommendations consistently across every organisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="editorialFocus">
            <TabsList>
              {CATEGORIES.map((category) => (
                <TabsTrigger key={category} value={category}>
                  {MEDIA_TAXONOMY_CATEGORY_LABELS[category]}
                </TabsTrigger>
              ))}
            </TabsList>
            {CATEGORIES.map((category) => (
              <TabsContent key={category} value={category} className="space-y-4 pt-4">
                <div className="flex flex-wrap gap-2">
                  {(taxonomy[category] || []).map((value) => (
                    <Badge key={value} variant="secondary" className="gap-1 pr-1 text-sm">
                      {value}
                      <button
                        type="button"
                        onClick={() => handleRemove(category, value)}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        aria-label={`Remove ${value}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {(taxonomy[category] || []).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No terms — add at least one so this category can be used in matching.
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder={`Add ${MEDIA_TAXONOMY_CATEGORY_LABELS[category].toLowerCase()}…`}
                    value={newValue[category] || ''}
                    onChange={(e) => setNewValue((prev) => ({ ...prev, [category]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(category); } }}
                    className="max-w-xs"
                  />
                  <Button variant="outline" size="sm" onClick={() => handleAdd(category)}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    onClick={() => handleSave(category)}
                    disabled={savingCategory === category}
                  >
                    {savingCategory === category ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                    ) : (
                      'Save changes'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadTaxonomy}
                    disabled={!!savingCategory}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {(taxonomy[category] || []).length} term{(taxonomy[category] || []).length === 1 ? '' : 's'}
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
