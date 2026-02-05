import ReleasesTable from '@/components/releases/releases-table';
import { Button } from '@/components/ui/button';
import { getReleases } from '@/lib/data';
import { PlusCircle } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Press Releases | PressPilot',
};

export default function ReleasesPage() {
  const releases = getReleases();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Press Releases</h1>
          <p className="text-muted-foreground">
            Manage your campaigns and communications.
          </p>
        </div>
        <Button>
          <PlusCircle />
          <span>New Release</span>
        </Button>
      </div>
      <ReleasesTable releases={releases} />
    </div>
  );
}
