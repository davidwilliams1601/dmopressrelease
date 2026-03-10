'use client';

import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

import type { SocialHandles } from '@/lib/types';

interface UserData {
  email: string;
  orgId: string;
  role: string;
  name?: string;
  initials?: string;
  createdAt: any;
  avatarUrl?: string;
  avatarStoragePath?: string;
  socialHandles?: SocialHandles;
  notificationPrefs?: {
    partnerSubmissions: boolean;
    mediaRequests: boolean;
  };
}

/**
 * Hook to fetch the current user's data from Firestore.
 * Reads orgId from FirebaseProvider context (resolved once at auth time via token claims).
 */
export function useUserData() {
  const { firestore, user, isUserLoading, orgId, isSuperAdmin } = useFirebase();

  const userDoc = useDoc<UserData>(
    useMemoFirebase(() => {
      if (!user || !orgId) return null;
      return doc(firestore, 'orgs', orgId, 'users', user.uid);
    }, [firestore, user, orgId])
  );

  return {
    userData: userDoc.data,
    isLoading: isUserLoading || (!!user && (!orgId || userDoc.isLoading)),
    error: userDoc.error,
    orgId: userDoc.data?.orgId || orgId,
    role: userDoc.data?.role,
    email: userDoc.data?.email,
    name: userDoc.data?.name,
    socialHandles: userDoc.data?.socialHandles,
    notificationPrefs: userDoc.data?.notificationPrefs,
    isSuperAdmin,
  };
}
