import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — PressPilot',
  description: 'How PressPilot collects, uses, and protects your personal data.',
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-neutral max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-base prose-h2:uppercase prose-h2:tracking-wide prose-h3:text-[15px] prose-p:text-sm prose-li:text-sm prose-table:text-sm">
      <h1 className="text-center">Privacy Policy</h1>
      <p className="text-center text-gray-500 text-sm">PressPilot — Last updated: March 2026</p>

      <p>For the full privacy policy document, please see our <a href="/legal/privacy-policy.html" className="text-blue-600 underline">detailed Privacy Policy</a>.</p>

      <h2>Overview</h2>
      <p>PressPilot is operated by [Your Company Legal Name]. We are committed to protecting the privacy and security of personal data in accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.</p>

      <h2>What We Collect</h2>
      <ul>
        <li><strong>Account data</strong> — names, email addresses, login credentials, organisation details</li>
        <li><strong>Partner data</strong> — names, email addresses, business descriptions, social handles, submitted content</li>
        <li><strong>Media contact data</strong> — managed by organisations, processed on their behalf</li>
        <li><strong>Email engagement</strong> — open/click events, timestamps, IP addresses</li>
        <li><strong>Technical data</strong> — browser type, IP address, pages visited</li>
        <li><strong>Payment data</strong> — processed by Stripe (we do not store card details)</li>
      </ul>

      <h2>How We Use It</h2>
      <p>We process personal data to provide and operate the Platform, send service notifications, distribute press releases on behalf of organisations, track email engagement, and improve the Platform. Our legal bases include performance of contract, legitimate interests, and legal obligation.</p>

      <h2>Who We Share With</h2>
      <p>We use the following sub-processors: Google Cloud/Firebase (hosting and database), Twilio SendGrid (email distribution), Vercel (frontend hosting), Stripe (payments), and Google Gemini (AI features). We do not sell personal data.</p>

      <h2>Your Rights</h2>
      <p>Under UK GDPR you have the right to access, rectify, erase, restrict, port, and object to processing of your personal data. Contact us at <strong>david@press-pilot.com</strong> to exercise these rights.</p>

      <h2>Contact</h2>
      <p>For privacy enquiries: <a href="mailto:david@press-pilot.com" className="text-blue-600">david@press-pilot.com</a></p>
      <p>You may also contact the Information Commissioner&apos;s Office (ICO) at <a href="https://ico.org.uk" className="text-blue-600" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.</p>
    </article>
  );
}
