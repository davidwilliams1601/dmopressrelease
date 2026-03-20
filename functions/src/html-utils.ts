import he from 'he';

/**
 * Encode HTML special characters to prevent XSS in email templates.
 * Wraps the `he` library for a consistent API across all Cloud Functions.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return he.encode(str);
}
