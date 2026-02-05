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
import { UserPlus } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp, increment } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

type NewRecipientDialogProps = {
  orgId: string;
  listId: string;
};

export function NewRecipientDialog({ orgId, listId }: NewRecipientDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);

    try {
      const recipientsRef = collection(
        firestore,
        'orgs',
        orgId,
        'outletLists',
        listId,
        'recipients'
      );

      await addDocumentNonBlocking(recipientsRef, {
        orgId,
        outletListId: listId,
        name: formData.get('name') as string,
        email: formData.get('email') as string,
        outlet: formData.get('outlet') as string,
        position: formData.get('position') as string || '',
        notes: formData.get('notes') as string || '',
        createdAt: serverTimestamp(),
      });

      // Update recipient count on the list
      const listRef = doc(firestore, 'orgs', orgId, 'outletLists', listId);
      updateDocumentNonBlocking(listRef, {
        recipientCount: increment(1),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Recipient added',
        description: 'The contact has been added to your list.',
      });

      setOpen(false);
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      console.error('Error adding recipient:', error);
      toast({
        title: 'Error adding recipient',
        description: 'There was a problem adding the contact. Please try again.',
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
          <UserPlus />
          <span>Add Recipient</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Recipient</DialogTitle>
          <DialogDescription>
            Add a media contact to this outlet list.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Contact Name *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g., Jane Smith"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="e.g., jane@example.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="outlet">Outlet/Publication *</Label>
                <Input
                  id="outlet"
                  name="outlet"
                  placeholder="e.g., The Guardian"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="position">Position</Label>
                <Input
                  id="position"
                  name="position"
                  placeholder="e.g., Travel Editor"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Optional notes about this contact..."
                className="min-h-[80px]"
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
              {isSubmitting ? 'Adding...' : 'Add Recipient'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
