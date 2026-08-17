import type { MetadataRoute } from 'next';

// Update this if the production domain changes.
const BASE_URL = 'https://app.press-pilot.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: `${BASE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/dmo`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/partner-signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/media`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
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
