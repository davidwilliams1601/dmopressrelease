'use client';

import PartnerSignupForm from '@/components/auth/partner-signup-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useUser } from '@/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function PartnerSignupPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/portal');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-8">
      <div className="flex flex-col items-center text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-headline font-bold text-primary">
          PressPilot
        </h1>
        <p className="text-muted-foreground mt-2">
          Partner Portal
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">
            Partner Sign Up
          </CardTitle>
          <CardDescription>
            Create your partner account to start submitting content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {code ? (
            <PartnerSignupForm inviteCode={code} />
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Missing Invite Code</AlertTitle>
              <AlertDescription>
                You need a valid invite link to create a partner account. Please contact your DMO for an invite.
              </AlertDescription>
            </Alert>
          )}
          <div className="mt-4 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/" className="font-medium text-primary hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
