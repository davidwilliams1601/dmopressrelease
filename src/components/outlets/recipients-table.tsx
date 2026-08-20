'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import type { Recipient } from '@/lib/types';
import { Trash2, Pencil } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc, increment, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { EditRecipientDialog } from '@/components/outlets/edit-recipient-dialog';
import { OUTLET_TYPE_LABEL_BY_VALUE, RELATIONSHIP_STATUS_OPTIONS } from '@/lib/media-taxonomy';

type RecipientsTableProps = {
  recipients: Recipient[];
  orgId: string;
  listId: string;
};

export function RecipientsTable({ recipients, orgId, listId }: RecipientsTableProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);

  const relationshipLabelByValue = Object.fromEntries(
    RELATIONSHIP_STATUS_OPTIONS.map((o) => [o.value, o.label])
  );

  const handleDelete = async (recipientId: string, recipientName: string) => {
    try {
      const recipientRef = doc(
        firestore,
        'orgs',
        orgId,
        'outletLists',
        listId,
        'recipients',
        recipientId
      );
      deleteDocumentNonBlocking(recipientRef);

      // Update recipient count on the list
      const listRef = doc(firestore, 'orgs', orgId, 'outletLists', listId);
      updateDocumentNonBlocking(listRef, {
        recipientCount: increment(-1),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Recipient removed',
        description: `${recipientName} has been removed from the list.`,
      });
    } catch (error) {
      console.error('Error deleting recipient:', error);
      toast({
        title: 'Error removing recipient',
        description: 'There was a problem removing the contact. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Outlet</TableHead>
            <TableHead className="hidden md:table-cell">Position</TableHead>
            <TableHead className="hidden lg:table-cell">Editorial focus / status</TableHead>
            <TableHead className="w-[90px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recipients.map((recipient) => (
            <TableRow
              key={recipient.id}
              className="cursor-pointer"
              onClick={() => setEditingRecipient(recipient)}
            >
              <TableCell className="font-medium">{recipient.name}</TableCell>
              <TableCell>
                <a
                  href={`mailto:${recipient.email}`}
                  className="text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {recipient.email}
                </a>
              </TableCell>
              <TableCell>{recipient.outlet}</TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground">
                {recipient.position || '—'}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <div className="flex flex-wrap gap-1 max-w-[280px]">
                  {(recipient.editorialFocus || []).slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                  {(recipient.editorialFocus?.length || 0) > 2 && (
                    <Badge variant="outline" className="text-xs">+{recipient.editorialFocus!.length - 2}</Badge>
                  )}
                  {recipient.outletType && (
                    <Badge variant="secondary" className="text-xs">
                      {OUTLET_TYPE_LABEL_BY_VALUE[recipient.outletType] || recipient.outletType}
                    </Badge>
                  )}
                  {recipient.relationshipStatus && (
                    <Badge variant="secondary" className="text-xs">
                      {relationshipLabelByValue[recipient.relationshipStatus] || recipient.relationshipStatus}
                    </Badge>
                  )}
                  {recipient.doNotContact && (
                    <Badge variant="destructive" className="text-xs">Do not contact</Badge>
                  )}
                  {!recipient.editorialFocus?.length && !recipient.outletType && !recipient.relationshipStatus && !recipient.doNotContact && (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingRecipient(recipient);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove recipient?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove {recipient.name} from this list?
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(recipient.id, recipient.name)}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editingRecipient && (
        <EditRecipientDialog
          recipient={editingRecipient}
          orgId={orgId}
          listId={listId}
          open={!!editingRecipient}
          onOpenChange={(open) => {
            if (!open) setEditingRecipient(null);
          }}
        />
      )}
    </>
  );
}
