import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
 */
export function toDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  return new Date(timestamp);
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
