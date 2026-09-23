/**
 * Coverage records: the pure logic behind Press Pilot's "Proof of Value" layer.
 *
 * TWO COPIES: functions/src/coverage-core.ts and src/lib/coverage-core.ts. functions/ is a
 * standalone TS project, so the app cannot import from it; the two files must stay
 * byte-identical and functions/src/__tests__/coverage-core.test.ts fails if they drift.
 * No imports, no Firebase, no DOM — so the same numbers come out of the dashboard, the public
 * shared report and the tests.
 *
 * Why this exists: until now every number Press Pilot reported was send-side — emails sent,
 * opens, clicks, page views. Those prove activity, not outcome. A board, a funder or a member
 * deciding whether to renew is asking a different question: "where did our stories actually
 * appear, and who did it help?" A coverage record is the answer to that, one placement at a
 * time, tied back to the release it came from and the members whose stories were in it.
 *
 * Measurement discipline, deliberately:
 *
 *   - No estimated views, no advertising-value equivalents, no invented audience maths. A
 *     `reportedAudience` figure is only ever what a source itself published, carried with the
 *     name of that source, and summed only across records that have one — and the summary says
 *     how many that was, so "1.2M reported audience (3 of 14 placements)" can never be read as
 *     "1.2M people saw our coverage".
 *   - Tone is recorded by a person, not inferred. A coverage record that is neutral or
 *     sensitive is still a record; it is just not counted as a win.
 *   - "From a Press Pilot send" is a claim someone makes when logging the placement. It is
 *     reported as such, never upgraded into proof of causation.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const COVERAGE_MEDIA_TYPES = [
  'online',
  'print',
  'broadcast',
  'podcast',
  'newsletter',
  'social',
  'other',
] as const;
export type CoverageMediaType = (typeof COVERAGE_MEDIA_TYPES)[number];

export const COVERAGE_MEDIA_TYPE_LABELS: Record<CoverageMediaType, string> = {
  online: 'Online',
  print: 'Print',
  broadcast: 'TV / radio',
  podcast: 'Podcast',
  newsletter: 'Newsletter',
  social: 'Social / creator',
  other: 'Other',
};

/** Mirrors the reach tiers membership bodies already talk in, not a media-industry taxonomy. */
export const COVERAGE_OUTLET_TYPES = [
  'local',
  'regional',
  'national',
  'trade',
  'international',
  'other',
] as const;
export type CoverageOutletType = (typeof COVERAGE_OUTLET_TYPES)[number];

export const COVERAGE_OUTLET_TYPE_LABELS: Record<CoverageOutletType, string> = {
  local: 'Local',
  regional: 'Regional',
  national: 'National',
  trade: 'Trade / sector',
  international: 'International',
  other: 'Other',
};

/**
 * Tone, as judged by the person logging it. Three values, not five, because the only decision
 * this drives is "is this a win, a neutral mention, or something to keep an eye on".
 */
export const COVERAGE_TONES = ['positive', 'neutral', 'sensitive'] as const;
export type CoverageTone = (typeof COVERAGE_TONES)[number];

export const COVERAGE_TONE_LABELS: Record<CoverageTone, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  sensitive: 'Sensitive',
};

/** The subset of a stored coverage record the summary and export read. */
export type CoverageRecordLike = {
  id?: string;
  url?: string | null;
  headline: string;
  outletName: string;
  publishedAtMs: number;
  mediaType: CoverageMediaType;
  outletType: CoverageOutletType;
  tone: CoverageTone;
  releaseId?: string | null;
  releaseHeadline?: string | null;
  partnerIds?: string[];
  partnerNames?: string[];
  themes?: string[];
  fromPressPilotSend?: boolean;
  reportedAudience?: number | null;
  reportedAudienceSource?: string | null;
  notes?: string | null;
};

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/** Query parameters that identify a click, not a page. Stripped so one article is one record. */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'dclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
  'cmpid',
  'ito',
]);

/**
 * A stable form of a coverage URL, used to spot the same article being logged twice.
 * Returns null for anything that is not an absolute http(s) URL.
 */
export function canonicalCoverageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const kept: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    if (!TRACKING_PARAMS.has(key.toLowerCase())) kept.push([key, value]);
  });
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [k, v] of kept) url.searchParams.append(k, v);
  // A trailing slash on a path is presentation, not identity; keep the root slash.
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  // http and https versions of one article are one article.
  return 'https://' + url.toString().replace(/^https?:\/\//, '');
}

/**
 * Whether the server may fetch this URL to read its title and date.
 *
 * This is a first, string-level gate against the metadata fetcher being turned into a probe of
 * our own network. The callable additionally resolves the hostname and rejects private
 * addresses before fetching; this check exists so the obvious cases never reach DNS at all.
 */
export function isPublicHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '80' && url.port !== '443') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || !host.includes('.')) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (isPrivateAddress(host)) return false;
  return true;
}

/** True for loopback, link-local, private-range and metadata addresses (IPv4 and IPv6 literals). */
export function isPrivateAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }
  if (h.includes(':')) {
    if (h === '::' || h === '::1') return true;
    if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
    const mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Metadata extraction (for "paste a link, we fill in the rest")
// ---------------------------------------------------------------------------

export type CoverageMetadata = {
  headline: string | null;
  outletName: string | null;
  publishedAtMs: number | null;
  imageUrl: string | null;
  canonicalUrl: string | null;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // attribute order varies between publishers, so try both orders
    const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i');
    const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${escaped}["']`, 'i');
    const m = html.match(a) || html.match(b);
    if (m && m[1] && m[1].trim()) return decodeEntities(m[1]);
  }
  return null;
}

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** First datePublished found in any JSON-LD block, tolerating @graph and arrays. */
function jsonLdDatePublished(html: string): string | null {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const parsed = JSON.parse(body);
      const queue: any[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== 'object') continue;
        if (typeof node.datePublished === 'string') return node.datePublished;
        if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
      }
    } catch {
      // Malformed JSON-LD is common; fall through to the next block.
    }
  }
  return null;
}

/**
 * Reads headline, outlet, date and image from an article's HTML.
 *
 * Only ever used to PRE-FILL the add-coverage form. Every field stays editable and nothing is
 * saved until a person confirms it, because publisher metadata is frequently wrong — site
 * names that are a parent brand, og:titles with the outlet appended, dates that are the last
 * update rather than first publication.
 */
export function extractCoverageMetadata(html: string, pageUrl: string): CoverageMetadata {
  const head = html.slice(0, 400_000);

  let headline = metaContent(head, ['og:title', 'twitter:title']);
  if (!headline) {
    const t = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    headline = t ? decodeEntities(t[1]) : null;
  }

  let outletName = metaContent(head, ['og:site_name', 'application-name']);
  if (!outletName) {
    try {
      outletName = new URL(pageUrl).hostname.replace(/^www\./, '');
    } catch {
      outletName = null;
    }
  }

  // Strip a trailing " | Outlet" or " - Outlet" the publisher appended to the title.
  if (headline && outletName) {
    const suffix = new RegExp(`\\s*[|\\-–—:]\\s*${outletName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    headline = headline.replace(suffix, '').trim() || headline;
  }

  const publishedAtMs =
    parseDate(metaContent(head, ['article:published_time', 'og:article:published_time', 'datePublished', 'pubdate', 'publish-date', 'date'])) ??
    parseDate(jsonLdDatePublished(head));

  const image = metaContent(head, ['og:image', 'twitter:image']);
  let imageUrl: string | null = null;
  if (image) {
    try {
      imageUrl = new URL(image, pageUrl).toString();
    } catch {
      imageUrl = null;
    }
  }

  const canonicalTag = head.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  const canonicalUrl = canonicalCoverageUrl(canonicalTag ? canonicalTag[1] : pageUrl);

  return {
    headline: headline ? headline.slice(0, 300) : null,
    outletName: outletName ? outletName.slice(0, 120) : null,
    publishedAtMs,
    imageUrl,
    canonicalUrl,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type CoverageInput = {
  url?: string | null;
  headline?: string | null;
  outletName?: string | null;
  publishedAtMs?: number | null;
  mediaType?: string | null;
  outletType?: string | null;
  tone?: string | null;
  themes?: string[] | null;
  reportedAudience?: number | null;
  reportedAudienceSource?: string | null;
  notes?: string | null;
};

export type CoverageValidation = { ok: true; errors: [] } | { ok: false; errors: string[] };

/**
 * The rules a coverage record must meet before it counts. Shared by the form and mirrored in
 * firestore.rules, so the dashboard cannot save something the rules would reject.
 *
 * A URL is optional because print and broadcast coverage often has none — a scanned clipping or
 * a radio segment is still coverage — but when there is one it must be a real http(s) link.
 */
export function validateCoverageInput(input: CoverageInput, nowMs: number): CoverageValidation {
  const errors: string[] = [];
  const headline = (input.headline || '').trim();
  const outlet = (input.outletName || '').trim();

  if (!headline) errors.push('Add the headline or a short description of the piece.');
  if (headline.length > 300) errors.push('Keep the headline under 300 characters.');
  if (!outlet) errors.push('Add the outlet or publication name.');
  if (outlet.length > 120) errors.push('Keep the outlet name under 120 characters.');

  if (input.url && input.url.trim() && !canonicalCoverageUrl(input.url)) {
    errors.push('The link must start with http:// or https://.');
  }

  const published = input.publishedAtMs;
  if (typeof published !== 'number' || !Number.isFinite(published)) {
    errors.push('Add the date it was published.');
  } else if (published > nowMs + 2 * 24 * 60 * 60 * 1000) {
    // Two days of grace for timezones and embargoed pieces logged the night before.
    errors.push('The published date is in the future.');
  } else if (published < Date.UTC(2000, 0, 1)) {
    errors.push('The published date looks wrong.');
  }

  if (!COVERAGE_MEDIA_TYPES.includes(input.mediaType as CoverageMediaType)) errors.push('Choose a media type.');
  if (!COVERAGE_OUTLET_TYPES.includes(input.outletType as CoverageOutletType)) errors.push('Choose an outlet type.');
  if (!COVERAGE_TONES.includes(input.tone as CoverageTone)) errors.push('Choose a tone.');

  if (input.reportedAudience !== null && input.reportedAudience !== undefined) {
    if (typeof input.reportedAudience !== 'number' || !Number.isFinite(input.reportedAudience) || input.reportedAudience < 0) {
      errors.push('Reported audience must be a positive number.');
    } else if (!(input.reportedAudienceSource || '').trim()) {
      errors.push('Say where the reported audience figure comes from.');
    }
  }

  if (input.themes && input.themes.length > 10) errors.push('Use at most 10 themes.');
  if (input.notes && input.notes.length > 2000) errors.push('Keep notes under 2,000 characters.');

  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

/** Normalises a comma- or newline-separated theme list: trimmed, de-duplicated, capped. */
export function normaliseThemes(raw: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : (raw || '').split(/[,\n]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = String(p).trim().replace(/\s+/g, ' ').slice(0, 60);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type CountRow = { key: string; label: string; count: number };

export type CoverageSummary = {
  placements: number;
  distinctOutlets: number;
  membersFeatured: number;
  releasesWithCoverage: number;
  fromPressPilotSends: number;
  positive: number;
  neutral: number;
  sensitive: number;
  byMediaType: CountRow[];
  byOutletType: CountRow[];
  byTheme: CountRow[];
  byMember: CountRow[];
  topOutlets: CountRow[];
  /** Sum of source-reported audience, across only the records that carry one. */
  reportedAudienceTotal: number;
  reportedAudienceRecordCount: number;
};

function countBy<T>(items: T[], keyOf: (t: T) => string[], labelOf: (k: string) => string): CountRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const key of keyOf(item)) {
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, label: labelOf(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Records whose published date falls inside [startMs, endMs], inclusive. */
export function inPeriod<T extends { publishedAtMs: number }>(records: T[], startMs: number, endMs: number): T[] {
  return records.filter((r) => r.publishedAtMs >= startMs && r.publishedAtMs <= endMs);
}

export function summariseCoverage(records: CoverageRecordLike[]): CoverageSummary {
  const outletKey = (r: CoverageRecordLike) => r.outletName.trim().toLowerCase();
  const outletDisplay = new Map<string, string>();
  for (const r of records) if (!outletDisplay.has(outletKey(r))) outletDisplay.set(outletKey(r), r.outletName.trim());

  const memberDisplay = new Map<string, string>();
  for (const r of records) {
    (r.partnerIds || []).forEach((id, i) => {
      if (!memberDisplay.has(id)) memberDisplay.set(id, (r.partnerNames || [])[i] || 'Member');
    });
  }

  const themeDisplay = new Map<string, string>();
  for (const r of records) for (const t of r.themes || []) if (!themeDisplay.has(t.toLowerCase())) themeDisplay.set(t.toLowerCase(), t);

  const withAudience = records.filter((r) => typeof r.reportedAudience === 'number' && r.reportedAudience! > 0);

  return {
    placements: records.length,
    distinctOutlets: outletDisplay.size,
    membersFeatured: memberDisplay.size,
    releasesWithCoverage: new Set(records.map((r) => r.releaseId).filter(Boolean)).size,
    fromPressPilotSends: records.filter((r) => r.fromPressPilotSend === true).length,
    positive: records.filter((r) => r.tone === 'positive').length,
    neutral: records.filter((r) => r.tone === 'neutral').length,
    sensitive: records.filter((r) => r.tone === 'sensitive').length,
    byMediaType: countBy(records, (r) => [r.mediaType], (k) => COVERAGE_MEDIA_TYPE_LABELS[k as CoverageMediaType] || k),
    byOutletType: countBy(records, (r) => [r.outletType], (k) => COVERAGE_OUTLET_TYPE_LABELS[k as CoverageOutletType] || k),
    byTheme: countBy(records, (r) => (r.themes || []).map((t) => t.toLowerCase()), (k) => themeDisplay.get(k) || k),
    byMember: countBy(records, (r) => r.partnerIds || [], (k) => memberDisplay.get(k) || 'Member'),
    topOutlets: countBy(records, (r) => [outletKey(r)], (k) => outletDisplay.get(k) || k).slice(0, 10),
    reportedAudienceTotal: withAudience.reduce((s, r) => s + (r.reportedAudience || 0), 0),
    reportedAudienceRecordCount: withAudience.length,
  };
}

/**
 * The story funnel for a period: how many member stories came in, how many became releases that
 * went out, how many of those earned at least one placement. This is the line that goes at the
 * top of a board report — "18 submitted · 9 issued · 6 placed · 14 placements" — because it
 * shows the whole chain rather than just the end of it.
 */
export type StoryFunnel = {
  submitted: number;
  issued: number;
  releasesPlaced: number;
  placements: number;
  placementRate: number | null;
};

export function buildStoryFunnel(input: {
  submitted: number;
  issued: number;
  releasesPlaced: number;
  placements: number;
}): StoryFunnel {
  return {
    ...input,
    placementRate: input.issued > 0 ? Math.round((input.releasesPlaced / input.issued) * 1000) / 10 : null,
  };
}

export function formatFunnelLine(f: StoryFunnel, labels: { submitted: string; issued: string }): string {
  return [
    `${f.submitted} ${labels.submitted.toLowerCase()}`,
    `${f.issued} ${labels.issued.toLowerCase()}`,
    `${f.releasesPlaced} placed`,
    `${f.placements} ${f.placements === 1 ? 'placement' : 'placements'}`,
  ].join(' · ');
}

/**
 * The honest wording for a reported-audience total, or null when there is nothing to report.
 * Always carries the coverage ratio so the figure cannot be mistaken for measured reach.
 */
export function describeReportedAudience(s: CoverageSummary): string | null {
  if (s.reportedAudienceRecordCount === 0) return null;
  return `${formatCompactNumber(s.reportedAudienceTotal)} audience reported by the outlets themselves (${s.reportedAudienceRecordCount} of ${s.placements} placements carry a figure)`;
}

export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(Math.round(n / 100_000) / 10).toString()}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(Math.round(n / 100) / 10).toString()}K`;
  return String(Math.round(n));
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection: a cell that starts with = + - @ is executed by Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const COVERAGE_CSV_HEADERS = [
  'Published',
  'Outlet',
  'Headline',
  'URL',
  'Media type',
  'Outlet type',
  'Tone',
  'Release',
  'Members featured',
  'Themes',
  'From a Press Pilot send',
  'Reported audience',
  'Reported audience source',
  'Notes',
];

function isoDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function coverageToCsv(records: CoverageRecordLike[]): string {
  const rows = [...records]
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
    .map((r) =>
      [
        isoDate(r.publishedAtMs),
        r.outletName,
        r.headline,
        r.url || '',
        COVERAGE_MEDIA_TYPE_LABELS[r.mediaType] || r.mediaType,
        COVERAGE_OUTLET_TYPE_LABELS[r.outletType] || r.outletType,
        COVERAGE_TONE_LABELS[r.tone] || r.tone,
        r.releaseHeadline || '',
        (r.partnerNames || []).join('; '),
        (r.themes || []).join('; '),
        r.fromPressPilotSend ? 'Yes' : 'No',
        typeof r.reportedAudience === 'number' ? r.reportedAudience : '',
        r.reportedAudienceSource || '',
        r.notes || '',
      ]
        .map(csvCell)
        .join(',')
    );
  return [COVERAGE_CSV_HEADERS.map(csvCell).join(','), ...rows].join('\r\n');
}

// ---------------------------------------------------------------------------
// Shared (public) report payload
// ---------------------------------------------------------------------------

export type SharedCoverageRecord = {
  id: string;
  url: string | null;
  headline: string;
  outletName: string;
  publishedAtMs: number;
  mediaType: CoverageMediaType;
  outletType: CoverageOutletType;
  tone: CoverageTone;
  releaseId: string | null;
  releaseHeadline: string | null;
  partnerIds: string[];
  partnerNames: string[];
  themes: string[];
  fromPressPilotSend: boolean;
  reportedAudience: number | null;
  reportedAudienceSource: string | null;
};

/**
 * The coverage a share-link holder may see, built by allow-list.
 *
 * Internal notes never leave, and neither does who logged a record. Member names DO go out,
 * because "who we featured" is the whole point of a report a membership body sends to its
 * board or members — but only the display name already attached to the placement.
 *
 * Sensitive-tone placements are excluded unless the link was created with includeSensitive,
 * because a report sent to members should not quietly carry a planning dispute on page two.
 */
export function buildSharedCoverageRecords(
  records: Array<Record<string, any>>,
  opts: { includeSensitive: boolean }
): SharedCoverageRecord[] {
  return records
    .filter((r) => opts.includeSensitive || r.tone !== 'sensitive')
    .map((r) => ({
      id: String(r.id || ''),
      url: typeof r.url === 'string' && r.url ? r.url : null,
      headline: String(r.headline || ''),
      outletName: String(r.outletName || ''),
      publishedAtMs: Number(r.publishedAtMs) || 0,
      mediaType: (COVERAGE_MEDIA_TYPES.includes(r.mediaType) ? r.mediaType : 'other') as CoverageMediaType,
      outletType: (COVERAGE_OUTLET_TYPES.includes(r.outletType) ? r.outletType : 'other') as CoverageOutletType,
      tone: (COVERAGE_TONES.includes(r.tone) ? r.tone : 'neutral') as CoverageTone,
      releaseId: typeof r.releaseId === 'string' ? r.releaseId : null,
      releaseHeadline: typeof r.releaseHeadline === 'string' ? r.releaseHeadline : null,
      partnerIds: Array.isArray(r.partnerIds) ? r.partnerIds.map(String) : [],
      partnerNames: Array.isArray(r.partnerNames) ? r.partnerNames.map(String) : [],
      themes: Array.isArray(r.themes) ? r.themes.map(String) : [],
      fromPressPilotSend: r.fromPressPilotSend === true,
      reportedAudience: typeof r.reportedAudience === 'number' ? r.reportedAudience : null,
      reportedAudienceSource: typeof r.reportedAudienceSource === 'string' ? r.reportedAudienceSource : null,
    }))
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs);
}

/** Share-link period bounds: sane, ordered, and no longer than two years. */
export function validateReportPeriod(startMs: unknown, endMs: unknown): { ok: true; startMs: number; endMs: number } | { ok: false; error: string } {
  if (typeof startMs !== 'number' || typeof endMs !== 'number' || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, error: 'A report period needs a start and an end date.' };
  }
  if (endMs < startMs) return { ok: false, error: 'The report period ends before it starts.' };
  if (endMs - startMs > 731 * 24 * 60 * 60 * 1000) return { ok: false, error: 'A shared report can cover at most two years.' };
  return { ok: true, startMs, endMs };
}
