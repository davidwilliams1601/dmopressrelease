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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type AddUserDialogProps = {
  orgId: string;
  onUserAdded: () => void;
};

export function AddUserDialog({ orgId, onUserAdded }: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const role = formData.get('role') as string;

    try {
      // Import getFunctions from firebase/functions (not storage)
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const createUser = httpsCallable(functions, 'createOrgUser');

      const result = await createUser({
        orgId,
        email,
        name,
        role,
      });

      const data = result.data as any;

      // Show temporary password
      setTempPassword(data.tempPassword);

      toast({
        title: 'User created successfully',
        description: `${name} has been added to your organization.`,
      });

      onUserAdded();
    } catch (error: any) {
      console.error('Error creating user:', error);
      
      let errorMessage = 'There was a problem creating the user. Please try again.';
      if (error.code === 'functions/already-exists') {
        errorMessage = 'A user with this email already exists.';
      } else if (error.code === 'functions/permission-denied') {
        errorMessage = 'You do not have permission to create users.';
      }

      toast({
        title: 'Error creating user',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTempPassword(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {tempPassword ? (
          <>
            <DialogHeader>
              <DialogTitle>User Created Successfully!</DialogTitle>
              <DialogDescription>
                Share this temporary password with the new user. They will need to change it on first login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted p-4">
                <Label className="text-sm text-muted-foreground">Temporary Password</Label>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-sm">
                    {tempPassword}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword);
                      toast({
                        title: 'Copied!',
                        description: 'Password copied to clipboard',
                      });
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Make sure to save this password now. You won't be able to see it again.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>
                Create a new user account for your organization. They will receive a temporary password.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Jane Doe"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="jane@visitkent.co.uk"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select name="role" required defaultValue="User">
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="User">User</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Admins can manage users and organization settings.
                  </p>
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
                  {isSubmitting ? 'Creating...' : 'Create User'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
