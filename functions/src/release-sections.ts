/**
 * Pure helpers for the press-release "furniture" that follows the story:
 * ENDS → Notes to editors → About {org} → Media contact.
 *
 * TWO COPIES: src/lib/release-sections.ts and functions/src/release-sections.ts.
 * the journalist email and the Next public page are separate compilation units
 * (same precedent as brand-utils.ts / html-utils.ts). Keep the two files
 * byte-identical; functions/src/__tests__/format-email.test.ts pins the rendered
 * order so the surfaces cannot drift.
 */

export type PressContactLike = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
} | null | undefined;

export type ReleaseSectionsLike = {
  notesToEditors?: string | null;
};

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/**
 * Child orgs are provisioned with `pressContact: { name: '', email: '' }`, so a
 * truthy object is not enough — every field must be checked for content.
 */
export function hasPressContact(contact: PressContactLike): boolean {
  if (!contact) return false;
  return Boolean(clean(contact.name) || clean(contact.email) || clean(contact.phone));
}

/** Trimmed contact fields with blanks removed, for rendering without stray separators. */
export function pressContactParts(contact: PressContactLike): {
  name: string;
  email: string;
  phone: string;
} {
  return {
    name: clean(contact?.name),
    email: clean(contact?.email),
    phone: clean(contact?.phone),
  };
}

/** Trimmed notes, or '' when absent. */
export function notesToEditorsText(release: ReleaseSectionsLike): string {
  return clean(release.notesToEditors);
}

/**
 * "ENDS" marks where the story stops and the background begins. It renders only
 * when there is per-release background to follow it. The org's own boilerplate
 * does NOT count: every org already has one, so triggering on it would change
 * every existing customer's email (spec AC1/AC3).
 */
export function shouldRenderEnds(release: ReleaseSectionsLike): boolean {
  return notesToEditorsText(release).length > 0;
}

/** Digits, spaces, +, (), - only — what a `tel:` href can safely carry. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}
