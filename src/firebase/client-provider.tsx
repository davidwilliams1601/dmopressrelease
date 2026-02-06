'use client';

import React, { useMemo, useState, useEffect, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const [isClient, setIsClient] = useState(false);
  
  const firebaseServices = useMemo(() => {
    // Only initialize Firebase on the client side
    if (typeof window === 'undefined') {
      return null;
    }
    // Initialize Firebase on the client side, once per component mount.
    return initializeFirebase();
  }, []);

  // Set isClient to true after mounting
  useEffect(() => {
    setIsClient(true);
  }, []);

  // During SSR or before client hydration, don't render anything
  if (!isClient || !firebaseServices) {
    return null;
  }

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
      storage={firebaseServices.storage}
    >
      {children}
    </FirebaseProvider>
  );
}
