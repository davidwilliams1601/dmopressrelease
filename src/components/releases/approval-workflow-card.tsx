'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShieldCheck,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, doc, query, serverTimestamp, where } from 'firebase/firestore';
import { useUserData } from '@/hooks/use-user-data';
import { useToast } from '@/hooks/use-toast';
import type { Release, User } from '@/lib/types';
import { format } from 'date-fns';
import { toDate } from '@/lib/utils';

type Props = {
  release: Release;
  orgId: string;
};

export function ApprovalWorkflowCard({ release, orgId }: Props) {
  const { firestore, user } = useFirebase();
  const { name: currentUserName, email: currentUserEmail } = useUserData();
  const { toast } = useToast();

  const [selectedApproverId, setSelectedApproverId] = useState<string>('');
  const [rejectNotes, setRejectNotes] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Fetch org users
  const usersQuery = useMemoFirebase(
    () => {
      const usersRef = collection(firestore, 'orgs', orgId, 'users');
      return query(usersRef, where('role', 'in', ['Admin', 'User']));
    },
    [firestore, orgId]
  );

  const { data: rawUsers } = useCollection<User>(usersQuery);
  const orgUsers = rawUsers ?? [];

  const isApprover = user?.uid === release.approverId;
  const isPending = release.approvalStatus === 'pending';
  const isApproved = release.approvalStatus === 'approved';
  const isRejected = release.approvalStatus === 'rejected';
  const hasStatus = isPending || isApproved || isRejected;

  const getReleaseRef = () => doc(firestore, 'orgs', orgId, 'releases', release.id);

  const handleRequestApproval = () => {
    const selectedUser = orgUsers.find((u) => u.id === selectedApproverId);
    if (!selectedUser || !user) return;

    updateDocumentNonBlocking(getReleaseRef(), {
      approvalStatus: 'pending',
      approverId: selectedUser.id,
      approverName: selectedUser.name,
      approverEmail: selectedUser.email,
      approvalRequestedAt: serverTimestamp(),
      approvalRequestedById: user.uid,
      approvalRequestedByName: currentUserName || '',
      approvalRequestedByEmail: currentUserEmail || '',
      approvalNotes: null,
      approvalResolvedAt: null,
      updatedAt: serverTimestamp(),
    });
  };

  const handleApprove = () => {
    updateDocumentNonBlocking(getReleaseRef(), {
      approvalStatus: 'approved',
      status: 'Ready',
      approvalResolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    toast({ title: "Release approved — it's now ready to send." });
  };

  const handleReject = () => {
    updateDocumentNonBlocking(getReleaseRef(), {
      approvalStatus: 'rejected',
      approvalNotes: rejectNotes,
      approvalResolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setIsRejecting(false);
    setRejectNotes('');
    toast({ title: 'Release returned for changes.' });
  };

  const handleRecall = () => {
    updateDocumentNonBlocking(getReleaseRef(), {
      approvalStatus: null,
      approverId: null,
      approverName: null,
      approverEmail: null,
      approvalRequestedAt: null,
      approvalRequestedById: null,
      approvalRequestedByName: null,
      approvalRequestedByEmail: null,
      updatedAt: serverTimestamp(),
    });
  };

  // Other org users (exclude self) for approver selection
  const selectableUsers = orgUsers.filter((u) => u.id !== user?.uid);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Approval
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Case 1: No approval status yet */}
        {!hasStatus && (
          <div className="space-y-3">
            <Select value={selectedApproverId} onValueChange={setSelectedApproverId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an approver…" />
              </SelectTrigger>
              <SelectContent>
                {selectableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <span className="flex items-center gap-2">
                      {u.name}
                      <Badge variant="outline" className="text-xs">
                        {u.role}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={!selectedApproverId}
              onClick={handleRequestApproval}
            >
              Submit for Approval
            </Button>
            <p className="text-xs text-muted-foreground">
              Selecting an approver will notify them by email.
            </p>
          </div>
        )}

        {/* Case 2: Pending — current user is NOT the approver */}
        {isPending && !isApprover && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Awaiting approval from{' '}
              <span className="font-medium text-foreground">
                {release.approverName}
              </span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleRecall}>
              Recall
            </Button>
          </div>
        )}

        {/* Case 3: Pending — current user IS the approver */}
        {isPending && isApprover && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              You&apos;ve been asked to approve this release.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleApprove}
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRejecting((v) => !v)}
              >
                Request Changes
              </Button>
            </div>
            {isRejecting && (
              <div className="space-y-2">
                <Textarea
                  placeholder="Describe the changes needed…"
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  className="min-h-[80px]"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleReject}
                >
                  Send Back for Changes
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Case 4: Approved */}
        {isApproved && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Approved
              </Badge>
            </div>
            {release.approvalResolvedAt && (
              <p className="text-sm text-muted-foreground">
                Approved{' '}
                {format(toDate(release.approvalResolvedAt), 'dd MMM yyyy, HH:mm')}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              This release is ready to send.
            </p>
          </div>
        )}

        {/* Case 5: Rejected */}
        {isRejected && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                Changes Requested
              </Badge>
            </div>
            {release.approvalNotes && (
              <p className="text-sm text-muted-foreground rounded-md border p-3 bg-muted/30">
                {release.approvalNotes}
              </p>
            )}
            <div className="space-y-3">
              <Select value={selectedApproverId} onValueChange={setSelectedApproverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an approver…" />
                </SelectTrigger>
                <SelectContent>
                  {selectableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="flex items-center gap-2">
                        {u.name}
                        <Badge variant="outline" className="text-xs">
                          {u.role}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!selectedApproverId}
                onClick={handleRequestApproval}
              >
                Re-submit for Approval
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
