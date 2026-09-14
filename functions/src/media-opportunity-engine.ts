/**
 * Pure logic for the Media Opportunities layer: feed parsing, URL canonicalisation,
 * deterministic tagging, momentum assessment and action selection.
 *
 * Deliberately free of firebase-admin and firebase-functions imports so it can be
 * unit-tested with `npm test` in functions/ with no emulator and no network — the same
 * reason email-template.ts is kept separate from index.ts. Everything here is a pure
 * function of its inputs; media-opportunities.ts owns all Firestore reads and writes.
 *
 * WorkingItem/Theme types used by the momentum test live here too, so the thresholds and
 * the shapes they operate on stay in one readable file.
 */

import * as crypto from 'crypto';
import * as he from 'he';
import {
  DEVELOPING_WINDOW_DAYS,
  EMERGING_WINDOW_HOURS,
  GEOGRAPHY_TERMS,
  MIN_ITEMS_DEVELOPING,
  MIN_SOURCES_DEVELOPING,
  MIN_SOURCES_EMERGING,
  SENSITIVE_TERMS,
  TOPIC_TERMS,
} from './media-opportunity-config';

const DAY_MS = 24 * 60 * 60 * 1000;
const SUMMARY_MAX_CHARS = 400;

/** One normalised item as the generator works with it in memory. */
export type WorkingItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary?: string;
  /** Epoch millis, so momentum maths never has to care about Timestamp vs Date. */
  publishedAtMs: number;
  topicTags: string[];
  geographyTags: string[];
  verticals: string[];
};

// ---------------------------------------------------------------------------
// Feed parsing
// ---------------------------------------------------------------------------

/**
 * Minimal RSS/Atom reader.
 *
 * Written by hand rather than pulling in an XML dependency: functions/ has a
 * deliberately small dependency list, this only needs six fields, and a feed reader is
 * exactly the kind of code that should be readable when a publisher changes their
 * output and ingestion goes quiet. It tolerates CDATA, HTML entities, self-closing
 * Atom links and both date conventions, and it never evaluates anything from the feed.
 */
export function parseFeed(xml: string): Array<{
  title: string;
  url: string;
  summary?: string;
  author?: string;
  publishedAt: Date | null;
}> {
  const entries: Array<{ title: string; url: string; summary?: string; author?: string; publishedAt: Date | null }> = [];

  // <item> is RSS, <entry> is Atom. Match either, non-greedily, case-insensitively.
  const blockRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let block: RegExpExecArray | null;

  while ((block = blockRegex.exec(xml)) !== null) {
    const body = block[2];

    const title = cleanText(firstTag(body, 'title'));
    if (!title) continue;

    // RSS puts the URL in <link>text</link>; Atom uses <link href="..."/>, sometimes
    // several with different rel values — prefer rel="alternate" or no rel at all.
    let url = cleanText(firstTag(body, 'link'));
    if (!url) {
      const hrefMatches = [...body.matchAll(/<link\b([^>]*)\/?>/gi)];
      for (const m of hrefMatches) {
        const attrs = m[1];
        const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
        if (rel && rel !== 'alternate') continue;
        const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
        if (href) {
          url = cleanText(href);
          break;
        }
      }
    }
    if (!url || !/^https?:\/\//i.test(url)) continue;

    const rawSummary =
      firstTag(body, 'description') || firstTag(body, 'summary') || firstTag(body, 'content');
    const summary = rawSummary ? stripHtml(cleanText(rawSummary)).slice(0, SUMMARY_MAX_CHARS) : undefined;

    const author =
      cleanText(firstTag(body, 'dc:creator')) ||
      cleanText(firstTag(firstTag(body, 'author') || '', 'name')) ||
      cleanText(firstTag(body, 'author')) ||
      undefined;

    const dateRaw =
      firstTag(body, 'pubDate') ||
      firstTag(body, 'published') ||
      firstTag(body, 'updated') ||
      firstTag(body, 'dc:date');
    const parsed = dateRaw ? new Date(cleanText(dateRaw)) : null;
    const publishedAt = parsed && !isNaN(parsed.getTime()) ? parsed : null;

    entries.push({ title, url, summary, author: author || undefined, publishedAt });
  }

  return entries;
}

function firstTag(xml: string, tag: string): string {
  const escaped = tag.replace(/[:]/g, '\\:');
  const m = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i').exec(xml);
  return m ? m[1] : '';
}

function cleanText(value: string): string {
  if (!value) return '';
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return he.decode(withoutCdata).replace(/\s+/g, ' ').trim();
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Canonical form used for the document ID: scheme+host+path, lowercased host, no
 * trailing slash, and every tracking parameter dropped. Two feeds listing the same
 * article with different utm tags must produce one item, not two — otherwise the
 * distinct-source count that momentum depends on can be inflated by a syndication deal.
 */
export function canonicaliseUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.host = u.host.toLowerCase();
    const keep = new URLSearchParams();
    u.searchParams.forEach((value, key) => {
      const k = key.toLowerCase();
      if (k.startsWith('utm_') || k === 'fbclid' || k === 'gclid' || k === 'ref' || k === 'source') return;
      keep.append(key, value);
    });
    u.search = keep.toString();
    let out = u.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch {
    return rawUrl.trim();
  }
}

export function mediaItemDocId(url: string): string {
  return crypto.createHash('sha256').update(canonicaliseUrl(url)).digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------------
// Deterministic tagging
// ---------------------------------------------------------------------------

/** Word-boundary, case-insensitive phrase match. No stemming: a false positive in a
 *  comms tool is more expensive than a miss, because it is the thing the customer sees. */
export function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
}

export function tagItem(input: {
  title: string;
  summary?: string;
  sourceGeographies?: string[];
  sourceDefaultTopics?: string[];
}): {
  topicTags: string[];
  geographyTags: string[];
  matchTrail: Array<{ tag: string; matchedTerm: string; field: 'title' | 'summary' | 'source' }>;
  sensitive: boolean;
  sensitiveReason?: string;
} {
  const title = input.title || '';
  const summary = input.summary || '';
  const trail: Array<{ tag: string; matchedTerm: string; field: 'title' | 'summary' | 'source' }> = [];
  const topics = new Set<string>();
  const geographies = new Set<string>();

  for (const topic of input.sourceDefaultTopics || []) {
    topics.add(topic);
    trail.push({ tag: topic, matchedTerm: 'source default', field: 'source' });
  }
  for (const geo of input.sourceGeographies || []) {
    geographies.add(geo);
    trail.push({ tag: geo, matchedTerm: 'source coverage', field: 'source' });
  }

  for (const [topic, terms] of Object.entries(TOPIC_TERMS)) {
    for (const term of terms) {
      if (containsTerm(title, term)) {
        topics.add(topic);
        trail.push({ tag: topic, matchedTerm: term, field: 'title' });
        break;
      }
      if (summary && containsTerm(summary, term)) {
        topics.add(topic);
        trail.push({ tag: topic, matchedTerm: term, field: 'summary' });
        break;
      }
    }
  }

  for (const [geo, terms] of Object.entries(GEOGRAPHY_TERMS)) {
    for (const term of terms) {
      if (containsTerm(title, term) || (summary && containsTerm(summary, term))) {
        geographies.add(geo);
        trail.push({ tag: geo, matchedTerm: term, field: containsTerm(title, term) ? 'title' : 'summary' });
        break;
      }
    }
  }

  // Sensitivity is judged on the title and summary only, and errs towards caution.
  let sensitive = false;
  let sensitiveReason: string | undefined;
  for (const term of SENSITIVE_TERMS) {
    if (containsTerm(title, term) || (summary && containsTerm(summary, term))) {
      sensitive = true;
      sensitiveReason = term;
      break;
    }
  }

  return {
    topicTags: [...topics],
    geographyTags: [...geographies],
    matchTrail: trail.slice(0, 30),
    sensitive,
    sensitiveReason,
  };
}

/** Momentum is a rules test, not a score. The thresholds live in the config file so a
 *  human can change them and immediately understand what changed. */
export function assessMomentum(items: WorkingItem[]): {
  momentum: 'developing_theme' | 'emerging_opportunity' | null
  distinctSourceCount: number;
  windowDays: number;
} {
  const now = Date.now();
  const developing = items.filter((i) => i.publishedAtMs >= now - DEVELOPING_WINDOW_DAYS * DAY_MS);
  const developingSources = new Set(developing.map((i) => i.sourceId));

  if (developing.length < MIN_ITEMS_DEVELOPING || developingSources.size < MIN_SOURCES_DEVELOPING) {
    return { momentum: null, distinctSourceCount: developingSources.size, windowDays: DEVELOPING_WINDOW_DAYS };
  }

  const emerging = items.filter((i) => i.publishedAtMs >= now - EMERGING_WINDOW_HOURS * 60 * 60 * 1000);
  const emergingSources = new Set(emerging.map((i) => i.sourceId));
  if (emergingSources.size >= MIN_SOURCES_EMERGING) {
    return {
      momentum: 'emerging_opportunity',
      distinctSourceCount: emergingSources.size,
      windowDays: Math.round(EMERGING_WINDOW_HOURS / 24),
    };
  }

  return {
    momentum: 'developing_theme',
    distinctSourceCount: developingSources.size,
    windowDays: DEVELOPING_WINDOW_DAYS,
  };
}

/**
 * Chooses the recommended action from the deterministic facts.
 *
 * The MVP emits a deliberate subset of MediaOpportunityAction. `create_release`,
 * `build_case_study` and `no_action` need the structured story-asset and spokesperson
 * inventory that arrives in slice 7 — emitting them now would mean guessing at material
 * the platform cannot yet see, which is exactly the kind of confident-but-baseless
 * recommendation that makes a tool like this untrustworthy.
 */
export function chooseAction(input: {
  momentum: 'developing_theme' | 'emerging_opportunity';
  hasMatchedRelease: boolean;
  isWatchlistTheme: boolean;
}): { action: string; urgency: 'today' | 'this_week' | 'plan_ahead' } {
  if (input.hasMatchedRelease) {
    return input.momentum === 'emerging_opportunity'
      ? { action: 'prepare_comment', urgency: 'today' }
      : { action: 'targeted_pitch', urgency: 'this_week' };
  }
  if (input.isWatchlistTheme) {
    return { action: 'offer_spokesperson', urgency: 'this_week' };
  }
  return { action: 'monitor', urgency: 'plan_ahead' };
}

