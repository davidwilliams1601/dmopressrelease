'use client';

import PartnerSidebar from '@/components/layout/partner-sidebar';
import AppHeader from '@/components/layout/header';
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
} from '@/components/ui/sidebar';
import { useUser } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const { role, isLoading: isRoleLoading } = useUserData();
  const router = useRouter();

  useEffect(() => {
    // Wait for both auth and role to finish loading
    if (isUserLoading || isRoleLoading) return;

    if (!user) {
      router.push('/');
      return;
    }
    // Redirect non-partners (Admin/User) to the dashboard.
    // Do NOT redirect when role is undefined — that can happen for one render
    // before useDoc sets isLoading=true (useDoc initialises to false). The
    // render guard already shows a skeleton in that state, so we just wait.
    if (role && role !== 'Partner') {
      router.push('/dashboard');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isUserLoading, isRoleLoading, role]);

  // Don't render portal content until we've confirmed Partner role.
  // useEffect handles the redirect; this prevents the one-frame flash
  // that fires Firestore queries before the redirect completes.
  if (isUserLoading || isRoleLoading || !user || role !== 'Partner') {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset" side="left">
        <PartnerSidebar />
      </Sidebar>
      <SidebarInset>
        <AppHeader />
        <main className="p-4 lg:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
