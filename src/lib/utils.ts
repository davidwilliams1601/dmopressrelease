import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format as formatDate } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Base URL for building shareable, public-facing links (invites, newsroom, media).
 * Prefers the configured production domain so links never inherit a protected
 * Vercel preview/deployment URL from window.location.origin.
 */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  );
}

/**
 * Safely convert a Firestore Timestamp or serialized date to a JS Date.
 * Handles both Firestore Timestamp objects (with .toDate()) and plain date strings/numbers.
 *
 * Bug fix: a Timestamp returned from an httpsCallable is NOT a Timestamp on the client —
 * the callable protocol JSON-serialises it into a plain `{ _seconds, _nanoseconds }`
 * object (some paths use `{ seconds, nanoseconds }`), which has no `.toDate()`, so this
 * fell through to `new Date(object)` and produced an Invalid Date. Passing that to
 * date-fns `format` throws `RangeError: Invalid time value`, which took out the whole
 * Superadmin Media Network page the moment it had its first import batch to render.
 * Those serialised shapes are now handled explicitly.
 */
export function toDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (typeof timestamp.toMillis === 'function') {
    return new Date(timestamp.toMillis());
  }
  const seconds = timestamp._seconds ?? timestamp.seconds;
  if (typeof seconds === 'number') {
    const nanos = timestamp._nanoseconds ?? timestamp.nanoseconds ?? 0;
    return new Date(seconds * 1000 + Math.round(nanos / 1e6));
  }
  return new Date(timestamp);
}

/** True when a value is a Date that can actually be formatted. */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Formats any timestamp shape `toDate` understands, returning `fallback` instead of
 * throwing when the value can't be parsed. Use this rather than calling date-fns
 * `format(toDate(x))` directly on data that came back from a callable or an import —
 * an unparseable date should render as a dash, never crash the page.
 */
export function formatTimestamp(value: any, pattern: string, fallback = '—'): string {
  if (!value) return fallback;
  const date = toDate(value);
  if (!isValidDate(date)) return fallback;
  return formatDate(date, pattern);
}

/**
 * Splits a single full-name string into { firstName, lastName } best-effort — the
 * first whitespace-separated token is the first name, everything else is the last
 * name. Used to backfill firstName/lastName for Recipient rows created before those
 * fields existed (which only ever stored a combined `name`), so opening one of those
 * contacts in the edit form still shows separate fields instead of leaving them blank.
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Joins first/last name into the combined `name` field, collapsing extra whitespace. */
export function joinFullName(firstName: string, lastName: string): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ');
}
