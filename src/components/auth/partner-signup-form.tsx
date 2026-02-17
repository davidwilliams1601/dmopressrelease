'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, UserPlus } from 'lucide-react';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

type PartnerSignupFormProps = {
  inviteCode: string;
};

export default function PartnerSignupForm({ inviteCode }: PartnerSignupFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const redeemInvite = httpsCallable(functions, 'redeemPartnerInvite');

      await redeemInvite({
        code: inviteCode,
        email,
        password,
        name,
      });

      // Sign in with the newly created account
      await signInWithEmailAndPassword(auth, email, password);

      toast({
        title: 'Account created',
        description: 'Welcome to PressPilot!',
      });

      router.push('/portal');
    } catch (error: any) {
      console.error('Error signing up:', error);

      let errorMessage = 'There was a problem creating your account. Please try again.';
      if (error.code === 'functions/not-found') {
        errorMessage = 'Invalid or expired invite code.';
      } else if (error.code === 'functions/already-exists') {
        errorMessage = 'An account with this email already exists.';
      } else if (error.code === 'functions/failed-precondition') {
        errorMessage = error.message || 'This invite link is no longer valid.';
      }

      setError(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Signup Failed',
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Full Name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Jane Doe"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Must be at least 6 characters.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Signup Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        <UserPlus />
        {loading ? 'Creating account...' : 'Create Partner Account'}
      </Button>
    </form>
  );
}
