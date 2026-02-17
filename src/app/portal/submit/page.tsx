'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { SubmissionForm } from '@/components/portal/submission-form';

export const dynamic = 'force-dynamic';

export default function SubmitPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/portal">
            <ArrowLeft />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-headline font-bold">New Submission</h1>
          <p className="text-muted-foreground">
            Submit content for the press team to review and include in press releases.
          </p>
        </div>
      </div>

      <SubmissionForm />
    </div>
  );
}
