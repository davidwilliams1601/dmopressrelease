'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDocumentNonBlocking } from '@/firebase';
import { collection, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

type NewOutletListDialogProps = {
  orgId: string;
};

export function NewOutletListDialog({ orgId }: NewOutletListDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);

    try {
      const outletListsRef = collection(firestore, 'orgs', orgId, 'outletLists');

      await addDocumentNonBlocking(outletListsRef, {
        orgId,
        name: formData.get('name') as string,
        description: formData.get('description') as string || '',
        recipientCount: 0,
        createdAt: serverTimestamp(),
      });

      toast({
        title: 'Outlet list created',
        description: 'Your outlet list has been created successfully.',
      });

      setOpen(false);
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      console.error('Error creating outlet list:', error);
      toast({
        title: 'Error creating outlet list',
        description: 'There was a problem creating your outlet list. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle />
          <span>New List</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Outlet List</DialogTitle>
          <DialogDescription>
            Create a new list to organize your media contacts.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">List Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., UK Travel Media"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Optional description of this list..."
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create List'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
