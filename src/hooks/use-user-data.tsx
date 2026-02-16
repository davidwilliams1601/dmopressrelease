'use client';

import { useState, useEffect } from 'react';
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
 * Reads orgId from Firebase Auth custom claims (set during user creation).
 * Falls back to 'visit-kent' for users created before custom claims were added.
 */
export function useUserData() {
  const { firestore, user, isUserLoading } = useFirebase();
  const [orgId, setOrgId] = useState<string | null>(null);

  // Read orgId from the user's ID token custom claims
  useEffect(() => {
    if (!user) {
      setOrgId(null);
      return;
    }

    user.getIdTokenResult().then((tokenResult) => {
      const claimsOrgId = tokenResult.claims.orgId as string | undefined;
      // Use custom claim if available, otherwise fall back for legacy users
      setOrgId(claimsOrgId || 'visit-kent');
    }).catch(() => {
      setOrgId('visit-kent');
    });
  }, [user]);

  const userDoc = useDoc<UserData>(
    useMemoFirebase(() => {
      if (!user || !orgId) return null;
      return doc(firestore, 'orgs', orgId, 'users', user.uid);
    }, [firestore, user, orgId])
  );

  return {
    userData: userDoc.data,
    isLoading: isUserLoading || !orgId || userDoc.isLoading,
    error: userDoc.error,
    orgId: userDoc.data?.orgId || orgId,
    role: userDoc.data?.role,
    email: userDoc.data?.email,
    name: userDoc.data?.name,
  };
}
