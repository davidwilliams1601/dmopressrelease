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
  Inbox,
  PenSquare,
  CircleHelp,
  Book,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import UserNav from './user-nav';

const navItems = [
  { href: '/portal', icon: Inbox, label: 'My Submissions', exact: true },
  { href: '/portal/submit', icon: PenSquare, label: 'New Submission' },
];

export default function PartnerSidebar() {
  const pathname = usePathname();

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2 p-2">
          <Book className="size-6 text-primary" />
          <span className="text-lg font-headline font-semibold">
            PressPilot
          </span>
        </div>
        <div className="px-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Partner Portal
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {navItems.map((item) => (
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
