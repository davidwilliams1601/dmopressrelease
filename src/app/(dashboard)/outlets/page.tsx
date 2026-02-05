import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Outlet Lists | PressPilot',
};


export default function OutletsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Outlet Lists</h1>
          <p className="text-muted-foreground">
            Manage your recipient lists for syndication.
          </p>
        </div>
        <Button>
          <Upload />
          <span>Import List</span>
        </Button>
      </div>

      <Card className='text-center'>
        <CardHeader>
            <CardTitle className="font-headline">Coming Soon</CardTitle>
            <CardDescription>This section is under construction.</CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">You'll soon be able to create and manage your press outlet lists here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
