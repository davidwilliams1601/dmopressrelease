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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp, increment } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { joinFullName } from '@/lib/utils';
import {
  DEFAULT_MEDIA_TAXONOMY,
  OUTLET_TYPE_VALUE_BY_LABEL,
  RELATIONSHIP_STATUS_OPTIONS,
} from '@/lib/media-taxonomy';

type NewRecipientDialogProps = {
  orgId: string;
  listId: string;
};

type TaxonomyCategory = 'editorialFocus' | 'geography' | 'topics';

const TAXONOMY_CONFIG: { key: TaxonomyCategory; label: string }[] = [
  { key: 'editorialFocus', label: 'Editorial focus' },
  { key: 'geography', label: 'Geography' },
  { key: 'topics', label: 'Topics' },
];

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  outlet: '',
  position: '',
  notes: '',
  outletType: '',
  relationshipStatus: '',
  lastContactedAt: '',
  doNotContact: false,
};

/**
 * Single-contact "Add Recipient" form. Mirrors EditRecipientDialog's field set (see
 * src/components/outlets/edit-recipient-dialog.tsx) so a contact added one-by-one here
 * has the same editorial focus / geography / topics / outlet type / relationship status
 * / last contacted / do-not-contact fields the CSV import wizard can write \u2014 previously
 * this form only had name/email/outlet/position/notes, so anyone adding a single
 * contact couldn't set any of the Smart Distribution taxonomy fields at all.
 */
export function NewRecipientDialog({ orgId, listId }: NewRecipientDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const [form, setForm] = useState(EMPTY_FORM);
  const [editorialFocus, setEditorialFocus] = useState<string[]>([]);
  const [geography, setGeography] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);

  const taxonomySelection: Record<TaxonomyCategory, string[]> = { editorialFocus, geography, topics };
  const taxonomySetters: Record<TaxonomyCategory, (v: string[]) => void> = {
    editorialFocus: setEditorialFocus,
    geography: setGeography,
    topics: setTopics,
  };

  const toggleTag = (category: TaxonomyCategory, value: string) => {
    const current = taxonomySelection[category];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    taxonomySetters[category](next);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditorialFocus([]);
    setGeography([]);
    setTopics([]);
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) resetForm();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

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
        name: joinFullName(form.firstName, form.lastName),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        outlet: form.outlet.trim(),
        position: form.position.trim(),
        notes: form.notes.trim(),
        editorialFocus,
        geography,
        topics,
        outletType: form.outletType || '',
        relationshipStatus: form.relationshipStatus || '',
        lastContactedAt: form.lastContactedAt || null,
        doNotContact: form.doNotContact,
        source: 'customer_provided',
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

      handleOpenChange(false);
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          <span>Add Recipient</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="e.g., Jane"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="e.g., Smith"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g., jane@example.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="outlet">Outlet/Publication *</Label>
                <Input
                  id="outlet"
                  placeholder="e.g., The Guardian"
                  value={form.outlet}
                  onChange={(e) => setForm((f) => ({ ...f, outlet: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="position">Position</Label>
                <Input
                  id="position"
                  placeholder="e.g., Travel Editor"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="outletType">Outlet type</Label>
                <Select
                  value={form.outletType}
                  onValueChange={(v) => setForm((f) => ({ ...f, outletType: v }))}
                >
                  <SelectTrigger id="outletType">
                    <SelectValue placeholder="Select outlet type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OUTLET_TYPE_VALUE_BY_LABEL).map(([label, value]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="relationshipStatus">Relationship status</Label>
                <Select
                  value={form.relationshipStatus}
                  onValueChange={(v) => setForm((f) => ({ ...f, relationshipStatus: v }))}
                >
                  <SelectTrigger id="relationshipStatus">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lastContactedAt">Last contacted</Label>
                <Input
                  id="lastContactedAt"
                  type="date"
                  value={form.lastContactedAt}
                  onChange={(e) => setForm((f) => ({ ...f, lastContactedAt: e.target.value }))}
                />
              </div>
            </div>

            {TAXONOMY_CONFIG.map(({ key, label }) => (
              <div key={key} className="grid gap-2">
                <Label>{label}</Label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_MEDIA_TAXONOMY[key].map((value) => {
                    const isSelected = taxonomySelection[key].includes(value);
                    return (
                      <Badge
                        key={value}
                        variant={isSelected ? 'default' : 'outline'}
                        className="cursor-pointer select-none text-sm"
                        onClick={() => toggleTag(key, value)}
                      >
                        {value}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <Checkbox
                id="doNotContact"
                checked={form.doNotContact}
                onCheckedChange={(v) => setForm((f) => ({ ...f, doNotContact: v === true }))}
              />
              <Label htmlFor="doNotContact" className="cursor-pointer">Do not contact</Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional notes about this contact..."
                className="min-h-[80px]"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
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
