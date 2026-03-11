import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';

const GA_ID = 'G-CBWTR5MN8H';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
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
          spaceGrotesk.variable
        )}
      >
        <FirebaseClientProvider>{children}</FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
