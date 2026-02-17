'use client';
import LoginForm from '@/components/auth/login-form';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useUser } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

// Disable static generation for this page since it uses Firebase
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const { user, isUserLoading } = useUser();
  const { role } = useUserData();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && user && role) {
      if (role === 'Partner') {
        router.push('/portal');
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, isUserLoading, role, router]);

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
          Your Copilot for Travel-Trade PR
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">
            Welcome Back
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
        <Separator className="my-4" />
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
