'use client';

import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, orderBy, query } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Tag } from '@/lib/types';

type TagSelectorProps = {
  orgId: string;
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
};

export function TagSelector({ orgId, selectedTagIds, onTagsChange }: TagSelectorProps) {
  const { firestore } = useFirebase();

  const tagsRef = useMemoFirebase(() => {
    if (!orgId) return null;
    return query(
      collection(firestore, 'orgs', orgId, 'tags'),
      orderBy('name', 'asc')
    );
  }, [firestore, orgId]);

  const { data: tagsData, isLoading } = useCollection<Tag>(tagsRef);
  const tags = tagsData || [];

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagsChange([...selectedTagIds, tagId]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-14" />
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tags available. An admin needs to create tags first.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id);
        return (
          <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}>
            <Badge
              variant={isSelected ? 'default' : 'outline'}
              className="cursor-pointer transition-colors"
              style={
                isSelected
                  ? { backgroundColor: tag.color || undefined, borderColor: tag.color || undefined }
                  : { borderColor: tag.color || undefined, color: tag.color || undefined }
              }
            >
              {tag.name}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
