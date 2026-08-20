'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useFirestore } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Recipient } from '@/lib/types';
import { joinFullName, splitFullName, toDate } from '@/lib/utils';
import {
  DEFAULT_MEDIA_TAXONOMY,
  OUTLET_TYPE_VALUE_BY_LABEL,
  RELATIONSHIP_STATUS_OPTIONS,
} from '@/lib/media-taxonomy';

type EditRecipientDialogProps = {
  recipient: Recipient;
  orgId: string;
  listId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TaxonomyCategory = 'editorialFocus' | 'geography' | 'topics';

const TAXONOMY_CONFIG: { key: TaxonomyCategory; label: string }[] = [
  { key: 'editorialFocus', label: 'Editorial focus' },
  { key: 'geography', label: 'Geography' },
  { key: 'topics', label: 'Topics' },
];

/** Formats a FirestoreTimestamp/date-ish value as yyyy-MM-dd for an <input type="date">. */
function toDateInputValue(value: unknown): string {
  if (!value) return '';
  try {
    return toDate(value).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

/**
 * Edit dialog for a single media contact. This is also the only place in the product
 * that surfaces every field the import wizard can write (editorial focus, geography,
 * topics, outlet type, relationship status, last contacted date, do-not-contact, notes)
 * for viewing or editing after a contact is imported or added — previously the only way
 * to change any of this data was delete-and-re-add.
 *
 * Backward compatibility: rows created before firstName/lastName existed only have a
 * combined `name`. Opening one of those in this dialog best-effort splits `name` into
 * the two fields (see splitFullName) so it can be edited like any other contact; saving
 * re-derives `name` from the edited firstName/lastName so every existing read site that
 * still relies on Recipient.name (sends, Cloud Functions matching/dedupe) keeps working.
 */
export function EditRecipientDialog({ recipient, orgId, listId, open, onOpenChange }: EditRecipientDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const initialSplit = recipient.firstName
    ? { firstName: recipient.firstName, lastName: recipient.lastName || '' }
    : splitFullName(recipient.name);

  const [firstName, setFirstName] = useState(initialSplit.firstName);
  const [lastName, setLastName] = useState(initialSplit.lastName);
  const [email, setEmail] = useState(recipient.email);
  const [outlet, setOutlet] = useState(recipient.outlet);
  const [position, setPosition] = useState(recipient.position || '');
  const [notes, setNotes] = useState(recipient.notes || '');
  const [editorialFocus, setEditorialFocus] = useState<string[]>(recipient.editorialFocus || []);
  const [geography, setGeography] = useState<string[]>(recipient.geography || []);
  const [topics, setTopics] = useState<string[]>(recipient.topics || []);
  const [outletType, setOutletType] = useState<string>(recipient.outletType || '');
  const [relationshipStatus, setRelationshipStatus] = useState<string>(recipient.relationshipStatus || '');
  const [lastContactedAt, setLastContactedAt] = useState(toDateInputValue(recipient.lastContactedAt));
  const [doNotContact, setDoNotContact] = useState(!!recipient.doNotContact);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const recipientRef = doc(firestore, 'orgs', orgId, 'outletLists', listId, 'recipients', recipient.id);

      const data: Record<string, unknown> = {
        name: joinFullName(firstName, lastName),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        outlet: outlet.trim(),
        position: position.trim(),
        notes: notes.trim(),
        editorialFocus,
        geography,
        topics,
        doNotContact,
        updatedAt: serverTimestamp(),
      };
      // The select already stores the controlled kebab-case value (OUTLET_TYPE_VALUE_BY_LABEL's
      // values), matching what recommendations.ts/filters/exports compare against — no
      // extra normalisation needed here, unlike the CSV import wizard which starts from
      // free-text spreadsheet cells.
      data.outletType = outletType || '';
      data.relationshipStatus = relationshipStatus || '';
      data.lastContactedAt = lastContactedAt || null;

      updateDocumentNonBlocking(recipientRef, data);

      toast({
        title: 'Contact updated',
        description: `${data.name || 'Contact'}'s details have been saved.`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating recipient:', error);
      toast({
        title: 'Error updating contact',
        description: 'There was a problem saving the changes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
          <DialogDescription>
            Update this media contact&apos;s details, including anything picked up from an import.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-firstName">First Name *</Label>
                <Input
                  id="edit-firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-lastName">Last Name</Label>
                <Input
                  id="edit-lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email Address *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-outlet">Outlet/Publication *</Label>
                <Input
                  id="edit-outlet"
                  value={outlet}
                  onChange={(e) => setOutlet(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-position">Position</Label>
                <Input
                  id="edit-position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-outletType">Outlet type</Label>
                <Select value={outletType} onValueChange={setOutletType}>
                  <SelectTrigger id="edit-outletType">
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
                <Label htmlFor="edit-relationshipStatus">Relationship status</Label>
                <Select value={relationshipStatus} onValueChange={setRelationshipStatus}>
                  <SelectTrigger id="edit-relationshipStatus">
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
                <Label htmlFor="edit-lastContactedAt">Last contacted</Label>
                <Input
                  id="edit-lastContactedAt"
                  type="date"
                  value={lastContactedAt}
                  onChange={(e) => setLastContactedAt(e.target.value)}
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
                  {/* Values from an import that aren't in the default list (e.g. a custom
                      taxonomy term) still show up here as selected so they aren't silently
                      dropped just because they were saved outside this picker's options. */}
                  {taxonomySelection[key]
                    .filter((v) => !DEFAULT_MEDIA_TAXONOMY[key].includes(v))
                    .map((value) => (
                      <Badge
                        key={value}
                        variant="default"
                        className="cursor-pointer select-none text-sm"
                        onClick={() => toggleTag(key, value)}
                      >
                        {value}
                      </Badge>
                    ))}
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-doNotContact"
                checked={doNotContact}
                onCheckedChange={(v) => setDoNotContact(v === true)}
              />
              <Label htmlFor="edit-doNotContact" className="cursor-pointer">Do not contact</Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
