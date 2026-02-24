'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Save, Camera, Loader2 } from 'lucide-react';
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
import { uploadAvatarImage } from '@/lib/storage';
import { ref, deleteObject } from 'firebase/storage';

export default function UserProfileCard() {
  const { user, firestore, storage } = useFirebase();
  const { userData, orgId } = useUserData();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (userData) {
      setName(userData.name || '');
      setEmail(userData.email || '');
      setAvatarUrl(userData.avatarUrl);
    }
  }, [userData]);

  const originalEmail = userData?.email || '';
  const emailChanged = email.trim().toLowerCase() !== originalEmail.toLowerCase();

  const initials = (userData?.initials || userData?.name?.split(' ').map((n) => n[0]).join('') || '?')
    .toUpperCase()
    .slice(0, 2);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !orgId) return;

    setIsUploadingAvatar(true);
    try {
      // Delete old avatar from Storage if one exists
      if (userData?.avatarStoragePath) {
        try {
          const oldRef = ref(storage, userData.avatarStoragePath);
          await deleteObject(oldRef);
        } catch {
          // Ignore — old file may already be gone
        }
      }

      const { storagePath, downloadUrl } = await uploadAvatarImage(storage, orgId, user.uid, file);

      // Update Firebase Auth photoURL
      await updateProfile(user, { photoURL: downloadUrl });

      // Update Firestore
      const userRef = doc(firestore, 'orgs', orgId, 'users', user.uid);
      await updateDoc(userRef, {
        avatarUrl: downloadUrl,
        avatarStoragePath: storagePath,
        updatedAt: serverTimestamp(),
      });

      setAvatarUrl(downloadUrl);
      toast({ title: 'Avatar updated', description: 'Your profile photo has been saved.' });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message || 'Failed to upload avatar.', variant: 'destructive' });
    } finally {
      setIsUploadingAvatar(false);
      // Reset input so the same file can be re-selected if needed
      e.target.value = '';
    }
  };

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
      if (emailChanged) {
        if (!user.email) throw new Error('No current email on account.');
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updateEmail(user, email.trim());
      }

      await updateProfile(user, { displayName: trimmedName });

      const newInitials = trimmedName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      const userRef = doc(firestore, 'orgs', orgId, 'users', user.uid);
      await updateDoc(userRef, {
        name: trimmedName,
        initials: newInitials,
        ...(emailChanged ? { email: email.trim() } : {}),
        updatedAt: serverTimestamp(),
      });

      toast({ title: 'Profile updated', description: 'Your profile has been saved.' });
      setCurrentPassword('');
    } catch (error: any) {
      const isWrongPassword =
        error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential';
      const isEmailInUse = error.code === 'auth/email-already-in-use';
      toast({
        title: isWrongPassword ? 'Incorrect password' : isEmailInUse ? 'Email already in use' : 'Failed to update profile',
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
            Update your profile photo, display name, and login email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* Avatar upload */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="size-16">
                <AvatarImage src={avatarUrl} alt={name} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={isUploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition-opacity disabled:opacity-50"
                aria-label="Upload profile photo"
              >
                {isUploadingAvatar
                  ? <Loader2 className="size-5 text-white animate-spin" />
                  : <Camera className="size-5 text-white" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div>
              <p className="text-sm font-medium">Profile Photo</p>
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={isUploadingAvatar}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {isUploadingAvatar ? 'Uploading…' : 'Upload new photo'}
              </button>
              <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG or WebP. Max 5 MB.</p>
            </div>
          </div>

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
            {isSaving ? 'Saving…' : 'Save Profile'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
