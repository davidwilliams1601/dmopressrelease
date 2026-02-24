'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth, useUser } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { LogOut, User } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Skeleton } from '../ui/skeleton';

export default function UserNav() {
  const { user, isUserLoading } = useUser();
  const { userData } = useUserData();
  const auth = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

  if (isUserLoading) {
    return <Skeleton className="h-8 w-8 rounded-full md:w-full md:h-12" />;
  }

  if (!user) {
    return null;
  }

  const userDisplayName = user.displayName || user.email || 'User';
  const userEmail = user.email || '';
  const userInitials =
    user.displayName
      ?.split(' ')
      .map((n) => n[0])
      .join('') || userEmail.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative size-8 rounded-full md:size-auto md:w-full md:justify-start md:gap-2 md:rounded-md md:p-2"
        >
          <Avatar className="size-8">
            <AvatarImage src={userData?.avatarUrl} alt={userDisplayName} />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start md:flex">
            <span className="text-sm font-medium">{userDisplayName}</span>
            <span className="text-xs text-muted-foreground">{userEmail}</span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarImage src={userData?.avatarUrl} alt={userDisplayName} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col space-y-0.5">
              <p className="text-sm font-medium leading-none">{userDisplayName}</p>
              <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <a href="/dashboard/settings">
              <User className="mr-2 h-4 w-4" />
              <span>Profile &amp; Settings</span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <button onClick={handleLogout} className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
