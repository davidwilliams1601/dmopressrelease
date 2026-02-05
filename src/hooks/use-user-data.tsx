'use client';

import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

interface UserData {
  email: string;
  orgId: string;
  role: string;
  createdAt: any;
}

/**
 * Hook to fetch the current user's data from Firestore.
 * Returns the user document from orgs/{orgId}/users/{userId}
 */
export function useUserData() {
  const { firestore, user, isUserLoading } = useFirebase();

  // For now, we hardcode the orgId since we need it to construct the path
  // In a production app, you might store this in the user's Firebase Auth custom claims
  // or have a root-level users collection that maps uid -> orgId
  const orgId = 'visit-kent';

  const userDoc = useDoc<UserData>(
    useMemoFirebase(() => {
      if (!user || !orgId) return null;
      return doc(firestore, 'orgs', orgId, 'users', user.uid);
    }, [firestore, user, orgId])
  );

  return {
    userData: userDoc.data,
    isLoading: isUserLoading || userDoc.isLoading,
    error: userDoc.error,
    orgId: userDoc.data?.orgId || orgId,
  };
}
