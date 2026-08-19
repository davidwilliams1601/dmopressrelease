/**
 * Small shared per-vertical copy for Cloud Functions email templates.
 *
 * NOTE: functions/src is a separate TypeScript build from the frontend
 * (src/lib/verticals.ts), so it can't import that file directly. This
 * mirrors just the pieces email templates need, keeping the two in sync
 * is a manual step — if you add a new vertical, update both files.
 */

const MEDIA_REQUEST_TOPICS_LABEL: Record<string, string> = {
  dmo: 'Destinations',
  charity: 'Focus Areas',
  publisher: 'Coverage Areas',
  'trade-body': 'Sectors',
  education: 'Subjects / Programmes',
};

export function getMediaRequestTopicsLabel(vertical?: string): string {
  return MEDIA_REQUEST_TOPICS_LABEL[vertical || 'dmo'] || MEDIA_REQUEST_TOPICS_LABEL.dmo;
}
