import type { MetadataRoute } from 'next';

// app.press-pilot.com is the product surface for existing/signing-up
// customers only. All marketing/SEO content lives on press-pilot.com —
// this sitemap only lists pages that genuinely have no home there yet
// (the legal pages). / and /dmo used to be listed here but now redirect
// to press-pilot.com (see next.config.ts), and /signup / /partner-signup
// are functional flows marked noindex rather than sitemap-listed.
const BASE_URL = 'https://app.press-pilot.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: `${BASE_URL}/legal/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${BASE_URL}/legal/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${BASE_URL}/legal/acceptable-use`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];
}

// NOTE: /newsroom/[orgSlug], /media/[orgSlug] and /releases/[orgSlug]/[releaseSlug]
// are real public content (each DMO's published press releases) and are exactly
// the kind of page worth indexing once orgs have published content. They aren't
// included yet because they need to be generated dynamically from Firestore
// (fetch published orgs/releases at build/request time and map them into entries
// here). Worth adding as soon as there are a handful of live orgs with published
// releases — flag this back to Computer when that's ready.
