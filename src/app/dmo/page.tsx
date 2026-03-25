import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'PressPilot for Destination Marketing Organisations',
  description:
    'PressPilot helps DMOs collect partner stories, distribute polished press releases, and prove membership value — without the manual legwork.',
};

export default function DmoLandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-headline text-xl font-bold tracking-tight">PressPilot</span>
          <a
            href="mailto:david@press-pilot.com?subject=Demo Request — DMO"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            Book a Demo
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
        <div className="mb-4 inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">
          Built for Destination Marketing Organisations
        </div>
        <h1 className="font-headline mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight text-gray-900 md:text-6xl">
          Give your partners the proof they&rsquo;ve been waiting for
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-500">
          PressPilot turns partner stories into polished press releases, distributes them to your media list, and gives you the engagement data to show every member exactly what their investment delivers.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="mailto:david@press-pilot.com?subject=Demo Request — DMO"
            className="rounded-md bg-gray-900 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-700"
          >
            Book a 20-Minute Demo
          </a>
          <span className="text-sm text-gray-400">No commitment. See it with your own data.</span>
        </div>
      </section>

      {/* Pain points */}
      <section className="border-y border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="mb-12 text-center text-sm font-semibold uppercase tracking-widest text-gray-400">
            Sound familiar?
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                heading: '"What do we actually get for our membership?"',
                body: 'Partners want proof. You know you\'re delivering — but pulling together the evidence is a manual job that falls to the bottom of the pile.',
              },
              {
                heading: 'One press release takes half a day',
                body: 'Chasing briefs, multiple draft rounds, sign-off emails. Multiply that across your content calendar and your week is gone before it starts.',
              },
              {
                heading: 'A full press office workload, a fraction of the headcount',
                body: 'Your team punches above its weight — but there\'s a ceiling on what\'s possible when every release is a manual process.',
              },
            ].map((item) => (
              <div key={item.heading} className="rounded-xl border border-gray-200 bg-white p-8">
                <h3 className="font-headline mb-3 text-lg font-semibold text-gray-900">
                  {item.heading}
                </h3>
                <p className="text-sm leading-relaxed text-gray-500">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-400">
              How it works
            </p>
            <h2 className="font-headline text-4xl font-bold text-gray-900">
              From partner story to media coverage in three steps
            </h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: '01',
                heading: 'Partners submit directly',
                body: 'Members submit their stories, news, and images through a simple branded portal — no emails, no chasing, no briefing calls. You get a structured brief, ready to work with.',
              },
              {
                step: '02',
                heading: 'AI drafts the release',
                body: 'PressPilot generates a polished draft in seconds, written in your organisation\'s voice. You review, refine, and approve — in a fraction of the time.',
              },
              {
                step: '03',
                heading: 'Send and show the results',
                body: 'Distribute to your media list and track opens, clicks, and page views in real time. Share those numbers with partners — proof of delivery, no spreadsheet required.',
              },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="font-headline mb-4 text-5xl font-bold text-gray-100">
                  {item.step}
                </div>
                <h3 className="font-headline mb-3 text-xl font-semibold text-gray-900">
                  {item.heading}
                </h3>
                <p className="text-sm leading-relaxed text-gray-500">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-gray-100 bg-gray-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-400">
              What&rsquo;s included
            </p>
            <h2 className="font-headline text-4xl font-bold text-gray-900">
              Everything a modern DMO press office needs
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                heading: 'Partner portal',
                body: 'A branded submission space for your members. They submit stories, you get structured content — without the back-and-forth.',
              },
              {
                heading: 'AI press release drafting',
                body: 'Trained on your boilerplate and tone of voice. Every draft sounds like you wrote it, in a fraction of the time.',
              },
              {
                heading: 'Media distribution',
                body: 'Manage your journalist lists and send directly from PressPilot. No mail merge, no BCC chains, no tracking spreadsheets.',
              },
              {
                heading: 'Engagement analytics',
                body: 'Open rates, click-throughs, and page views per release — the numbers you need to demonstrate reach to partners and stakeholders.',
              },
              {
                heading: 'Approval workflow',
                body: 'Optional review step before anything goes out. Route releases to the right person and keep a clear audit trail.',
              },
              {
                heading: 'Media requests inbox',
                body: 'Journalists can submit story requests directly to your team. One place to manage incoming enquiries and respond quickly.',
              },
            ].map((item) => (
              <div key={item.heading} className="rounded-xl border border-gray-200 bg-white p-8">
                <h3 className="font-headline mb-2 font-semibold text-gray-900">{item.heading}</h3>
                <p className="text-sm leading-relaxed text-gray-500">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why DMOs */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-400">
            Purpose-built
          </p>
          <h2 className="font-headline mb-6 text-4xl font-bold text-gray-900">
            Not a generic PR tool with a DMO skin
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-gray-500">
            PressPilot was designed specifically for organisations that manage content on behalf of members and partners. The partner submission model, the multi-stakeholder workflow, the engagement reporting — all of it is built around how DMOs actually operate.
          </p>
          <div className="mx-auto grid max-w-2xl gap-4 text-left sm:grid-cols-2">
            {[
              'Partner portal with your branding',
              'AI trained on your tone of voice',
              'Per-partner submission limits',
              'Real-time engagement analytics',
              'Journalist media request inbox',
              'Role-based team access',
              'Approval workflow built in',
              'White-label press pages',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-gray-700">
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-white">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-24 text-white">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-headline mb-4 text-4xl font-bold">
            See PressPilot with your own content
          </h2>
          <p className="mb-10 text-lg leading-relaxed text-gray-400">
            A 20-minute demo tailored to how your team works. No slides, no generic walkthrough — we&rsquo;ll show you exactly how PressPilot fits into your press office.
          </p>
          <a
            href="mailto:david@press-pilot.com?subject=Demo Request — DMO"
            className="inline-block rounded-md bg-white px-10 py-4 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
          >
            Book a Demo
          </a>
          <p className="mt-4 text-sm text-gray-500">
            Or email us directly at{' '}
            <a href="mailto:david@press-pilot.com" className="text-gray-300 underline underline-offset-2">
              david@press-pilot.com
            </a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-400">
          <span className="font-headline font-semibold text-gray-900">PressPilot</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
            <Link href="/legal/terms" className="hover:underline">Terms</Link>
            <Link href="/legal/acceptable-use" className="hover:underline">Acceptable Use</Link>
          </div>
          <span className="text-xs">© {new Date().getFullYear()} PressPilot. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
