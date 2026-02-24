'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updateProfile,
} from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function UserProfileCard() {
  const { auth, user, firestore } = useFirebase();
  const { userData, orgId } = useUserData();
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  // Seed fields once userData is loaded
  useEffect(() => {
    if (userData) {
      setName(userData.name || '');
      setEmail(userData.email || '');
    }
  }, [userData]);

  const originalEmail = userData?.email || '';
  const emailChanged = email.trim().toLowerCase() !== originalEmail.toLowerCase();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !orgId) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: 'Name required', description: 'Please enter your full name.', variant: 'destructive' });
      return;
    }

    if (emailChanged && !currentPassword) {
      toast({ title: 'Password required', description: 'Enter your current password to change your email.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      // Reauthenticate first if email is changing
      if (emailChanged) {
        if (!user.email) throw new Error('No current email on account.');
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updateEmail(user, email.trim());
      }

      // Update Firebase Auth display name
      await updateProfile(user, { displayName: trimmedName });

      // Derive initials from name
      const initials = trimmedName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      // Update Firestore user document
      const userRef = doc(firestore, 'orgs', orgId, 'users', user.uid);
      await updateDoc(userRef, {
        name: trimmedName,
        initials,
        ...(emailChanged ? { email: email.trim() } : {}),
        updatedAt: serverTimestamp(),
      });

      toast({ title: 'Profile updated', description: 'Your profile has been saved.' });
      setCurrentPassword('');
    } catch (error: any) {
      const isWrongPassword =
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential';
      const isEmailInUse = error.code === 'auth/email-already-in-use';
      toast({
        title: isWrongPassword
          ? 'Incorrect password'
          : isEmailInUse
          ? 'Email already in use'
          : 'Failed to update profile',
        description: isWrongPassword
          ? 'The current password you entered is incorrect.'
          : isEmailInUse
          ? 'That email address is already associated with another account.'
          : error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Your Profile</CardTitle>
          <CardDescription>
            Update your display name and login email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Full Name</Label>
            <Input
              id="profile-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-email">Email Address</Label>
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              required
            />
            {emailChanged && (
              <p className="text-xs text-muted-foreground">
                Changing your email requires your current password to confirm.
              </p>
            )}
          </div>
          {emailChanged && (
            <div className="grid gap-2">
              <Label htmlFor="profile-current-password">Current Password</Label>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button type="submit" disabled={isSaving || !name}>
            <Save />
            {isSaving ? 'Saving...' : 'Save Profile'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
