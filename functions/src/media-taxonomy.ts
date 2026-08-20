import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Checks that the caller has the superAdmin custom claim.
 * Duplicated from super-admin.ts's requireSuperAdmin to avoid a cross-module
 * dependency between admin feature files — same pattern used elsewhere in this codebase
 * (see the isValidEmail duplication note in media-requests.ts).
 */
function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (!context.auth.token?.superAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
  }
}

export type MediaTaxonomyCategory = 'editorialFocus' | 'geography' | 'outletType' | 'topics';

const MEDIA_TAXONOMY_CATEGORIES: MediaTaxonomyCategory[] = [
  'editorialFocus',
  'geography',
  'outletType',
  'topics',
];

/**
 * Server-side default media taxonomy. Mirrors src/lib/media-taxonomy.ts
 * (DEFAULT_MEDIA_TAXONOMY) — kept in sync manually since functions/ is a separate
 * TypeScript project from the Next.js app.
 */
const DEFAULT_MEDIA_TAXONOMY: Record<MediaTaxonomyCategory, string[]> = {
  editorialFocus: [
    'Independent business & retail',
    'Town-centre & high-street regeneration',
    'Tourism & destinations',
    'Food & drink',
    'Events & culture',
    'Sustainability & environment',
    'Health & wellbeing',
    'Education & skills',
    'Sport & physical activity',
    'Community & charity',
  ],
  geography: ['Local', 'Regional', 'National (UK)', 'International'],
  outletType: [
    'Trade publication',
    'Local news',
    'National news',
    'Newsletter',
    'Podcast',
    'Broadcast',
    'Creator / influencer',
  ],
  topics: [
    'Business & investment',
    'Retail openings',
    'Tourism & travel',
    'Food & drink',
    'Arts & culture',
    'Sustainability',
    'Health & wellbeing',
    'Education',
    'Sport',
    'Community & charity',
  ],
};

/** Maps the OutletType controlled-taxonomy label to the enum value stored on
 *  MediaNetworkContact.outlet.type / Recipient.outletType. Server-side mirror of
 *  src/lib/media-taxonomy.ts's OUTLET_TYPE_VALUE_BY_LABEL — kept in sync manually,
 *  same convention as DEFAULT_MEDIA_TAXONOMY above. */
export const OUTLET_TYPE_VALUE_BY_LABEL: Record<string, string> = {
  'Trade publication': 'trade',
  'Local news': 'local-news',
  'National news': 'national-news',
  Newsletter: 'newsletter',
  Podcast: 'podcast',
  Broadcast: 'broadcast',
  'Creator / influencer': 'creator',
};

/**
 * Normalises a raw outlet-type string into the controlled kebab-case enum value.
 * QA fix (Medium): server-side defence in depth so a client bug (or a future direct
 * API caller) can't silently persist an un-normalised label — mirrors the client
 * helper of the same name in src/lib/media-taxonomy.ts.
 */
export function normaliseOutletTypeLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const exact = OUTLET_TYPE_VALUE_BY_LABEL[trimmed];
  if (exact) return exact;
  const caseInsensitive = Object.entries(OUTLET_TYPE_VALUE_BY_LABEL).find(
    ([label]) => label.toLowerCase() === trimmed.toLowerCase()
  );
  if (caseInsensitive) return caseInsensitive[1];
  if (Object.values(OUTLET_TYPE_VALUE_BY_LABEL).includes(trimmed)) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Get the current curated media-contact taxonomy (editorial focus, geography, outlet
 * type, topics). Super-admin only — this callable powers the admin console's editing
 * screen. Returns Firestore overrides merged with hardcoded defaults, same doc
 * (/platform/config) as getVerticalThemeTaxonomy, under a sibling `mediaTaxonomy` field
 * so the two features don't collide.
 */
export const getMediaTaxonomy = functions.https.onCall(async (_data, context) => {
  requireSuperAdmin(context);

  const doc = await db.collection('platform').doc('config').get();
  const stored = doc.exists ? (doc.data()?.mediaTaxonomy || {}) : {};

  const result: Record<MediaTaxonomyCategory, string[]> = { ...DEFAULT_MEDIA_TAXONOMY };
  for (const category of MEDIA_TAXONOMY_CATEGORIES) {
    if (Array.isArray(stored[category]) && stored[category].length > 0) {
      result[category] = stored[category];
    }
  }

  return { taxonomy: result };
});

/**
 * Update the curated list for a single media-taxonomy category. Super-admin only.
 * Writes to /platform/config, field mediaTaxonomy.{category}, mirroring
 * updateVerticalThemeTaxonomy exactly.
 *
 * Input: { category: MediaTaxonomyCategory, values: string[] }
 * An empty `values` array reverts that category to its hardcoded default.
 */
export const updateMediaTaxonomy = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { category, values } = data;

  if (!category || !MEDIA_TAXONOMY_CATEGORIES.includes(category)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `category must be one of: ${MEDIA_TAXONOMY_CATEGORIES.join(', ')}.`
    );
  }
  if (!Array.isArray(values)) {
    throw new functions.https.HttpsError('invalid-argument', 'values must be an array of strings (may be empty).');
  }
  const clean = Array.from(new Set(values.map((v: any) => String(v).trim()).filter(Boolean)));
  if (clean.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'values cannot contain more than 100 entries.');
  }

  await db.collection('platform').doc('config').set(
    { mediaTaxonomy: { [category]: clean } },
    { merge: true }
  );

  console.log(
    `[updateMediaTaxonomy] ${category} updated by ${context.auth!.uid}: ${clean.join(', ') || '(cleared — reverted to default)'}`
  );
  return { success: true, values: clean };
});
