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
  Building2,
  BarChart3,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useUserData } from '@/hooks/use-user-data';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import UserNav from './user-nav';

export default function AppSidebar() {
  const pathname = usePathname();
  const { role, isSuperAdmin, orgId } = useUserData();
  const { config } = useVerticalConfig(orgId);

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { href: '/dashboard/releases', icon: FileText, label: config.nav.releases },
    { href: '/dashboard/content', icon: Globe, label: config.nav.content },
    { href: '/dashboard/submissions', icon: Inbox, label: config.nav.submissions },
    { href: '/dashboard/media-requests', icon: Newspaper, label: config.nav.mediaRequests },
    { href: '/dashboard/outlets', icon: Users, label: config.nav.outlets },
    { href: '/dashboard/settings/team', icon: UserCog, label: 'Team' },
    { href: '/dashboard/reports', icon: BarChart3, label: 'Reports', adminOnly: true },
    { href: '/dashboard/settings/tags', icon: Tag, label: 'Tags', adminOnly: true },
    { href: '/dashboard/settings/partners', icon: LinkIcon, label: config.nav.partnersSettings, adminOnly: true },
    { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
  ];
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
        {isSuperAdmin && (
          <>
            <SidebarSeparator className="my-2" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith('/dashboard/admin')}
                  tooltip={{ children: 'Organisations' }}
                >
                  <a href="/dashboard/admin/orgs">
                    <Building2 />
                    <span>Organisations</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
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
