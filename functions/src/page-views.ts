import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Public page-view tracking for a release's newsroom page
 * (src/app/releases/[orgSlug]/[releaseSlug]/page.tsx).
 *
 * That page is unauthenticated (journalists/public visitors, no sign-in), so
 * this has to be a public entry point — deliberately does NOT check
 * context.auth, unlike submitSupportTicket. It only ever increments a vanity
 * counter on a release that is already publicly visible, so the blast radius
 * of abuse is low (inflated pageViews stat, nothing else).
 *
 * Writes go through this callable rather than a public Firestore security
 * rule so the write path stays narrow and server-validated (org + release
 * must actually exist and be publicly visible) instead of opening any
 * client-writable field on the release doc.
 */
export const recordReleasePageView = functions.https.onCall(async (data) => {
  const orgId: string = (data?.orgId || '').trim();
  const releaseId: string = (data?.releaseId || '').trim();

  if (!orgId || !releaseId) {
    // Fail silently from the caller's perspective (best-effort analytics) —
    // still throw so it's visible in function logs if the client is
    // misconfigured, but never let this block the page from rendering.
    throw new functions.https.HttpsError('invalid-argument', 'orgId and releaseId are required.');
  }

  const releaseRef = db.collection('orgs').doc(orgId).collection('releases').doc(releaseId);
  const releaseSnap = await releaseRef.get();

  if (!releaseSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Release not found.');
  }

  const status = releaseSnap.data()?.status;
  if (status !== 'Ready' && status !== 'Sent') {
    // Same visibility rule the public page itself enforces — don't count
    // views against releases that shouldn't be publicly reachable anyway.
    throw new functions.https.HttpsError('permission-denied', 'Release is not publicly visible.');
  }

  await releaseRef.update({
    pageViews: admin.firestore.FieldValue.increment(1),
  });

  return { ok: true };
});
