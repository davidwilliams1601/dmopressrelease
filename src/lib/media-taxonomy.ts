/**
 * Shared client-side constants for Smart Distribution's media-contact taxonomy
 * and the CSV/XLSX import mapping wizard.
 *
 * Defaults mirror functions/src/media-taxonomy.ts (DEFAULT_MEDIA_TAXONOMY). The two
 * are kept as separate copies because functions/ is a standalone TypeScript project
 * that isn't bundled with the Next.js app — this matches the existing pattern for
 * VERTICAL_LABELS/VERTICAL_IDS in src/components/admin/theme-taxonomy-card.tsx.
 */

export type MediaTaxonomyCategory = 'editorialFocus' | 'geography' | 'outletType' | 'topics';

export const MEDIA_TAXONOMY_CATEGORY_LABELS: Record<MediaTaxonomyCategory, string> = {
  editorialFocus: 'Editorial focus',
  geography: 'Geography',
  outletType: 'Outlet type',
  topics: 'Topics',
};

export const DEFAULT_MEDIA_TAXONOMY: Record<MediaTaxonomyCategory, string[]> = {
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
  geography: [
    'Local',
    'Regional',
    'National (UK)',
    'International',
  ],
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

/** Maps the OutletType controlled-taxonomy label to the enum value stored on a Recipient. */
export const OUTLET_TYPE_VALUE_BY_LABEL: Record<string, string> = {
  'Trade publication': 'trade',
  'Local news': 'local-news',
  'National news': 'national-news',
  Newsletter: 'newsletter',
  Podcast: 'podcast',
  Broadcast: 'broadcast',
  'Creator / influencer': 'creator',
};

/** Reverse of OUTLET_TYPE_VALUE_BY_LABEL — used to display a human-readable outlet-type
 *  label given the stored kebab-case value (Recipient.outletType / MediaNetworkContact.outlet.type
 *  / RecommendationSnapshot.outletCategory all share this same value space). */
export const OUTLET_TYPE_LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  Object.entries(OUTLET_TYPE_VALUE_BY_LABEL).map(([label, value]) => [value, label])
);

/**
 * Normalises a raw outlet-type cell (as typed by a customer in a CSV, or picked from a
 * dropdown that still shows the human-readable label) into the controlled kebab-case
 * enum value that Recipient.outletType / MediaNetworkContact.outlet.type actually store.
 *
 * QA fix (Medium): both import wizards previously wrote the raw label straight through
 * (e.g. "Trade publication") even though this lookup table already existed, which
 * silently broke every downstream equality-based match against the enum value (outlet
 * type filters, OUTLET_TYPE_LABEL_BY_VALUE display, and Smart Distribution's own
 * matching logic in recommendations.ts). Falls back to a best-effort kebab-slug for a
 * genuinely free-text value that matches nothing in the known label list, rather than
 * either crashing the import or silently keeping unnormalised text with spaces/case
 * that will never match anything again.
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
  // Already looks like a normalised kebab value (e.g. re-importing our own export).
  if (Object.values(OUTLET_TYPE_VALUE_BY_LABEL).includes(trimmed)) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const RELATIONSHIP_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'known', label: 'Known contact' },
  { value: 'pitched', label: 'Pitched' },
  { value: 'responded', label: 'Responded' },
  { value: 'published', label: 'Published' },
  { value: 'declined', label: 'Declined' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'opted_out', label: 'Opted out' },
];

/**
 * The full set of fields the import wizard can map a spreadsheet column to.
 * `key` is what gets written on the Recipient document (or a special handling key).
 */
export type ImportTargetField = {
  key:
    | 'firstName'
    | 'lastName'
    | 'name'
    | 'email'
    | 'outlet'
    | 'position'
    | 'editorialFocus'
    | 'geography'
    | 'topics'
    | 'outletType'
    | 'relationshipStatus'
    | 'lastContactedAt'
    | 'doNotContact'
    | 'notes'
    | 'ignore';
  label: string;
  required?: boolean;
  isList?: boolean; // comma-separated values split into an array
};

/**
 * QA fix: the downloadable template (TEMPLATE_CSV below) has separate first_name/
 * last_name columns, but until this fix the only mappable "name" target combined
 * them into one field, and the alias table had no entry for "lastname" at all — so
 * importing the official template silently dropped every last name. firstName and
 * lastName are now first-class targets; the plain "name" target remains available
 * for spreadsheets that only have a single combined name column.
 */
export const IMPORT_TARGET_FIELDS: ImportTargetField[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'name', label: 'Full name (single column)' },
  { key: 'email', label: 'Email address', required: true },
  { key: 'outlet', label: 'Outlet / publication', required: true },
  { key: 'position', label: 'Position / role' },
  { key: 'editorialFocus', label: 'Editorial focus', isList: true },
  { key: 'geography', label: 'Geography', isList: true },
  { key: 'topics', label: 'Topics', isList: true },
  { key: 'outletType', label: 'Outlet type' },
  { key: 'relationshipStatus', label: 'Relationship status' },
  { key: 'lastContactedAt', label: 'Last contacted' },
  { key: 'doNotContact', label: 'Do not contact' },
  { key: 'notes', label: 'Internal notes' },
  { key: 'ignore', label: "Don't import this column" },
];

/**
 * Alias table used to auto-suggest a mapping for a spreadsheet's header row.
 * Keys are normalised (lowercase, no spaces/punctuation) source headers; values are
 * ImportTargetField keys. "beat" is deliberately an alias only — the product never
 * uses that word in the UI, see docs/smart-distribution/README.md decision #2.
 */
export const IMPORT_FIELD_ALIASES: Record<string, ImportTargetField['key']> = {
  name: 'name',
  fullname: 'name',
  contactname: 'name',
  journalist: 'name',
  firstname: 'firstName',
  givenname: 'firstName',
  forename: 'firstName',
  lastname: 'lastName',
  surname: 'lastName',
  familyname: 'lastName',
  email: 'email',
  emailaddress: 'email',
  outlet: 'outlet',
  publication: 'outlet',
  outletpublication: 'outlet',
  media: 'outlet',
  position: 'position',
  role: 'position',
  jobtitle: 'position',
  title: 'position',
  beat: 'editorialFocus',
  specialism: 'editorialFocus',
  sector: 'editorialFocus',
  coveragearea: 'editorialFocus',
  whattheycover: 'editorialFocus',
  editorialfocus: 'editorialFocus',
  region: 'geography',
  area: 'geography',
  location: 'geography',
  geography: 'geography',
  interests: 'topics',
  subjects: 'topics',
  keywords: 'topics',
  topics: 'topics',
  publicationtype: 'outletType',
  mediatype: 'outletType',
  outlettype: 'outletType',
  status: 'relationshipStatus',
  relationship: 'relationshipStatus',
  stage: 'relationshipStatus',
  relationshipstatus: 'relationshipStatus',
  lastemailed: 'lastContactedAt',
  lastcontacted: 'lastContactedAt',
  lastpitchdate: 'lastContactedAt',
  lastcontacteddate: 'lastContactedAt',
  optout: 'doNotContact',
  donotpitch: 'doNotContact',
  unsubscribe: 'doNotContact',
  donotcontact: 'doNotContact',
  notes: 'notes',
  comments: 'notes',
  internalnotes: 'notes',
};

/** Normalises a raw header string for alias lookup: lowercase, strip spaces/punctuation. */
export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Suggests a target field for a raw spreadsheet header, or 'ignore' if nothing matches. */
export function suggestFieldForHeader(header: string): ImportTargetField['key'] {
  return IMPORT_FIELD_ALIASES[normaliseHeader(header)] || 'ignore';
}

const TRUE_STRINGS = new Set(['true', 'yes', 'y', '1']);

/** Parses a loosely-formatted boolean cell value (e.g. from "Do not contact" columns). */
export function parseBooleanCell(value: string): boolean {
  return TRUE_STRINGS.has(value.trim().toLowerCase());
}

/** Splits a comma/semicolon-separated cell into a clean array of values. */
export function splitListCell(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

// ============================================================================
// Smart Distribution — Phase 2: superadmin media network import wizard.
// Same wizard mechanics as the customer import (above), but mapping onto
// MediaNetworkContact's richer shape instead of Recipient. Kept as a separate
// target-field/alias set because the two contact shapes genuinely differ
// (identity/outlet/coverage vs. a flat Recipient) — see
// docs/smart-distribution/import-wizard-and-credits.md §2.
// ============================================================================

export type NetworkImportTargetField = {
  key:
    | 'name'
    | 'email'
    | 'role'
    | 'profileUrl'
    | 'outletName'
    | 'outletType'
    | 'location'
    | 'audienceScope'
    | 'editorialFocus'
    | 'geographies'
    | 'topics'
    | 'recentCoverageTitle'
    | 'recentCoverageUrl'
    | 'recentCoverageDate'
    | 'ignore';
  label: string;
  required?: boolean;
  isList?: boolean;
};

export const NETWORK_IMPORT_TARGET_FIELDS: NetworkImportTargetField[] = [
  { key: 'name', label: 'Contact name', required: true },
  { key: 'email', label: 'Email address', required: true },
  { key: 'role', label: 'Role / title' },
  { key: 'profileUrl', label: 'Profile URL' },
  { key: 'outletName', label: 'Outlet / publication', required: true },
  { key: 'outletType', label: 'Outlet type' },
  { key: 'location', label: 'Outlet location' },
  { key: 'audienceScope', label: 'Audience scope (local/regional/national/international)' },
  { key: 'editorialFocus', label: 'Editorial focus', isList: true },
  { key: 'geographies', label: 'Geography', isList: true },
  { key: 'topics', label: 'Topics', isList: true },
  { key: 'recentCoverageTitle', label: 'Recent coverage — title' },
  { key: 'recentCoverageUrl', label: 'Recent coverage — URL' },
  { key: 'recentCoverageDate', label: 'Recent coverage — published date' },
  { key: 'ignore', label: "Don't import this column" },
];

export const NETWORK_IMPORT_FIELD_ALIASES: Record<string, NetworkImportTargetField['key']> = {
  name: 'name',
  fullname: 'name',
  contactname: 'name',
  journalist: 'name',
  email: 'email',
  emailaddress: 'email',
  role: 'role',
  jobtitle: 'role',
  title: 'role',
  position: 'role',
  profileurl: 'profileUrl',
  linkedin: 'profileUrl',
  profile: 'profileUrl',
  outlet: 'outletName',
  publication: 'outletName',
  media: 'outletName',
  outletname: 'outletName',
  outlettype: 'outletType',
  publicationtype: 'outletType',
  mediatype: 'outletType',
  location: 'location',
  outletlocation: 'location',
  region: 'geographies',
  audiencescope: 'audienceScope',
  reach: 'audienceScope',
  beat: 'editorialFocus',
  specialism: 'editorialFocus',
  sector: 'editorialFocus',
  coveragearea: 'editorialFocus',
  editorialfocus: 'editorialFocus',
  geography: 'geographies',
  geographies: 'geographies',
  area: 'geographies',
  interests: 'topics',
  subjects: 'topics',
  keywords: 'topics',
  topics: 'topics',
  recentcoveragetitle: 'recentCoverageTitle',
  coveragetitle: 'recentCoverageTitle',
  articletitle: 'recentCoverageTitle',
  recentcoverageurl: 'recentCoverageUrl',
  coverageurl: 'recentCoverageUrl',
  articleurl: 'recentCoverageUrl',
  url: 'recentCoverageUrl',
  recentcoveragedate: 'recentCoverageDate',
  coveragedate: 'recentCoverageDate',
  publishedat: 'recentCoverageDate',
  publisheddate: 'recentCoverageDate',
};

/** Suggests a NetworkImportTargetField for a raw spreadsheet header, or 'ignore'. */
export function suggestNetworkFieldForHeader(header: string): NetworkImportTargetField['key'] {
  return NETWORK_IMPORT_FIELD_ALIASES[normaliseHeader(header)] || 'ignore';
}

export const AUDIENCE_SCOPE_VALUES = ['local', 'regional', 'national', 'international'] as const;

/** Normalises a loosely-typed audience-scope cell to a valid enum value, or undefined. */
export function parseAudienceScope(value: string): (typeof AUDIENCE_SCOPE_VALUES)[number] | undefined {
  const v = value.trim().toLowerCase();
  return (AUDIENCE_SCOPE_VALUES as readonly string[]).includes(v)
    ? (v as (typeof AUDIENCE_SCOPE_VALUES)[number])
    : undefined;
}

export const NETWORK_SOURCE_TYPE_OPTIONS: { value: MediaNetworkSourceType; label: string }[] = [
  { value: 'press_pilot_research', label: 'Press Pilot research' },
  { value: 'licensed', label: 'Licensed provider' },
  { value: 'partner_provided', label: 'Partner-contributed' },
  { value: 'public_research', label: 'Publicly sourced' },
  { value: 'other', label: 'Other' },
];

export type MediaNetworkSourceType =
  | 'press_pilot_research'
  | 'licensed'
  | 'partner_provided'
  | 'public_research'
  | 'other';
