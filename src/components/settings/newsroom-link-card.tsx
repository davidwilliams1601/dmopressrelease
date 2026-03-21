'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Props = {
  orgSlug: string;
};

export default function NewsroomLinkCard({ orgSlug }: Props) {
  const { toast } = useToast();
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/newsroom/${orgSlug}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    toast({ title: 'Copied!', description: 'Newsroom link copied to clipboard.' });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="font-headline">Public Newsroom</CardTitle>
        </div>
        <CardDescription>
          A public page listing all published press releases. Share it on your website
          or link to it from your media kit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
          <code className="flex-1 font-mono text-sm break-all text-muted-foreground">
            /newsroom/{orgSlug}
          </code>
          <Button size="sm" variant="outline" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
