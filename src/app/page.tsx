'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { sendEnquiry } from '@/app/actions/send-enquiry';
import { Sparkles, Send, Globe, CheckCircle2, BarChart3, Layers } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function LandingPage() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: '', organisation: '', email: '', message: '' });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await sendEnquiry(form);
      if (result.success) {
        toast({ title: 'Message sent!', description: "We'll be in touch shortly." });
        setForm({ name: '', organisation: '', email: '', message: '' });
      } else {
        toast({ title: 'Something went wrong', description: result.error, variant: 'destructive' });
      }
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Nav ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="font-headline text-xl font-bold text-primary">PressPilot</span>
          <nav className="hidden gap-6 text-sm font-medium md:flex">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
            <a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <a href="#contact">Request a Demo</a>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:py-28">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            AI-powered PR for tourism &amp; destinations
          </div>
          <h1 className="font-headline text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            PR Made Simple for <span className="text-primary">Destination Marketing</span> Teams
          </h1>
          <p className="text-lg text-muted-foreground">
            PressPilot helps DMOs, charities and trade bodies collect partner stories, draft press releases with AI, and distribute them to the right journalists — all in one place.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <a href="#contact">Request a Demo</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>

        {/* Hero image placeholder */}
        <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border bg-muted flex items-center justify-center">
          <div className="text-center text-muted-foreground/50 p-8">
            <p className="text-sm font-medium">Hero image</p>
            <p className="text-xs mt-1">Recommended: 1200 × 800 px</p>
            <p className="text-xs">Place at public/images/hero.jpg</p>
          </div>
        </div>
      </section>

      {/* ── Benefits ──────────────────────────────────────────────── */}
      <section id="features" className="border-t bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="font-headline text-3xl font-bold sm:text-4xl">Everything you need for travel-trade PR</h2>
            <p className="mt-3 text-muted-foreground">Built for destination teams who want results, not complexity.</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            <BenefitCard
              icon={<Sparkles className="h-6 w-6 text-primary" />}
              title="AI-Powered Drafting"
              description="Generate polished press releases in seconds. Our AI understands destination marketing and adapts to your brand voice."
            />
            <BenefitCard
              icon={<Send className="h-6 w-6 text-primary" />}
              title="One-Click Distribution"
              description="Send to your full media list with a single click. Track opens, clicks and bounces in real time."
            />
            <BenefitCard
              icon={<Globe className="h-6 w-6 text-primary" />}
              title="Web-Ready Content"
              description="Automatically generate SEO-friendly web copy alongside your press release — publish without the extra effort."
            />
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-12 text-center">
            <h2 className="font-headline text-3xl font-bold sm:text-4xl">How It Works</h2>
            <p className="mt-3 text-muted-foreground">Three steps from submission to publication.</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            <StepCard number={1} title="Collect Partner Submissions" description="Partners submit their news and updates via a branded self-service portal — no chasing emails." />
            <StepCard number={2} title="Generate with AI" description="Turn raw submissions into publication-ready press releases and web copy with a single click." />
            <StepCard number={3} title="Distribute &amp; Track" description="Send to your media list, publish to your site, and monitor performance in real time." />
          </div>
        </div>
      </section>

      {/* ── Social Proof Stats ─────────────────────────────────────── */}
      <section className="border-t bg-primary py-16 text-primary-foreground">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid gap-8 text-center sm:grid-cols-3">
            <StatCard icon={<Sparkles className="h-7 w-7" />} headline="Minutes, not hours" sub="AI drafts press releases in seconds" />
            <StatCard icon={<Layers className="h-7 w-7" />} headline="One platform" sub="PR + web content + analytics, unified" />
            <StatCard icon={<BarChart3 className="h-7 w-7" />} headline="Real-time tracking" sub="Opens, clicks and bounces at a glance" />
          </div>
        </div>
      </section>

      {/* ── Feature Banner ────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="relative aspect-[16/5] bg-muted flex items-center justify-center">
          <div className="text-center text-muted-foreground/50 p-8">
            <p className="text-sm font-medium">Wide banner image</p>
            <p className="text-xs mt-1">Recommended: 1920 × 600 px</p>
            <p className="text-xs">Place at public/images/banner.jpg</p>
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 px-6">
            <blockquote className="max-w-2xl text-center text-white">
              <p className="font-headline text-2xl font-semibold sm:text-3xl">
                &ldquo;PR shouldn&apos;t take half your week. PressPilot gives that time back.&rdquo;
              </p>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ── Enquiry Form ──────────────────────────────────────────── */}
      <section id="contact" className="border-t py-20">
        <div className="mx-auto max-w-xl px-6">
          <div className="mb-10 text-center">
            <h2 className="font-headline text-3xl font-bold sm:text-4xl">Request a Demo</h2>
            <p className="mt-3 text-muted-foreground">
              Tell us a bit about your organisation and we&apos;ll be in touch to arrange a walk-through.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required value={form.name} onChange={handleChange} placeholder="Jane Smith" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="organisation">Organisation</Label>
                <Input id="organisation" name="organisation" required value={form.organisation} onChange={handleChange} placeholder="Visit Example" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required value={form.email} onChange={handleChange} placeholder="jane@visitexample.org" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" name="message" required value={form.message} onChange={handleChange} placeholder="Tell us about your team and what you're hoping to achieve…" rows={5} />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={isPending}>
              {isPending ? 'Sending…' : 'Send Message'}
            </Button>
          </form>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t bg-muted/30 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <span className="font-headline font-bold text-primary">PressPilot</span>
            <p className="text-xs text-muted-foreground mt-0.5">Your Copilot for Travel-Trade PR</p>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} PressPilot. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function BenefitCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-xl border bg-background p-6 space-y-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        {icon}
      </div>
      <h3 className="font-headline font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center text-center space-y-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-headline font-bold text-lg">
        {number}
      </div>
      <h3 className="font-headline font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StatCard({ icon, headline, sub }: { icon: React.ReactNode; headline: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="opacity-80">{icon}</div>
      <p className="font-headline text-2xl font-bold">{headline}</p>
      <p className="text-sm opacity-75">{sub}</p>
    </div>
  );
}
