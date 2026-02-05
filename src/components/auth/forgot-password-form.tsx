'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Mail, CheckCircle } from 'lucide-react';
import { useAuth } from '@/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const auth = useAuth();
  const { toast } = useToast();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await sendPasswordResetEmail(auth, email);
      setSubmitted(true);
    } catch (error: any) {
      setError(error.message);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error.code === 'auth/user-not-found'
            ? 'No account found with this email address.'
            : error.message,
      });
    } finally {
      setLoading(false);
    }
  };
  
  if (submitted) {
    return (
        <Alert variant="default" className="border-green-500/50 text-green-700 dark:border-green-500 [&>svg]:text-green-700">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Check Your Email</AlertTitle>
          <AlertDescription>
            A password reset link has been sent to <strong>{email}</strong> if an account exists with that address.
          </AlertDescription>
        </Alert>
    );
  }

  return (
    <form onSubmit={handleReset} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="dmo@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          suppressHydrationWarning
        />
        <p className="text-xs text-muted-foreground">
            Enter the email address associated with your account.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        <Mail />
        {loading ? 'Sending...' : 'Send Reset Link'}
      </Button>
    </form>
  );
}
