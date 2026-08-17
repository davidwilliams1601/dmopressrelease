import type { Metadata } from 'next';

// Same rationale as src/app/signup/layout.tsx — functional flow, not a
// marketing landing page. Keep crawlable/clickable, keep out of search results.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function PartnerSignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
