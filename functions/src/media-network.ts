import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { normaliseOutletTypeLabel } from './media-taxonomy';

const db = admin.firestore();

/**
 * QA fix (Medium): deterministic Firestore document ID for a network contact, derived
 * from its normalised (lowercased) email. Previously every mediaNetworkContacts doc
 * got a random auto-generated ID and dedup was decided entirely by a plain, one-time
 * `existingEmails` query taken BEFORE the import loop — so two import batches (or two
 * concurrent requests for the same batch) racing on the same new email would each see
 * "not a duplicate" and each create its own document, producing real duplicates that
 * the intra-batch `seenInThisBatch` set can't catch across separate calls. Hashing the
 * email into the document ID turns "is this email already in the network" into an
 * actual uniqueness constraint enforced by Firestore itself: `create()` on an ID that
 * already exists always fails with ALREADY_EXISTS, regardless of how the two writers
 * interleaved, so the loser of the race is reliably detected below instead of silently
 * creating a duplicate row.
 */
function networkContactDocId(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
}

/**
 * Checks that the caller has the superAdmin custom claim.
 * Duplicated from super-admin.ts's requireSuperAdmin — same pattern used elsewhere
 * in this codebase (see media-taxonomy.ts).
 */
function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (!context.auth.token?.superAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
  }
}

/**
 * Writes a superadmin accountability-trail entry. Never fails the calling function.
 * QA fix (M11): stored at /auditLogs/{actorUid}/entries/{logId} — kept in sync with the
 * same path change in functions/src/credits.ts's writeAuditLog; see that comment for
 * the reasoning (firestore.rules can only scope a `list` query to one actor via the
 * document path, not via resource.data).
 */
async function writeAuditLog(entry: {
  action: string;
  actorUid: string;
  targetId?: string;
  orgId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.collection('auditLogs').doc(entry.actorUid).collection('entries').add({
      ...entry,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[media-network] Failed to write audit log:', err);
  }
}

const VALID_SOURCE_TYPES = ['press_pilot_research', 'licensed', 'partner_provided', 'public_research', 'other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NetworkImportRow = {
  name?: string;
  email?: string;
  role?: string;
  profileUrl?: string;
  outletName?: string;
  outletType?: string;
  location?: string;
  audienceScope?: string;
  editorialFocus?: string[];
  geographies?: string[];
  topics?: string[];
  recentCoverageTitle?: string;
  recentCoverageUrl?: string;
  recentCoverageDate?: string;
};

/**
 * Imports a batch of Press Pilot media-network contacts. Superadmin only. Every row
 * lands at `networkStatus: 'review'` — nothing becomes recommendable until a superadmin
 * explicitly approves it and publishes the batch (see publishMediaNetworkBatch below).
 * This is the ONLY way `mediaNetworkContacts` documents are created — Firestore rules
 * set `allow write: if false` on that collection for every client.
 *
 * Input:
 *   fileName: string
 *   sourceType: MediaNetworkContact['provenance']['sourceType']
 *   sourceReference?: string   — required when sourceType is 'licensed' or 'partner_provided'
 *   rows: NetworkImportRow[]   — already column-mapped client-side by the import wizard
 *
 * Returns: { batchId, totalRows, readyCount, duplicateCount, invalidCount }
 */
export const importMediaNetworkBatch = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { fileName, sourceType, sourceReference, rows } = data as {
    fileName?: string;
    sourceType?: string;
    sourceReference?: string;
    rows?: NetworkImportRow[];
  };

  if (!fileName || typeof fileName !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'fileName is required.');
  }
  if (!sourceType || !VALID_SOURCE_TYPES.includes(sourceType)) {
    throw new functions.https.HttpsError('invalid-argument', `sourceType must be one of: ${VALID_SOURCE_TYPES.join(', ')}.`);
  }
  if ((sourceType === 'licensed' || sourceType === 'partner_provided') && !sourceReference?.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'sourceReference is required for licensed and partner_provided sources.');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'rows must be a non-empty array.');
  }
  if (rows.length > 2000) {
    throw new functions.https.HttpsError('invalid-argument', 'A single import batch is limited to 2000 rows — split larger files.');
  }

  // Dedup against the existing network by email (import-time pass; recommendation-time
  // dedup against each org's own contacts happens in Phase 3).
  const existingEmails = new Set<string>();
  const existingSnapshot = await db.collection('mediaNetworkContacts').select('identity').get();
  existingSnapshot.forEach((doc) => {
    const email = doc.data()?.identity?.email;
    if (email) existingEmails.add(String(email).toLowerCase());
  });

  const batchRef = db.collection('mediaNetworkImportBatches').doc();
  const seenInThisBatch = new Set<string>();
  let readyCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  const suppressedCount = 0;

  const writer = db.bulkWriter();
  writer.onWriteError((err) => {
    // QA fix (Medium): an ALREADY_EXISTS failure on a create() is the expected,
    // correct outcome of the concurrency-safe dedup mechanism below (see
    // networkContactDocId) — it means another concurrent import already won the race
    // for this exact email. Retrying can never turn that into a success, so don't
    // waste bulkWriter's retry budget on it; let it reject immediately so the
    // per-row promise below can reclassify it as a duplicate.
    if (err.code === 6 /* ALREADY_EXISTS */) return false;
    console.error('[importMediaNetworkBatch] bulkWriter error:', err);
    return err.failedAttempts < 3;
  });

  // QA fix (Medium): collect each row's write outcome so a losing concurrent-dedup
  // race (ALREADY_EXISTS) can be reclassified as a duplicate before the batch summary
  // counts are finalized, instead of being silently dropped/miscounted.
  const rowOutcomes: Promise<{ email: string; ok: boolean }>[] = [];

  for (const row of rows) {
    const name = (row.name || '').trim();
    const email = (row.email || '').trim().toLowerCase();
    const outletName = (row.outletName || '').trim();

    const isInvalid = !name || !email || !EMAIL_RE.test(email) || !outletName;
    const isDuplicate = !isInvalid && (existingEmails.has(email) || seenInThisBatch.has(email));

    if (isInvalid) {
      invalidCount++;
      continue;
    }
    if (isDuplicate) {
      duplicateCount++;
      continue;
    }

    seenInThisBatch.add(email);
    readyCount++;

    // QA fix (Medium): deterministic ID (see networkContactDocId) instead of a random
    // auto-generated one — this is what makes create() below a real, race-safe
    // uniqueness check across concurrent import calls.
    const contactRef = db.collection('mediaNetworkContacts').doc(networkContactDocId(email));
    const recentCoverage = row.recentCoverageTitle
      ? [
          {
            title: row.recentCoverageTitle,
            url: row.recentCoverageUrl || '',
            publishedAt: row.recentCoverageDate ? new Date(row.recentCoverageDate) : null,
            themes: [] as string[],
          },
        ]
      : [];

    const writePromise = writer
      .create(contactRef, {
        identity: {
          name,
          email,
          ...(row.role ? { role: row.role } : {}),
          ...(row.profileUrl ? { profileUrl: row.profileUrl } : {}),
        },
        outlet: {
          name: outletName,
          // QA fix (Medium): normalise the raw imported label (e.g. "Trade publication")
          // to the controlled kebab-case value ("trade") this field is documented to
          // store, as defence in depth behind the same fix in the two client wizards.
          type: row.outletType ? normaliseOutletTypeLabel(row.outletType) : '',
          ...(row.location ? { location: row.location } : {}),
          ...(row.audienceScope ? { audienceScope: row.audienceScope } : {}),
        },
        editorialFocus: row.editorialFocus || [],
        geographies: row.geographies || [],
        topics: row.topics || [],
        recentCoverage,
        provenance: {
          sourceType,
          ...(sourceReference ? { sourceReference } : {}),
          collectedAt: admin.firestore.FieldValue.serverTimestamp(),
          rightsReviewStatus: 'pending',
          importBatchId: batchRef.id,
        },
        contactHealth: {
          verificationStatus: 'unverified',
          bounceCount: 0,
          suppressionStatus: 'none',
        },
        networkStatus: 'review',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => ({ email, ok: true }))
      .catch((err) => {
        // QA fix (Low): log the deterministic (one-way-hashed) doc ID rather than the
        // raw network-contact email — this warning previously put a raw network-contact
        // address into ordinary Cloud Function logs, outside the documented
        // superadmin-only audit trail for that anonymised data.
        console.warn(`[importMediaNetworkBatch] concurrent duplicate for contact ${contactRef.id}, skipping:`, err?.message || err);
        return { email, ok: false };
      });
    rowOutcomes.push(writePromise);
  }

  // QA fix (Medium): flush and resolve every row's create() before finalizing counts,
  // so a concurrent-import race (ALREADY_EXISTS) is reflected in the batch summary
  // written below rather than in the optimistic pre-write counts.
  await writer.flush();
  for (const outcome of await Promise.all(rowOutcomes)) {
    if (!outcome.ok) {
      readyCount--;
      duplicateCount++;
    }
  }

  writer.create(batchRef, {
    fileName,
    sourceType,
    ...(sourceReference ? { sourceReference } : {}),
    uploadedBy: context.auth!.uid,
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    totalRows: rows.length,
    readyCount,
    duplicateCount,
    invalidCount,
    suppressedCount,
    status: 'review',
  });

  await writer.close();

  console.log(
    `[importMediaNetworkBatch] ${context.auth!.uid} imported batch ${batchRef.id}: ${readyCount} ready, ${duplicateCount} duplicate, ${invalidCount} invalid.`
  );

  return { batchId: batchRef.id, totalRows: rows.length, readyCount, duplicateCount, invalidCount };
});

/** Lists all media-network import batches, most recent first. Superadmin only. */
export const listMediaNetworkBatches = functions.https.onCall(async (_data, context) => {
  requireSuperAdmin(context);

  const snapshot = await db.collection('mediaNetworkImportBatches').orderBy('uploadedAt', 'desc').limit(100).get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
});

/**
 * Returns the contacts belonging to a batch, INCLUDING raw identity, so a superadmin
 * can actually review quality before publishing. Because this exposes raw
 * name/email/profileUrl, every call writes an audit-log entry per
 * docs/smart-distribution/data-model-and-security.md's accountability requirement.
 * Superadmin only.
 */
export const getMediaNetworkBatchContacts = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { batchId } = data as { batchId?: string };
  if (!batchId) {
    throw new functions.https.HttpsError('invalid-argument', 'batchId is required.');
  }

  const snapshot = await db
    .collection('mediaNetworkContacts')
    .where('provenance.importBatchId', '==', batchId)
    .get();

  const contacts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  await writeAuditLog({
    action: 'view_network_batch_identities',
    actorUid: context.auth!.uid,
    targetId: batchId,
    metadata: { contactCount: contacts.length },
  });

  return { contacts };
});

/**
 * Returns a single network contact INCLUDING raw identity. Superadmin only.
 * Audit-logged for the same reason as getMediaNetworkBatchContacts.
 */
export const getMediaNetworkContact = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { contactId } = data as { contactId?: string };
  if (!contactId) {
    throw new functions.https.HttpsError('invalid-argument', 'contactId is required.');
  }

  const doc = await db.collection('mediaNetworkContacts').doc(contactId).get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Contact not found.');
  }

  await writeAuditLog({
    action: 'view_network_contact_identity',
    actorUid: context.auth!.uid,
    targetId: contactId,
  });

  return { id: doc.id, ...doc.data() };
});

const SETTABLE_STATUSES = ['review', 'active', 'suppressed', 'archived'];

/**
 * Sets a single network contact's networkStatus — used during review to reject
 * (-> 'suppressed' or 'archived') an individual bad row before the batch is published,
 * or to suppress/archive an already-active contact later. Superadmin only.
 */
export const updateMediaNetworkContactStatus = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { contactId, networkStatus } = data as { contactId?: string; networkStatus?: string };
  if (!contactId) {
    throw new functions.https.HttpsError('invalid-argument', 'contactId is required.');
  }
  if (!networkStatus || !SETTABLE_STATUSES.includes(networkStatus)) {
    throw new functions.https.HttpsError('invalid-argument', `networkStatus must be one of: ${SETTABLE_STATUSES.join(', ')}.`);
  }

  const ref = db.collection('mediaNetworkContacts').doc(contactId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Contact not found.');
  }

  await ref.update({
    networkStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(networkStatus !== 'review' ? { 'provenance.rightsReviewStatus': networkStatus === 'active' ? 'approved' : 'rejected' } : {}),
  });

  return { success: true };
});

/**
 * Publishes a batch: marks the batch itself 'published' once every contact in it has
 * an explicit decision (networkStatus !== 'review'). Superadmin only.
 *
 * QA fix (H5): previously this bulk-flipped every remaining 'review' contact straight
 * to 'active' with no confirmation, so any contact a superadmin hadn't gotten around
 * to individually approving/rejecting was silently auto-approved on Publish — for a
 * media-network import that means an un-vetted contact (raw identity, unconfirmed
 * consent/rights) could enter the network and become recommendable without anyone
 * actually deciding it belonged there. Publish now hard-blocks (server-side, so this
 * can't be bypassed by calling the callable directly) while any contact in the batch
 * is still undecided; the superadmin must explicitly Approve or Reject every row via
 * updateMediaNetworkContactStatus first. There is nothing left to bulk-activate at
 * publish time — every 'active' row already got there via an explicit decision.
 *
 * This is the only path that makes a network contact recommendable — see Phase 3's
 * matching function, which will only ever draw from networkStatus == 'active'.
 */
export const publishMediaNetworkBatch = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { batchId } = data as { batchId?: string };
  if (!batchId) {
    throw new functions.https.HttpsError('invalid-argument', 'batchId is required.');
  }

  const batchRef = db.collection('mediaNetworkImportBatches').doc(batchId);
  const batchDoc = await batchRef.get();
  if (!batchDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Batch not found.');
  }

  const reviewSnapshot = await db
    .collection('mediaNetworkContacts')
    .where('provenance.importBatchId', '==', batchId)
    .where('networkStatus', '==', 'review')
    .get();

  if (!reviewSnapshot.empty) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `${reviewSnapshot.size} contact${reviewSnapshot.size !== 1 ? 's' : ''} in this batch still ` +
        `${reviewSnapshot.size !== 1 ? 'have' : 'has'} no decision. Approve or reject every contact before publishing.`
    );
  }

  const activeSnapshot = await db
    .collection('mediaNetworkContacts')
    .where('provenance.importBatchId', '==', batchId)
    .where('networkStatus', '==', 'active')
    .get();

  await batchRef.update({ status: 'published' });

  console.log(`[publishMediaNetworkBatch] ${context.auth!.uid} published batch ${batchId}: ${activeSnapshot.size} active contacts.`);

  return { success: true, publishedCount: activeSnapshot.size };
});
