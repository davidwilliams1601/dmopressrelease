'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Newspaper } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Props = {
  orgSlug: string;
};

export default function MediaEnquiryLinkCard({ orgSlug }: Props) {
  const { toast } = useToast();
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/media/${orgSlug}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    toast({ title: 'Copied!', description: 'Media enquiry link copied to clipboard.' });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="font-headline">Media Enquiry Link</CardTitle>
        </div>
        <CardDescription>
          Share this link with journalists so their story requests route directly to
          your organisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
          <code className="flex-1 font-mono text-sm break-all text-muted-foreground">
            /media/{orgSlug}
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
