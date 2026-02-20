'use client';

import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  FileText,
  Users,
  UserCog,
  Settings,
  CircleHelp,
  Book,
  Inbox,
  Tag,
  Link as LinkIcon,
  Newspaper,
  Globe,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useUserData } from '@/hooks/use-user-data';
import UserNav from './user-nav';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { href: '/dashboard/releases', icon: FileText, label: 'Releases' },
  { href: '/dashboard/content', icon: Globe, label: 'Content' },
  { href: '/dashboard/submissions', icon: Inbox, label: 'Submissions' },
  { href: '/dashboard/media-requests', icon: Newspaper, label: 'Media Requests' },
  { href: '/dashboard/outlets', icon: Users, label: 'Outlets' },
  { href: '/dashboard/settings/team', icon: UserCog, label: 'Team' },
  { href: '/dashboard/settings/tags', icon: Tag, label: 'Tags', adminOnly: true },
  { href: '/dashboard/settings/partners', icon: LinkIcon, label: 'Partners', adminOnly: true },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { role } = useUserData();
  const isAdmin = role === 'Admin';

  const filteredNavItems = navItems.filter(
    (item) => !('adminOnly' in item) || isAdmin
  );

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2 p-2">
          <Book className="size-6 text-primary" />
          <span className="text-lg font-headline font-semibold">
            PressPilot
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {filteredNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                tooltip={{ children: item.label }}
              >
                <a href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={{ children: 'Help & Support' }}>
              <CircleHelp />
              <span>Help & Support</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <div className="hidden md:block">
          <UserNav />
        </div>
      </SidebarFooter>
    </>
  );
}
