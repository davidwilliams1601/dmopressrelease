import type { Metadata } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';

const GA_ID = 'G-CBWTR5MN8H';
const GTM_ID = 'GTM-PP2SMK5D';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Brand display face — Fraunces (serif). Replaces Space Grotesk per brand sheet v1.0.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'PressPilot',
  description: 'AI-powered PR platform for destination marketing teams. Collect partner stories, draft press releases, and distribute to journalists — all in one place.',
  openGraph: {
    type: 'website',
    siteName: 'PressPilot',
    title: 'PressPilot — AI-Powered PR for Destination Marketing',
    description: 'Collect partner stories, draft press releases with AI, and distribute to journalists — all in one place.',
    images: [{ url: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80', width: 1200, height: 800, alt: 'PressPilot' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PressPilot — AI-Powered PR for Destination Marketing',
    description: 'Collect partner stories, draft press releases with AI, and distribute to journalists — all in one place.',
    images: ['https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80'],
  },
};

// Disable static generation since app uses Firebase
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-body antialiased',
          inter.variable,
          fraunces.variable
        )}
      >
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <FirebaseClientProvider>{children}</FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
