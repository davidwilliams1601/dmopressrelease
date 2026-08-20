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
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_MEDIA_TAXONOMY, type MediaTaxonomyCategory } from '@/lib/media-taxonomy';
import type { Release, MediaTaxonomy } from '@/lib/types';

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
 * MediaNetworkContact tagging — a fixed toggle-badge picker, same visual language as
 * MediaTaxonomyCard, rather than free text, so matching stays on controlled vocabulary.
 * QA fix (Medium): the list itself is now the superadmin-managed taxonomy read from
 * /platform/config (mediaTaxonomy field), falling back to DEFAULT_MEDIA_TAXONOMY only
 * for categories with no stored override — previously this always showed the
 * hardcoded defaults and ignored any admin edits.
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

  // QA fix (Medium): this picker previously only ever showed the hardcoded
  // DEFAULT_MEDIA_TAXONOMY, ignoring any superadmin edits made via the taxonomy admin
  // console (functions/src/media-taxonomy.ts's getMediaTaxonomy/updateMediaTaxonomy,
  // stored at /platform/config field `mediaTaxonomy`). Reading the doc straight via
  // useDoc (not the superadmin-gated getMediaTaxonomy callable — this component is used
  // by ordinary team members) mirrors that same merge-over-defaults logic client-side;
  // firestore.rules already allows any signed-in user to read /platform/{docId}.
  const platformConfigDoc = useDoc<{ mediaTaxonomy?: Partial<MediaTaxonomy> }>(
    useMemoFirebase(() => doc(firestore, 'platform', 'config'), [firestore])
  );

  const taxonomy: Record<MediaTaxonomyCategory, string[]> = { ...DEFAULT_MEDIA_TAXONOMY };
  const storedTaxonomy = platformConfigDoc.data?.mediaTaxonomy;
  if (storedTaxonomy) {
    (Object.keys(DEFAULT_MEDIA_TAXONOMY) as MediaTaxonomyCategory[]).forEach((category) => {
      const override = storedTaxonomy[category];
      if (Array.isArray(override) && override.length > 0) {
        taxonomy[category] = override;
      }
    });
  }

  const toggle = (key: FocusCategory, value: string) => {
    setSelection((prev) => {
      const current = prev[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  // QA fix (M10): this previously called the fire-and-forget updateDocumentNonBlocking
  // (which returns void, not the write promise) and showed the success toast
  // immediately afterwards — so "Smart Distribution focus saved" appeared even if the
  // write hadn't been attempted yet, let alone confirmed, and the surrounding try/catch
  // could never actually catch a write failure. Awaiting a real updateDoc call here
  // means the toast (success or error) only fires once Firestore has confirmed the
  // write, matching the blocking-save convention used elsewhere in this codebase.
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const releaseRef = doc(firestore, 'orgs', orgId, 'releases', release.id);
      await updateDoc(releaseRef, {
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
              {taxonomy[taxonomyKey].map((value) => {
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
