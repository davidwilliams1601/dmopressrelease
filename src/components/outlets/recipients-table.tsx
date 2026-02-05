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
import type { Recipient } from '@/lib/types';
import { Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc, increment, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

type RecipientsTableProps = {
  recipients: Recipient[];
  orgId: string;
  listId: string;
};

export function RecipientsTable({ recipients, orgId, listId }: RecipientsTableProps) {
  const firestore = useFirestore();
  const { toast } = useToast();

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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Outlet</TableHead>
          <TableHead className="hidden md:table-cell">Position</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipients.map((recipient) => (
          <TableRow key={recipient.id}>
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
            <TableCell>
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
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
