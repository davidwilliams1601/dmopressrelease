import { SidebarTrigger } from '@/components/ui/sidebar';
import UserNav from './user-nav';

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 w-full items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm lg:px-6">
      <div className="md:hidden">
        <SidebarTrigger />
      </div>
      <div className="flex-1" />
      <div className="md:hidden">
        <UserNav />
      </div>
    </header>
  );
}
