import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Book } from 'lucide-react';
import StoryRequestForm from '@/components/media/story-request-form';

export const dynamic = 'force-dynamic';

export default function MediaPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-8">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Book className="size-8 text-primary" />
          <span className="text-4xl sm:text-5xl font-headline font-bold text-primary">
            PressPilot
          </span>
        </div>
        <p className="text-muted-foreground mt-1">Media &amp; Press Enquiries</p>
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Story Request</CardTitle>
          <CardDescription>
            Pitching a story? Tell us about your angle and we&apos;ll be in touch with
            assets, contacts, and any other support you need.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StoryRequestForm />
        </CardContent>
      </Card>

      <p className="mt-6 text-sm text-muted-foreground text-center max-w-sm">
        Fields marked with * are required. We aim to respond within 2 business days.
      </p>
    </main>
  );
}
