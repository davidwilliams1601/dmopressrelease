import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Book, AlertCircle } from 'lucide-react';

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
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="font-headline text-2xl">Organisation Link Required</CardTitle>
          </div>
          <CardDescription>
            To submit a story request, please use the specific link provided by the
            organisation you&apos;re pitching to. Contact their press team if you need
            the correct link.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </main>
  );
}
