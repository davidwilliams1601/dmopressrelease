'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { collection, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Tag } from '@/lib/types';

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

type TagManagerProps = {
  orgId: string;
  userId: string;
  tags: Tag[];
};

export function TagManager({ orgId, userId, tags }: TagManagerProps) {
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const handleAddTag = () => {
    const name = newTagName.trim();
    if (!name) return;

    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast({
        title: 'Tag already exists',
        description: `A tag named "${name}" already exists.`,
        variant: 'destructive',
      });
      return;
    }

    const tagRef = doc(collection(firestore, 'orgs', orgId, 'tags'));
    setDocumentNonBlocking(tagRef, {
      id: tagRef.id,
      orgId,
      name,
      color: selectedColor,
      createdBy: userId,
      createdAt: serverTimestamp(),
    }, {});

    setNewTagName('');
    toast({ title: 'Tag created', description: `"${name}" has been added.` });
  };

  const handleDeleteTag = async (tag: Tag) => {
    try {
      await deleteDoc(doc(firestore, 'orgs', orgId, 'tags', tag.id));
      toast({ title: 'Tag deleted', description: `"${tag.name}" has been removed.` });
    } catch (error: any) {
      toast({
        title: 'Error deleting tag',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-2">
          <Input
            placeholder="New tag name..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
          />
        </div>
        <div className="flex gap-1">
          {TAG_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`h-6 w-6 rounded-full border-2 transition-transform ${
                selectedColor === color ? 'border-foreground scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              onClick={() => setSelectedColor(color)}
            />
          ))}
        </div>
        <Button onClick={handleAddTag} disabled={!newTagName.trim()} size="sm">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {tags.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No tags yet. Create some tags for partners to categorize their submissions.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-1">
              <Badge
                variant="outline"
                className="pr-1"
                style={{
                  borderColor: tag.color || undefined,
                  color: tag.color || undefined,
                }}
              >
                {tag.name}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="ml-1 rounded-full p-0.5 hover:bg-muted">
                      <X className="h-3 w-3" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete tag &ldquo;{tag.name}&rdquo;?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the tag. Existing submissions with this tag will not be affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteTag(tag)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
