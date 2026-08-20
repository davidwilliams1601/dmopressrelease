import * as admin from 'firebase-admin';
import { resolveNetworkContactRef } from './network-contact-refs';

const db = admin.firestore();

// ============================================================================
// Smart Distribution — Phase 4: send-time eligibility recheck
// See docs/smart-distribution/implementation-plan.md Phase 4 scope and
// docs/smart-distribution/import-wizard-and-credits.md §4.
//
// Recommendations are generated (Phase 3) ahead of send time and a customer's
// `included` decision can sit untouched for hours or days before they actually
// confirm a send. This module re-derives eligibility at the moment of dispatch so
// a contact that has since been suppressed, opted out, bounced, or duplicated by a
// newer customer-added recipient is never sent to or charged for — this is what
// makes "Selecting 5 network recommendations and confirming a send that dispatches
// to only 4 (1 rejected pre-send) debits exactly 4 credits, not 5" hold true even
// though the customer's original selection said 5.
//
// The eligibility predicates and dedupe-identity helper below are intentionally
// duplicated from recommendations.ts rather than imported from it — same
// no-shared-helper-module convention already used throughout this codebase for
// admin/feature files (see media-network.ts, credits.ts, recommendations.ts's own
// header comments). Keeping generation-time and send-time eligibility as separate
// copies also means a future change to one doesn't silently change the other's
// behaviour without a deliberate edit.
// ============================================================================

/** Must mirror recommendations.ts's FREQUENCY_CAP_COOLDOWN_DAYS. */
const FREQUENCY_CAP_COOLDOWN_DAYS = 30;

function toMillis(value: any): number | undefined {
  if (!value) return undefined;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

function isFrequencyCapped(lastContactedAt: any): boolean {
  const ms = toMillis(lastContactedAt);
  if (!ms) return false;
  const cooldownMs = FREQUENCY_CAP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - ms < cooldownMs;
}

function normaliseIdentity(name?: string, email?: string): string {
  return `${(name || '').trim().toLowerCase()}|${(email || '').trim().toLowerCase()}`;
}

function isValidEmail(email?: string): boolean {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type ResolvedRecipient = {
  snapshotId: string;
  source: 'customer_contact' | 'smart_distribution_recommendation';
  recipientRef?: string;
  // QA fix (H1): only the opaque per-org reference ID travels through this return
  // value (and from there onto client-readable docs) — never the real, stable
  // mediaNetworkContacts document ID. Callers that need the real ID for their own
  // internal, server-only bookkeeping (e.g. credits.ts idempotency keys) must
  // resolve it themselves via resolveNetworkContactRef.
  networkContactRef?: string;
  name?: string;
  email?: string;
  outlet?: string;
};

export type RejectedRecipient = ResolvedRecipient & { rejectedReason: string };

/**
 * Re-resolves and re-checks eligibility, at send time, for every `included`
 * recommendation on a story. `excludeRecipientIds` is the set of normalised
 * name|email identities already covered by the send job's own outlet-list
 * recipients (so a recommendation that duplicates a recipient the customer
 * separately selected is rejected as a duplicate, never sent/charged twice).
 *
 * Reuses the existing `{storyId ASC, decision ASC}` composite index from Phase 3 —
 * no new index required.
 */
export async function resolveSmartDistributionRecipientsForSend(
  orgId: string,
  releaseId: string,
  excludeRecipientIds: Set<string>
): Promise<{ eligible: ResolvedRecipient[]; rejected: RejectedRecipient[] }> {
  const snapshotsSnap = await db
    .collection('orgs')
    .doc(orgId)
    .collection('recommendationSnapshots')
    .where('storyId', '==', releaseId)
    .where('decision', '==', 'included')
    .get();

  // QA fix (H8): previously Smart Distribution suspension was only enforced by
  // disabling the checkbox in the UI (send-release-dialog.tsx) — nothing on the
  // server re-checked it, so a suspended org's team member could still dispatch
  // network-sourced sends (and consume credits) via a direct callable invocation.
  // This is the single choke point every send re-resolves through at dispatch time
  // regardless of client input, so it's the right place to make the block
  // authoritative. Per spec, suspension only stops *network* recommendations/sends
  // — the org's own customer-owned contacts are unaffected — so this doesn't reject
  // the whole resolve, only every network_contact-sourced snapshot below.
  const walletSnap = await db.collection('orgs').doc(orgId).collection('creditWallet').doc('summary').get();
  const isSuspended = walletSnap.exists && walletSnap.data()?.smartDistributionSuspended === true;

  const eligible: ResolvedRecipient[] = [];
  const rejected: RejectedRecipient[] = [];

  // Final org-wide dedupe recheck (mirrors recommendations.ts's generation-time
  // dedupe, but re-run now in case a new Recipient was added to the org after this
  // recommendation was generated).
  const recipientsSnap = await db.collectionGroup('recipients').where('orgId', '==', orgId).get();
  const orgIdentities = new Set<string>();
  for (const doc of recipientsSnap.docs) {
    const r = doc.data();
    orgIdentities.add(normaliseIdentity(r.name, r.email));
  }

  for (const doc of snapshotsSnap.docs) {
    const snap = doc.data();
    const base = {
      snapshotId: doc.id,
      outlet: snap.anonymisedLabel || snap.displayName,
    };

    if (snap.source === 'customer_contact') {
      if (!snap.recipientRef) {
        rejected.push({ ...base, source: 'customer_contact', rejectedReason: 'missing_recipient_ref' });
        continue;
      }
      const recipientDoc = await db.doc(snap.recipientRef).get();
      if (!recipientDoc.exists) {
        rejected.push({ ...base, source: 'customer_contact', recipientRef: snap.recipientRef, rejectedReason: 'recipient_deleted' });
        continue;
      }
      const recipient = recipientDoc.data()!;
      const identity = normaliseIdentity(recipient.name, recipient.email);
      if (recipient.doNotContact === true) {
        rejected.push({ ...base, source: 'customer_contact', recipientRef: snap.recipientRef, name: recipient.name, email: recipient.email, rejectedReason: 'suppressed' });
        continue;
      }
      if (recipient.relationshipStatus === 'bounced' || recipient.relationshipStatus === 'opted_out') {
        rejected.push({ ...base, source: 'customer_contact', recipientRef: snap.recipientRef, name: recipient.name, email: recipient.email, rejectedReason: 'suppressed' });
        continue;
      }
      if (!isValidEmail(recipient.email)) {
        rejected.push({ ...base, source: 'customer_contact', recipientRef: snap.recipientRef, name: recipient.name, email: recipient.email, rejectedReason: 'invalid_email' });
        continue;
      }
      if (excludeRecipientIds.has(identity)) {
        rejected.push({ ...base, source: 'customer_contact', recipientRef: snap.recipientRef, name: recipient.name, email: recipient.email, rejectedReason: 'duplicate' });
        continue;
      }
      eligible.push({
        ...base,
        source: 'customer_contact',
        recipientRef: snap.recipientRef,
        name: recipient.name,
        email: recipient.email,
      });
      excludeRecipientIds.add(identity);
    } else if (snap.source === 'network_contact') {
      // QA fix (H8): suspension blocks every network-sourced recipient at send time,
      // independent of anything the client claims about suspension state.
      if (isSuspended) {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', networkContactRef: snap.networkContactRef, rejectedReason: 'smart_distribution_suspended' });
        continue;
      }
      // QA fix (H1): recommendationSnapshots now stores only the opaque
      // networkContactRef, never the real networkContactId. Resolve it server-side,
      // for this function's own internal lookup only — the real ID is never put back
      // onto `base`/`eligible`/`rejected`, only the opaque ref is.
      if (!snap.networkContactRef) {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', rejectedReason: 'missing_network_contact_ref' });
        continue;
      }
      const realNetworkContactId = await resolveNetworkContactRef(orgId, snap.networkContactRef);
      if (!realNetworkContactId) {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', networkContactRef: snap.networkContactRef, rejectedReason: 'contact_deleted' });
        continue;
      }
      const contactDoc = await db.collection('mediaNetworkContacts').doc(realNetworkContactId).get();
      if (!contactDoc.exists) {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', networkContactRef: snap.networkContactRef, rejectedReason: 'contact_deleted' });
        continue;
      }
      const contact = contactDoc.data()!;
      const identity = normaliseIdentity(contact.identity?.name, contact.identity?.email);
      const health = contact.contactHealth || {};

      if (contact.networkStatus !== 'active') {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', networkContactRef: snap.networkContactRef, rejectedReason: 'inactive' });
        continue;
      }
      if (health.suppressionStatus && health.suppressionStatus !== 'none') {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', networkContactRef: snap.networkContactRef, rejectedReason: 'suppressed' });
        continue;
      }
      if (health.verificationStatus === 'invalid') {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', networkContactRef: snap.networkContactRef, rejectedReason: 'invalid_email' });
        continue;
      }
      if (!isValidEmail(contact.identity?.email)) {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', networkContactRef: snap.networkContactRef, rejectedReason: 'invalid_email' });
        continue;
      }
      if (isFrequencyCapped(health.lastContactedAt)) {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', networkContactRef: snap.networkContactRef, rejectedReason: 'recently_contacted' });
        continue;
      }
      if (excludeRecipientIds.has(identity) || orgIdentities.has(identity)) {
        rejected.push({ ...base, source: 'smart_distribution_recommendation', networkContactRef: snap.networkContactRef, rejectedReason: 'duplicate' });
        continue;
      }
      eligible.push({
        ...base,
        source: 'smart_distribution_recommendation',
        networkContactRef: snap.networkContactRef,
        name: contact.identity?.name,
        email: contact.identity?.email,
      });
      excludeRecipientIds.add(identity);
    } else {
      rejected.push({ ...base, source: 'customer_contact', rejectedReason: 'unknown_source' });
    }
  }

  return { eligible, rejected };
}
