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

export const IMPORT_TARGET_FIELDS: ImportTargetField[] = [
  { key: 'name', label: 'Contact name', required: true },
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
  firstname: 'name',
  journalist: 'name',
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
