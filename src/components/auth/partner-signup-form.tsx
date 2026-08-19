'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, UserPlus } from 'lucide-react';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { getVerticalConfig, DEFAULT_VERTICAL } from '@/lib/verticals';

type PartnerSignupFormProps = {
  inviteCode: string;
};

export default function PartnerSignupForm({ inviteCode }: PartnerSignupFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [consentContentUsage, setConsentContentUsage] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [verticalConfig, setVerticalConfig] = useState(DEFAULT_VERTICAL);
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // Look up the invite before the partner submits, so the form can show the
  // right organisation name and vertical-appropriate copy (e.g. a school
  // shouldn't be asked to "tell us about your business"). Read-only lookup —
  // does not consume the invite or require auth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions();
        const lookupInvite = httpsCallable(functions, 'getPartnerInviteInfo');
        const result: any = await lookupInvite({ code: inviteCode });
        if (cancelled) return;
        if (result.data?.valid) {
          setOrgName(result.data.orgName || null);
          setVerticalConfig(getVerticalConfig(result.data.vertical));
        }
      } catch (err) {
        // Non-fatal — the form falls back to default (DMO) copy and the real
        // validation still happens server-side when the invite is redeemed.
        console.warn('Could not look up invite info, using default copy:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

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
        businessDescription,
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

      <div className="space-y-2">
        <Label htmlFor="businessDescription">Tell us about your {verticalConfig.partnerSignup.noun}</Label>
        <Textarea
          id="businessDescription"
          name="businessDescription"
          placeholder={verticalConfig.partnerSignup.descriptionPlaceholder}
          rows={4}
          value={businessDescription}
          onChange={(e) => setBusinessDescription(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          A short description helps us match you with the most relevant press opportunities. (Optional)
        </p>
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
            {verticalConfig.consent.contentUsage} I have read and accept the{' '}
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
            {verticalConfig.consent.marketing} (Optional)
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
