'use client';

import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

interface UserData {
  email: string;
  orgId: string;
  role: string;
  name?: string;
  initials?: string;
  createdAt: any;
}

/**
 * Hook to fetch the current user's data from Firestore.
 * Reads orgId from FirebaseProvider context (resolved once at auth time via token claims).
 */
export function useUserData() {
  const { firestore, user, isUserLoading, orgId } = useFirebase();

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
  };
}
