'use client';

import { useEffect } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import { useRouter } from 'next/navigation';

/**
 * Hook that redirects authenticated users based on their role.
 * Partners -> /portal, Admin/User -> /dashboard
 */
export function useRedirectByRole() {
  const { role, isLoading } = useUserData();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !role) return;

    if (role === 'Partner') {
      router.replace('/portal');
    } else {
      router.replace('/dashboard');
    }
  }, [role, isLoading, router]);

  return { role, isLoading };
}
