import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// QA fix (H1): server-private mapping between an opaque, per-org reference ID and
// the real, stable `mediaNetworkContacts` document ID.
//
// Before this fix, the real networkContactId was written directly onto two
// client-readable collections — `recommendationSnapshots` and
// `sendJobs/{id}/recipients` (see firestore.rules, both allow `isTeamMember(orgId)`
// reads) — which let any team member resolve an "anonymised" Press Pilot network
// recommendation back to a specific, identifiable mediaNetworkContacts document ID,
// breaking the anonymity guarantee described in docs/smart-distribution/README.md.
//
// Now, every place that used to write the real ID onto one of those documents
// writes an opaque `networkContactRef` (this collection's doc ID) instead. Only
// Cloud Functions ever read or write `networkContactRefs` — firestore.rules denies
// all client access, mirroring the existing `creditReservations` deny-all rule.
// ============================================================================

/**
 * Creates a new opaque reference mapping to `networkContactId` and returns its ID.
 * Use this when no WriteBatch is already in scope for the caller's own write.
 */
export async function createNetworkContactRef(orgId: string, networkContactId: string): Promise<string> {
  const ref = db.collection('orgs').doc(orgId).collection('networkContactRefs').doc();
  await ref.set({
    orgId,
    networkContactId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Allocates a reference ID and stages its write onto an existing `batch` (which the
 * caller must still commit) instead of writing immediately — use this when the
 * caller already has a WriteBatch in scope for the client-facing document it's
 * about to write alongside this ref, to keep both writes atomic and cut round trips.
 */
export function stageNetworkContactRef(
  batch: FirebaseFirestore.WriteBatch,
  orgId: string,
  networkContactId: string
): string {
  const ref = db.collection('orgs').doc(orgId).collection('networkContactRefs').doc();
  batch.set(ref, {
    orgId,
    networkContactId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Resolves an opaque reference back to the real, stable networkContactId.
 * Returns undefined if `ref` is falsy or the reference doc doesn't exist (e.g. it
 * was somehow deleted) — callers must treat that the same as "contact not found".
 */
export async function resolveNetworkContactRef(orgId: string, ref?: string): Promise<string | undefined> {
  if (!ref) return undefined;
  const snap = await db.collection('orgs').doc(orgId).collection('networkContactRefs').doc(ref).get();
  if (!snap.exists) return undefined;
  return snap.data()?.networkContactId as string | undefined;
}
