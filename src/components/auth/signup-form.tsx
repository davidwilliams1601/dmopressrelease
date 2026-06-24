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
import { getTierConfig, type TierId } from '@/lib/tiers';

export default function SignupForm({ plan }: { plan: TierId }) {
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const tier = getTierConfig(plan);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const createOrg = httpsCallable(functions, 'createOrgWithTrial');

      await createOrg({ orgName, name, email, password, plan });

      // Sign in with the newly created account (token now carries the orgId claim).
      await signInWithEmailAndPassword(auth, email, password);

      toast({
        title: 'Welcome to PressPilot!',
        description: `Your 30-day ${tier.name} trial has started.`,
      });

      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error signing up:', error);
      let errorMessage = 'There was a problem creating your account. Please try again.';
      if (error.code === 'functions/already-exists') {
        errorMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (error.code === 'functions/invalid-argument') {
        errorMessage = error.message || 'Please check the details you entered.';
      } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'Account created, but automatic sign-in failed. Please sign in.';
      }
      setError(errorMessage);
      toast({ variant: 'destructive', title: 'Sign up failed', description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="orgName">Organisation Name</Label>
        <Input
          id="orgName"
          name="orgName"
          type="text"
          placeholder="e.g. Visit Kent"
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          suppressHydrationWarning
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Your Name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Jane Doe"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          suppressHydrationWarning
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Work Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          suppressHydrationWarning
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
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          suppressHydrationWarning
        />
        <p className="text-xs text-muted-foreground">At least 6 characters.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sign up failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        <UserPlus />
        {loading ? 'Creating your account...' : `Start ${tier.name} trial`}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        30-day free trial · no credit card required · cancel anytime
      </p>
    </form>
  );
}
