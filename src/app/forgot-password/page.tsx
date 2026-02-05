'use client';
export const dynamic = 'force-dynamic';
import ForgotPasswordForm from '@/components/auth/forgot-password-form';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || user) {
    // Don't show this page if user is logged in, redirect them
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
          Your Copilot for Travel-Trade PR
        </p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">
            Reset Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
        <CardFooter>
            <Link href="/" className="flex items-center text-sm font-medium text-primary hover:underline">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back to log in
            </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
