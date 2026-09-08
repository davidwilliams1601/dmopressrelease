/**
 * Per-recipient exclusion for send jobs.
 *
 * A send targets whole outlet lists (`outletListIds`). Callers may additionally pass
 * `excludedRecipientRefs` — full Firestore document paths of individual recipients
 * inside those lists who should NOT receive this send. Exclusion (rather than an
 * include list) keeps the default behaviour unchanged, keeps the payload small when a
 * handful of names are dropped from a long list, and means a list that grows later
 * is never silently truncated by a stale selection.
 *
 * Pure helpers, no Firestore access, so they can be unit-tested (see
 * __tests__/send-exclusions.test.ts).
 */

export const MAX_EXCLUDED_RECIPIENTS = 2000;

export type ParsedExclusions =
  | { ok: true; refs: string[] }
  | { ok: false; error: string };

/** Firestore path of a recipient document inside an org's outlet list. */
export function recipientRefPath(orgId: string, listId: string, recipientId: string): string {
  return `orgs/${orgId}/outletLists/${listId}/recipients/${recipientId}`;
}

/**
 * Validate a client-supplied `excludedRecipientRefs` value against the org and the
 * lists actually selected for this send. Returns de-duplicated refs on success.
 *
 * Rules: optional (undefined/null → no exclusions); must be an array of non-empty
 * strings; each must be a recipient path under one of `outletListIds` for `orgId`;
 * capped at MAX_EXCLUDED_RECIPIENTS.
 */
export function parseExcludedRecipientRefs(
  raw: unknown,
  orgId: string,
  outletListIds: string[]
): ParsedExclusions {
  if (raw === undefined || raw === null) return { ok: true, refs: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'excludedRecipientRefs must be an array of recipient document paths.' };
  }
  if (raw.length > MAX_EXCLUDED_RECIPIENTS) {
    return { ok: false, error: `excludedRecipientRefs cannot contain more than ${MAX_EXCLUDED_RECIPIENTS} entries.` };
  }
  const allowedPrefixes = outletListIds.map((listId) => `orgs/${orgId}/outletLists/${listId}/recipients/`);
  const refs = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string' || !entry) {
      return { ok: false, error: 'excludedRecipientRefs must contain only non-empty strings.' };
    }
    const prefix = allowedPrefixes.find((p) => entry.startsWith(p));
    if (!prefix) {
      return { ok: false, error: 'Every excluded recipient must belong to one of the selected outlet lists.' };
    }
    const recipientId = entry.slice(prefix.length);
    if (!recipientId || recipientId.includes('/')) {
      return { ok: false, error: 'Excluded recipient paths must point at a recipient document.' };
    }
    refs.add(entry);
  }
  return { ok: true, refs: Array.from(refs) };
}

/** Split a fetched list into the recipients to send to and the ones deliberately left out. */
export function applyExclusions<T extends { recipientRef: string }>(
  recipients: T[],
  excludedRefs: Iterable<string>
): { kept: T[]; excluded: T[] } {
  const excludedSet = new Set(excludedRefs);
  const kept: T[] = [];
  const excluded: T[] = [];
  for (const r of recipients) {
    if (excludedSet.has(r.recipientRef)) excluded.push(r);
    else kept.push(r);
  }
  return { kept, excluded };
}
