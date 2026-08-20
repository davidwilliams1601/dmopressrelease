'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Target, Save, Loader2 } from 'lucide-react';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_MEDIA_TAXONOMY } from '@/lib/media-taxonomy';
import type { Release } from '@/lib/types';

type SmartDistributionFocusCardProps = {
  release: Release;
  orgId: string;
};

type FocusCategory = 'editorialFocus' | 'geographies' | 'topics';

const CATEGORY_CONFIG: { key: FocusCategory; label: string; taxonomyKey: 'editorialFocus' | 'geography' | 'topics' }[] = [
  { key: 'editorialFocus', label: 'Editorial focus', taxonomyKey: 'editorialFocus' },
  { key: 'geographies', label: 'Geography', taxonomyKey: 'geography' },
  { key: 'topics', label: 'Topics', taxonomyKey: 'topics' },
];

/**
 * Lets a team member tag a release with the controlled Smart Distribution taxonomy
 * (editorial focus, geography, topics) so `generateRecommendations` has something to
 * match against. Tags are picked from the same curated lists used for Recipient/
 * MediaNetworkContact tagging (src/lib/media-taxonomy.ts DEFAULT_MEDIA_TAXONOMY) —
 * a fixed toggle-badge picker, same visual language as MediaTaxonomyCard, rather than
 * free text, so matching stays on controlled vocabulary.
 */
export function SmartDistributionFocusCard({ release, orgId }: SmartDistributionFocusCardProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selection, setSelection] = useState({
    editorialFocus: release.smartDistribution?.editorialFocus || [],
    geographies: release.smartDistribution?.geographies || [],
    topics: release.smartDistribution?.topics || [],
  });
  const [isSaving, setIsSaving] = useState(false);

  const toggle = (key: FocusCategory, value: string) => {
    setSelection((prev) => {
      const current = prev[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const releaseRef = doc(firestore, 'orgs', orgId, 'releases', release.id);
      updateDocumentNonBlocking(releaseRef, {
        smartDistribution: selection,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Smart Distribution focus saved', description: 'Recommendations will match against these tags.' });
    } catch (error: any) {
      toast({ title: 'Error saving focus', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const hasTags =
    selection.editorialFocus.length > 0 || selection.geographies.length > 0 || selection.topics.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Smart Distribution focus
        </CardTitle>
        <CardDescription>
          Tag this story so recommended contacts (yours and Press Pilot&apos;s media network) can be
          matched to it. Needed before generating recommendations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {CATEGORY_CONFIG.map(({ key, label, taxonomyKey }) => (
          <div key={key} className="space-y-2">
            <p className="text-sm font-medium">{label}</p>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_MEDIA_TAXONOMY[taxonomyKey].map((value) => {
                const isSelected = selection[key].includes(value);
                return (
                  <Badge
                    key={value}
                    variant={isSelected ? 'default' : 'outline'}
                    className="cursor-pointer select-none text-sm"
                    onClick={() => toggle(key, value)}
                  >
                    {value}
                  </Badge>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-2 border-t">
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save focus
              </>
            )}
          </Button>
          {!hasTags && (
            <span className="text-xs text-muted-foreground">
              Select at least one tag to enable recommendations.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
