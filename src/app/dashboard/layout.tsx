'use client';
import AppSidebar from '@/components/layout/app-sidebar';
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const { role, isLoading: isRoleLoading } = useUserData();
  const router = useRouter();

  useEffect(() => {
    // Wait for both auth AND role to finish loading before redirecting.
    // This prevents race conditions where a brief null user mid-auth
    // fires a redirect to '/', causing a back-and-forth loop with the login page.
    if (isUserLoading || isRoleLoading) return;

    if (!user) {
      router.push('/');
      return;
    }
    // Redirect partners to the portal
    if (role === 'Partner') {
      router.push('/portal');
    }
  // router is intentionally excluded from deps — its reference can change during
  // navigation in Next.js App Router, which would re-fire this effect and cause
  // the redirect loop. router.push is a stable API, not reactive data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isUserLoading, isRoleLoading, role]);

  // Render guard uses auth-only loading so the layout appears immediately
  // once Firebase Auth resolves, without waiting for the Firestore user doc.
  if (isUserLoading || !user) {
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
        <AppSidebar />
      </Sidebar>
      <SidebarInset>
        <AppHeader />
        <main className="p-4 lg:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
