'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [consentContentUsage, setConsentContentUsage] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
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
        consentContentUsage,
        consentMarketing,
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

      <div className="space-y-3 rounded-md border p-4">
        <p className="text-sm font-medium">Consent &amp; Privacy</p>
        <div className="flex items-start gap-3">
          <Checkbox
            id="consentContentUsage"
            checked={consentContentUsage}
            onCheckedChange={(v) => setConsentContentUsage(v === true)}
            required
          />
          <Label htmlFor="consentContentUsage" className="text-sm font-normal leading-snug cursor-pointer">
            I agree that content I submit may be used in press releases, website updates, and other publications produced by the DMO. I have read and accept the{' '}
            <a href="/privacy" target="_blank" className="underline text-primary">Privacy Policy</a>. <span className="text-destructive">*</span>
          </Label>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="consentMarketing"
            checked={consentMarketing}
            onCheckedChange={(v) => setConsentMarketing(v === true)}
          />
          <Label htmlFor="consentMarketing" className="text-sm font-normal leading-snug cursor-pointer">
            I&apos;m happy to receive occasional updates and opportunities from the DMO, such as campaign briefs and partner news. (Optional)
          </Label>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Signup Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading || !consentContentUsage}>
        <UserPlus />
        {loading ? 'Creating account...' : 'Create Partner Account'}
      </Button>
    </form>
  );
}
