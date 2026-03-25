import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acceptable Use Policy — PressPilot',
  description: 'Rules and guidelines for using the PressPilot platform.',
};

export default function AcceptableUsePage() {
  return (
    <article className="prose prose-neutral max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-base prose-h2:uppercase prose-h2:tracking-wide prose-h3:text-[15px] prose-p:text-sm prose-li:text-sm prose-table:text-sm">
      <h1 className="text-center">Acceptable Use Policy</h1>
      <p className="text-center text-gray-500 text-sm">PressPilot — Last updated: March 2026</p>

      <p>For the full policy, please see our <a href="/legal/acceptable-use-policy.html" className="text-blue-600 underline">detailed Acceptable Use Policy</a>.</p>

      <h2>Email Distribution</h2>
      <ul>
        <li>Only email legitimate media contacts with a reasonable expectation of receiving press communications</li>
        <li>Maintain accurate, up-to-date contact lists and promptly remove bounces and unsubscribes</li>
        <li>Honour unsubscribe requests within 5 working days</li>
        <li>Do not purchase or scrape email lists</li>
        <li>Do not send unsolicited bulk email (spam)</li>
        <li>Comply with UK PECR, UK GDPR, and all applicable anti-spam legislation</li>
      </ul>

      <h2>Content Standards</h2>
      <ul>
        <li>All content must be lawful, truthful, and not misleading</li>
        <li>Content must not infringe any third party&apos;s intellectual property rights</li>
        <li>Content must not be defamatory, obscene, offensive, hateful, or discriminatory</li>
        <li>You must have the right to use any images or materials you upload</li>
      </ul>

      <h2>AI-Generated Content</h2>
      <p>You are responsible for all AI-generated output. Review and verify all content before publication. Check factual accuracy — AI may produce inaccurate statements. Do not rely on AI for legal, medical, or financial statements.</p>

      <h2>Partner Portal</h2>
      <ul>
        <li>Ensure partners understand and consent to how their content may be used</li>
        <li>Only create partner accounts for legitimate business partners or members</li>
        <li>Do not collect personal data beyond what is necessary</li>
      </ul>

      <h2>Account Security</h2>
      <ul>
        <li>Use strong, unique passwords</li>
        <li>Do not share login credentials — each user must have their own account</li>
        <li>Promptly revoke access for departed team members</li>
        <li>Report suspected unauthorised access immediately</li>
      </ul>

      <h2>Prohibited Activities</h2>
      <ul>
        <li>Attempting to gain unauthorised access to the Platform or other accounts</li>
        <li>Using automated scripts or bots to access the Platform</li>
        <li>Reverse engineering or decompiling the Platform</li>
        <li>Circumventing security measures or access controls</li>
        <li>Using the Platform to build or support a competing product</li>
      </ul>

      <h2>Enforcement</h2>
      <p>Violations may result in a warning, suspension of access, content removal, or termination of subscription. We will endeavour to give reasonable notice except where immediate action is necessary.</p>

      <h2>Contact</h2>
      <p>Report violations or concerns: <a href="mailto:david@press-pilot.com" className="text-blue-600">david@press-pilot.com</a></p>
    </article>
  );
}
