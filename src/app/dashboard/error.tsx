'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ShieldAlert } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isPermissionError = error.message?.includes('permission') || error.message?.includes('Permission');

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            {isPermissionError ? <ShieldAlert className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            {isPermissionError ? 'Permission Error' : 'Something went wrong'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isPermissionError
              ? 'You do not have permission to access this resource. This could mean your session has expired or your account permissions have changed.'
              : 'An unexpected error occurred while loading this page.'}
          </p>
          <div className="flex gap-2">
            <Button onClick={reset} variant="default">
              Try again
            </Button>
            {isPermissionError && (
              <Button onClick={() => window.location.href = '/'} variant="outline">
                Sign in again
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
