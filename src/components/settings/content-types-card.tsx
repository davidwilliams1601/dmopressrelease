'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Save, Plus, Trash2, RotateCcw } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { getVerticalConfig } from '@/lib/verticals';
import type { Organization } from '@/lib/types';

type ContentType = { name: string; description?: string };

type Props = {
  organization: Organization;
};

export default function ContentTypesCard({ organization }: Props) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const verticalConfig = getVerticalConfig(organization.vertical);
  const verticalDefaults: ContentType[] = verticalConfig.ai.webContentTypes.map(
    (name) => ({ name })
  );

  const isCustomised = !!organization.contentTypes && organization.contentTypes.length > 0;

  const [types, setTypes] = useState<ContentType[]>(
    isCustomised ? organization.contentTypes! : []
  );
  const [isEditing, setIsEditing] = useState(isCustomised);

  // Re-sync if org data changes externally
  useEffect(() => {
    const hasOrgTypes = !!organization.contentTypes && organization.contentTypes.length > 0;
    if (hasOrgTypes) {
      setTypes(organization.contentTypes!);
      setIsEditing(true);
    } else {
      setTypes([]);
      setIsEditing(false);
    }
  }, [organization.contentTypes]);

  const handleCustomise = () => {
    setTypes(verticalDefaults);
    setIsEditing(true);
  };

  const handleResetToDefaults = () => {
    setTypes([]);
    setIsEditing(false);
  };

  const handleAddType = () => {
    setTypes((prev) => [...prev, { name: '', description: '' }]);
  };

  const handleRemoveType = (index: number) => {
    setTypes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeName = (index: number, value: string) => {
    setTypes((prev) =>
      prev.map((t, i) => (i === index ? { ...t, name: value } : t))
    );
  };

  const handleChangeDescription = (index: number, value: string) => {
    setTypes((prev) =>
      prev.map((t, i) => (i === index ? { ...t, description: value } : t))
    );
  };

  const handleSave = async () => {
    if (isEditing) {
      const validTypes = types.filter((t) => t.name.trim());
      if (validTypes.length === 0) {
        toast({
          title: 'At least one content type required',
          description: 'Add at least one content type or reset to defaults.',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const orgRef = doc(firestore, 'orgs', organization.id);

      // If not editing (reset to defaults), clear the field
      const contentTypes = isEditing
        ? types
            .filter((t) => t.name.trim())
            .map((t) => ({
              name: t.name.trim(),
              ...(t.description?.trim() ? { description: t.description.trim() } : {}),
            }))
        : null;

      await updateDocumentNonBlocking(orgRef, {
        contentTypes,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Content types saved',
        description: isEditing
          ? 'Your custom content types have been saved.'
          : 'Content types reset to vertical defaults.',
      });
    } catch (error) {
      console.error('Error saving content types:', error);
      toast({
        title: 'Error saving content types',
        description: 'There was a problem saving. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Content Types</CardTitle>
        <CardDescription>
          Define the types of web content your organisation produces. These appear
          as options when generating web content from releases and submissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isEditing ? (
          <>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Using defaults from {verticalConfig.displayName}
              </Label>
              <ul className="space-y-1">
                {verticalDefaults.map((t) => (
                  <li
                    key={t.name}
                    className="text-sm rounded-md border bg-muted/50 px-3 py-2"
                  >
                    {t.name}
                  </li>
                ))}
              </ul>
            </div>
            <Button type="button" variant="outline" onClick={handleCustomise}>
              <Plus className="h-4 w-4" />
              Customise
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-3">
              {types.map((type, index) => (
                <div
                  key={index}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Content type name"
                      value={type.name}
                      onChange={(e) => handleChangeName(index, e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveType(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Description (optional) -- shown as helper text when selecting this type"
                    value={type.description || ''}
                    onChange={(e) =>
                      handleChangeDescription(index, e.target.value)
                    }
                    rows={2}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleAddType}>
                <Plus className="h-4 w-4" />
                Add Type
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetToDefaults}
                className="text-muted-foreground"
              >
                <RotateCcw className="h-4 w-4" />
                Reset to Defaults
              </Button>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Content Types'}
        </Button>
      </CardFooter>
    </Card>
  );
}
