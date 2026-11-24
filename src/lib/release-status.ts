import type { Release, ReleaseDistributionStatus } from '@/lib/types';

/**
 * Two independent facts about a release, shown as two pills:
 *  - Newsroom: is it publicly readable? (legacy status 'Sent', or newsroomVisible)
 *  - Email: what happened to the journalist send? (distributionStatus, written only by
 *    Cloud Functions). Releases sent before distributionStatus existed read as 'sent'.
 */
export function isInNewsroom(release: Pick<Release, 'status' | 'newsroomVisible'>): boolean {
  return release.status === 'Sent' || release.newsroomVisible === true;
}

export function effectiveDistributionStatus(
  release: Pick<Release, 'status' | 'distributionStatus'>
): ReleaseDistributionStatus {
  if (release.distributionStatus) return release.distributionStatus;
  if (release.status === 'Sent') return 'sent';
  if (release.status === 'Scheduled') return 'scheduled';
  return 'not_sent';
}

export const DISTRIBUTION_LABELS: Record<ReleaseDistributionStatus, string> = {
  not_sent: 'Not emailed',
  scheduled: 'Email scheduled',
  queued: 'Email queued',
  sending: 'Sending',
  sent: 'Emailed',
  partially_sent: 'Partly emailed',
  failed: 'Email failed',
  delivered: 'Emailed',
};

export const DISTRIBUTION_CLASSES: Partial<Record<ReleaseDistributionStatus, string>> = {
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  queued: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  sending: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  partially_sent: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};
