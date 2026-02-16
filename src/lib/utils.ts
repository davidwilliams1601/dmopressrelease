import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
