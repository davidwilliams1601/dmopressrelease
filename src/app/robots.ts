import type { MetadataRoute } from 'next';

// Update this if the production domain changes.
const BASE_URL = 'https://app.press-pilot.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /dmo and / now 301-redirect to press-pilot.com (next.config.ts) so
        // they don't need disallowing here. /signup and /partner-signup are
        // marked noindex via their own layout.tsx instead of disallowed, since
        // they still need to be crawlable/clickable as functional flows.
        disallow: [
          '/dashboard',
          '/admin',
          '/portal',
          '/api',
          '/debug',
          '/login',
          '/forgot-password',
        ],
      },
      // Explicitly allow AI crawlers/assistants (ChatGPT, Claude, Perplexity, Google's
      // AI features) to read the public marketing and newsroom pages — this is
      // increasingly how B2B buyers discover tools, not just classic search.
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
