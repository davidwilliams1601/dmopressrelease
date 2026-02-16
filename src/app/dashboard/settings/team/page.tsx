'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AddUserDialog } from '@/components/settings/add-user-dialog';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Shield, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { toDate } from '@/lib/utils';
import type { User } from '@/lib/types';

export default function TeamPage() {
  const { firestore, user: currentUser } = useFirebase();
  const { orgId, role, isLoading: isUserDataLoading } = useUserData();
  const { toast } = useToast();
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch all users in the organization
  const usersQuery = useCollection<User>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'users'),
        orderBy('createdAt', 'desc')
      );
    }, [firestore, orgId])
  );

  const users = usersQuery.data || [];
  const isAdmin = role === 'Admin';

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!orgId) return;

    try {
      const functions = getFunctions();
      const updateRole = httpsCallable(functions, 'updateOrgUserRole');

      await updateRole({
        orgId,
        userId,
        role: newRole,
      });

      toast({
        title: 'Role updated',
        description: 'User role has been updated successfully.',
      });

      // Refresh the users list
      // Data refreshes automatically via onSnapshot;
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast({
        title: 'Error updating role',
        description: error.message || 'Failed to update user role',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!orgId || !deleteUserId) return;

    setIsDeleting(true);

    try {
      const functions = getFunctions();
      const deleteUser = httpsCallable(functions, 'deleteOrgUser');

      await deleteUser({
        orgId,
        userId: deleteUserId,
      });

      toast({
        title: 'User deleted',
        description: 'User has been removed from your organization.',
      });

      setDeleteUserId(null);
      // Refresh the users list
      // Data refreshes automatically via onSnapshot;
    } catch (error: any) {
      console.error('Error deleting user:', error);
      
      let errorMessage = 'Failed to delete user';
      if (error.code === 'functions/failed-precondition') {
        errorMessage = 'You cannot delete your own account';
      }

      toast({
        title: 'Error deleting user',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isUserDataLoading || usersQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Team</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Team</h1>
          <p className="text-muted-foreground">
            You need admin permissions to manage team members.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Team</h1>
          <p className="text-muted-foreground">
            Manage users and permissions for your organization.
          </p>
        </div>
        {orgId && <AddUserDialog orgId={orgId} onUserAdded={() => { /* Data refreshes automatically via onSnapshot */ }} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Team Members</CardTitle>
          <CardDescription>
            {users.length} {users.length === 1 ? 'member' : 'members'} in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No users yet. Click "Add User" to invite team members.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isCurrentUser = user.id === currentUser?.uid;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                            {user.initials || user.name?.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">
                              {user.name}
                              {isCurrentUser && (
                                <Badge variant="outline" className="ml-2">
                                  You
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {isCurrentUser ? (
                          <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>
                            {user.role === 'Admin' ? <Shield className="mr-1 h-3 w-3" /> : <UserIcon className="mr-1 h-3 w-3" />}
                            {user.role}
                          </Badge>
                        ) : (
                          <Select
                            value={user.role}
                            onValueChange={(value) => handleRoleChange(user.id, value)}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="User">
                                <span className="flex items-center">
                                  <UserIcon className="mr-2 h-4 w-4" />
                                  User
                                </span>
                              </SelectItem>
                              <SelectItem value="Admin">
                                <span className="flex items-center">
                                  <Shield className="mr-2 h-4 w-4" />
                                  Admin
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.createdAt
                          ? format(toDate(user.createdAt), 'dd MMM yyyy')
                          : 'Unknown'}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteUserId(user.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this user's account and remove them from your organization.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
