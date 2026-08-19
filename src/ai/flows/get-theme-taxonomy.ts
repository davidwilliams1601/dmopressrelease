'use server';

import { getAdminFirestore } from '@/lib/firebase-admin';

/**
 * Mirror of functions/src/super-admin.ts's DEFAULT_THEME_TAXONOMY. Cloud Functions and
 * the Next.js app are separate TypeScript build roots that cannot import from each other
 * (same reason tiers.ts is mirrored on both sides) — keep this list in sync with the
 * functions-side copy if the taxonomy defaults ever change.
 */
const DEFAULT_THEME_TAXONOMY: Record<string, string[]> = {
  dmo: [],
  charity: [],
  'trade-body': [],
  education: [
    'Reading & Literacy Engagement',
    'Academic Achievement & Awards',
    'Careers, Skills & Future Readiness',
    'Wellbeing & Mental Health',
    'Inclusion, SEN & Accessibility',
    'Community & Local Partnership',
    'Arts, Culture & Creativity',
    'Sport & Physical Activity',
    'Fundraising & Charity',
    'Digital & EdTech Innovation',
    'Environmental & Sustainability',
    'Other',
  ],
};

/**
 * Resolve the effective curated theme taxonomy for a vertical, reading the same
 * `/platform/config` doc the `updateVerticalThemeTaxonomy` Cloud Function callable
 * writes to. Used by the submission detail page before calling the "Re-analyze" flow,
 * so a manual re-analysis respects the same taxonomy constraint as automatic analysis.
 *
 * Returns an empty array for verticals with no configured taxonomy — callers should
 * treat that as "unconstrained, keep free-text themes".
 */
export async function getThemeTaxonomyForVertical(vertical: string | undefined | null): Promise<string[]> {
  if (!vertical || !(vertical in DEFAULT_THEME_TAXONOMY)) return [];

  try {
    const doc = await getAdminFirestore().collection('platform').doc('config').get();
    const stored = doc.exists ? doc.data()?.verticals?.[vertical]?.themeTaxonomy : undefined;
    if (Array.isArray(stored)) return stored;
  } catch (err) {
    console.error('[getThemeTaxonomyForVertical] Firestore read failed:', err);
  }

  return DEFAULT_THEME_TAXONOMY[vertical] ?? [];
}
