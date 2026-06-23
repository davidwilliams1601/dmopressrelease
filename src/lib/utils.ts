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
