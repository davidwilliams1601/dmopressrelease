'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tags, X, Plus, RotateCcw, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

const VERTICAL_LABELS: Record<string, string> = {
  dmo: 'DMO',
  charity: 'Charity',
  'trade-body': 'Trade Body',
};

const VERTICAL_IDS = ['dmo', 'charity', 'trade-body'];

type VerticalCategories = Record<string, string[]>;

export function VerticalCategoriesCard() {
  const [categories, setCategories] = useState<VerticalCategories>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingVertical, setSavingVertical] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getCategories = httpsCallable<void, { verticals: VerticalCategories }>(functions, 'getVerticalCategories');
      const result = await getCategories();
      setCategories(result.data.verticals);
    } catch (error: any) {
      toast({ title: 'Error loading categories', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const handleSave = async (verticalId: string) => {
    setSavingVertical(verticalId);
    try {
      const functions = getFunctions();
      const updateCategories = httpsCallable(functions, 'updateVerticalCategories');
      await updateCategories({ verticalId, categories: categories[verticalId] });
      toast({ title: 'Saved', description: `${VERTICAL_LABELS[verticalId]} categories updated.` });
    } catch (error: any) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
    } finally {
      setSavingVertical(null);
    }
  };

  const handleRemove = (verticalId: string, category: string) => {
    setCategories((prev) => ({
      ...prev,
      [verticalId]: prev[verticalId].filter((c) => c !== category),
    }));
  };

  const handleAdd = (verticalId: string) => {
    const value = (newCategory[verticalId] || '').trim();
    if (!value) return;
    if (categories[verticalId]?.includes(value)) {
      toast({ title: 'Already exists', description: `"${value}" is already in the list.`, variant: 'destructive' });
      return;
    }
    setCategories((prev) => ({
      ...prev,
      [verticalId]: [...(prev[verticalId] || []), value],
    }));
    setNewCategory((prev) => ({ ...prev, [verticalId]: '' }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-5 w-5" />
          Partner Categories
        </CardTitle>
        <CardDescription>
          Category lists shown to partners on signup and used to filter bulk emails. Changes apply to all new signups immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="dmo">
            <TabsList>
              {VERTICAL_IDS.map((id) => (
                <TabsTrigger key={id} value={id}>{VERTICAL_LABELS[id]}</TabsTrigger>
              ))}
            </TabsList>
            {VERTICAL_IDS.map((verticalId) => (
              <TabsContent key={verticalId} value={verticalId} className="space-y-4 pt-4">
                <div className="flex flex-wrap gap-2">
                  {(categories[verticalId] || []).map((cat) => (
                    <Badge key={cat} variant="secondary" className="gap-1 pr-1 text-sm">
                      {cat}
                      <button
                        type="button"
                        onClick={() => handleRemove(verticalId, cat)}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        aria-label={`Remove ${cat}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {(categories[verticalId] || []).length === 0 && (
                    <p className="text-sm text-muted-foreground">No categories. Add one below.</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Add a category…"
                    value={newCategory[verticalId] || ''}
                    onChange={(e) => setNewCategory((prev) => ({ ...prev, [verticalId]: e.target.value }))}
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
                    onClick={loadCategories}
                    disabled={!!savingVertical}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {(categories[verticalId] || []).length} categories
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
