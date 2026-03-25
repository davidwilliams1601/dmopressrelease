import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — PressPilot',
  description: 'PressPilot SaaS subscription agreement and terms of service.',
};

export default function TermsPage() {
  return (
    <article className="prose prose-neutral max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-base prose-h2:uppercase prose-h2:tracking-wide prose-h3:text-[15px] prose-p:text-sm prose-li:text-sm prose-table:text-sm">
      <h1 className="text-center">Terms of Service</h1>
      <p className="text-center text-gray-500 text-sm">PressPilot — Last updated: March 2026</p>

      <p>For the full SaaS subscription agreement, please see our <a href="/legal/saas-subscription-agreement.html" className="text-blue-600 underline">detailed Terms</a>.</p>

      <h2>The Platform</h2>
      <p>PressPilot is a press release management platform that enables organisations to create, distribute, and track press releases, manage media contacts, collect partner content submissions, and generate reports. Access is provided on an annual subscription basis.</p>

      <h2>Subscription and Payment</h2>
      <ul>
        <li>Subscriptions are annual, billed in GBP</li>
        <li>Three tiers available: Starter, Professional, and Organisation</li>
        <li>Invoices are payable within 14 days of the invoice date</li>
        <li>Platform access is activated upon receipt of payment</li>
        <li>Subscriptions auto-renew unless 60 days&apos; notice of non-renewal is given</li>
      </ul>

      <h2>Your Data</h2>
      <ul>
        <li>You retain full ownership of all content and data you upload</li>
        <li>We process your data solely to provide the Platform</li>
        <li>Upon termination, you have 30 days to export your data</li>
        <li>Data processing is governed by our Data Processing Agreement</li>
      </ul>

      <h2>AI-Generated Content</h2>
      <p>The Platform includes AI features for content generation (press releases, headlines, social posts, tone enhancement). AI-generated content is provided as a drafting aid only. You are solely responsible for reviewing, editing, and approving all content before publication or distribution.</p>

      <h2>Service Availability</h2>
      <p>We target 99.5% uptime in any calendar month, excluding scheduled maintenance. Support is provided via email during UK business hours. Organisation tier customers receive priority support and a named account manager.</p>

      <h2>Liability</h2>
      <p>Our total liability is capped at the subscription fees paid in the 12 months preceding any claim. We exclude liability for indirect, consequential, or incidental losses. Nothing limits liability for death, personal injury, or fraud.</p>

      <h2>Termination</h2>
      <ul>
        <li>Either party may terminate with 60 days&apos; notice at end of term</li>
        <li>Either party may terminate immediately for material breach (with 30 days to remedy)</li>
        <li>On termination, access ceases and data is available for export for 30 days</li>
      </ul>

      <h2>Governing Law</h2>
      <p>This agreement is governed by the laws of England and Wales. The courts of England and Wales have exclusive jurisdiction.</p>

      <h2>Contact</h2>
      <p>For contractual enquiries: <a href="mailto:david@press-pilot.com" className="text-blue-600">david@press-pilot.com</a></p>
    </article>
  );
}
