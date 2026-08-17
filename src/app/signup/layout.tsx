import type { Metadata } from 'next';

// Signup is a functional flow linked to directly from press-pilot.com's
// "Start free trial" CTAs — it must stay live and crawlable enough to work
// when clicked, but shouldn't rank in search itself. press-pilot.com owns
// all marketing/SEO surface area for this subdomain.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
