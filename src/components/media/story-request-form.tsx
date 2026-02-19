'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Send, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function StoryRequestForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [outlet, setOutlet] = useState('');
  const [topic, setTopic] = useState('');
  const [destinations, setDestinations] = useState('');
  const [deadline, setDeadline] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const submitRequest = httpsCallable(functions, 'submitStoryRequest');

      await submitRequest({
        name,
        email,
        outlet,
        topic,
        destinations,
        deadline,
        additionalInfo,
        honeypot,
      });

      setSubmitted(true);
      toast({
        title: 'Request submitted',
        description: "We'll be in touch soon.",
      });
    } catch (err: any) {
      console.error('Error submitting story request:', err);

      let errorMessage = 'There was a problem submitting your request. Please try again.';
      if (err.code === 'functions/resource-exhausted') {
        errorMessage = 'Too many requests from this email address. Please try again later.';
      } else if (err.code === 'functions/invalid-argument') {
        errorMessage = err.message || 'Please check your submission and try again.';
      } else if (err.code === 'functions/permission-denied') {
        errorMessage = 'Your submission was rejected. Please try again.';
      }

      setError(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <div>
          <h2 className="text-xl font-semibold">Request Received!</h2>
          <p className="mt-2 text-muted-foreground">
            Thank you for reaching out. Our team will review your story request and get
            back to you at <strong>{email}</strong> shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot — hidden from real users, filled by bots */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Jane Smith"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="jane@publication.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="outlet">Publication / Outlet *</Label>
        <Input
          id="outlet"
          name="outlet"
          type="text"
          placeholder="e.g. Travel Weekly, The Times"
          required
          value={outlet}
          onChange={(e) => setOutlet(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="topic">Story Topic / Angle *</Label>
        <Textarea
          id="topic"
          name="topic"
          placeholder="Tell us about your story idea and what you're looking for..."
          required
          rows={4}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="destinations">Destinations of Interest</Label>
        <Input
          id="destinations"
          name="destinations"
          type="text"
          placeholder="e.g. Canterbury, Whitstable, Herne Bay"
          value={destinations}
          onChange={(e) => setDestinations(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="deadline">Deadline</Label>
        <Input
          id="deadline"
          name="deadline"
          type="text"
          placeholder="e.g. March 15, 2026"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="additionalInfo">Additional Information</Label>
        <Textarea
          id="additionalInfo"
          name="additionalInfo"
          placeholder="Any other details, image requirements, or specific contacts you'd like to reach..."
          rows={3}
          value={additionalInfo}
          onChange={(e) => setAdditionalInfo(e.target.value)}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Submission Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        <Send className="h-4 w-4" />
        {loading ? 'Submitting...' : 'Submit Story Request'}
      </Button>
    </form>
  );
}
