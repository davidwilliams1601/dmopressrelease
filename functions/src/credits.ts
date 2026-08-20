import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Checks that the caller has the superAdmin custom claim.
 * Duplicated from super-admin.ts's requireSuperAdmin — same pattern used elsewhere
 * in this codebase (see media-taxonomy.ts, media-network.ts).
 */
function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (!context.auth.token?.superAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
  }
}

/** Writes a superadmin accountability-trail entry. Never fails the calling function. */
async function writeAuditLog(entry: {
  action: string;
  actorUid: string;
  targetId?: string;
  orgId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.collection('auditLogs').add({
      ...entry,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[credits] Failed to write audit log:', err);
  }
}

/**
 * Appends one Smart Distribution credit ledger entry inside a transaction and updates
 * the org's cached wallet summary to match. This is the ONLY place that ever computes
 * a new balance — every public callable below delegates here so `balanceAfter` is
 * always derived from the ledger, never edited in place.
 *
 * Idempotent on `idempotencyKey`: if a transaction with that key already exists for
 * this org, returns the existing entry instead of creating a duplicate (protects
 * against double-clicks / retried callable requests).
 */
type LedgerEntryType = 'purchase' | 'grant' | 'adjustment' | 'refund' | 'reversal';

async function appendLedgerEntry(params: {
  orgId: string;
  type: LedgerEntryType;
  quantity: number;
  reasonCode: string;
  reasonNote?: string;
  campaignId?: string;
  reversesTransactionId?: string;
  createdBy: string;
  expiresAt?: Date;
  idempotencyKey: string;
}): Promise<{ id: string; balanceAfter: number; created: boolean }> {
  const { orgId, idempotencyKey } = params;
  const orgRef = db.collection('orgs').doc(orgId);
  const ledgerRef = orgRef.collection('creditTransactions');
  const walletRef = orgRef.collection('creditWallet').doc('summary');

  const existing = await ledgerRef.where('idempotencyKey', '==', idempotencyKey).limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    return { id: doc.id, balanceAfter: doc.data().balanceAfter, created: false };
  }

  return db.runTransaction(async (txn) => {
    const walletDoc = await txn.get(walletRef);
    const currentBalance = walletDoc.exists ? walletDoc.data()?.balance || 0 : 0;
    const balanceAfter = currentBalance + params.quantity;

    if (balanceAfter < 0) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `This action would take the balance negative (current: ${currentBalance}, change: ${params.quantity}).`
      );
    }

    const txRef = ledgerRef.doc();
    txn.set(txRef, {
      orgId,
      type: params.type,
      quantity: params.quantity,
      balanceAfter,
      reasonCode: params.reasonCode,
      ...(params.reasonNote ? { reasonNote: params.reasonNote } : {}),
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
      ...(params.reversesTransactionId ? { reversesTransactionId: params.reversesTransactionId } : {}),
      createdBy: params.createdBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(params.expiresAt ? { expiresAt: params.expiresAt } : {}),
      idempotencyKey,
    });

    txn.set(
      walletRef,
      {
        balance: balanceAfter,
        lastTransactionId: txRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { id: txRef.id, balanceAfter, created: true };
  });
}

function requireIdempotencyKey(data: Record<string, unknown>): string {
  const key = data.idempotencyKey;
  if (!key || typeof key !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'idempotencyKey is required.');
  }
  return key;
}

function requireOrgId(data: Record<string, unknown>): string {
  const orgId = data.orgId;
  if (!orgId || typeof orgId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');
  }
  return orgId;
}

function requirePositiveQuantity(data: Record<string, unknown>): number {
  const quantity = data.quantity;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'quantity must be a positive number.');
  }
  return quantity;
}

function requireReasonNote(data: Record<string, unknown>): string {
  const note = data.reasonNote;
  if (!note || typeof note !== 'string' || !note.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'reasonNote is required for this action.');
  }
  return note.trim();
}

/**
 * Grants promotional Smart Distribution credits to an org (e.g. a design-partner
 * incentive). Superadmin only. Always requires a reason so the wallet history reads
 * as a labelled grant, never an anonymous top-up — per the explicit product decision
 * that there is no generic "reset credits" action.
 *
 * Input: { orgId, quantity, reasonNote, expiresAt?: ISO date string, idempotencyKey }
 */
export const grantCredits = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const orgId = requireOrgId(data);
  const quantity = requirePositiveQuantity(data);
  const reasonNote = requireReasonNote(data);
  const idempotencyKey = requireIdempotencyKey(data);
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : undefined;

  const result = await appendLedgerEntry({
    orgId,
    type: 'grant',
    quantity,
    reasonCode: 'promotional_grant',
    reasonNote,
    createdBy: context.auth!.uid,
    expiresAt,
    idempotencyKey,
  });

  await writeAuditLog({ action: 'credit_grant', actorUid: context.auth!.uid, orgId, targetId: result.id, metadata: { quantity, reasonNote } });
  return result;
});

/**
 * Records a purchased credit pack once payment has been confirmed (manual entry for
 * now — no self-serve checkout yet, per implementation-plan.md's explicit deferral list).
 * Superadmin only.
 *
 * Input: { orgId, quantity, reasonNote, idempotencyKey }
 */
export const purchaseCredits = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const orgId = requireOrgId(data);
  const quantity = requirePositiveQuantity(data);
  const reasonNote = requireReasonNote(data);
  const idempotencyKey = requireIdempotencyKey(data);

  const result = await appendLedgerEntry({
    orgId,
    type: 'purchase',
    quantity,
    reasonCode: 'manual_purchase_entry',
    reasonNote,
    createdBy: context.auth!.uid,
    idempotencyKey,
  });

  await writeAuditLog({ action: 'credit_purchase', actorUid: context.auth!.uid, orgId, targetId: result.id, metadata: { quantity, reasonNote } });
  return result;
});

/**
 * Issues a manual refund tied to a campaign — the same path the automatic hard-bounce
 * refund (Phase 4) will call into once sends exist. Superadmin only for now (manual
 * refunds); Phase 4 will add a system-triggered call using createdBy: 'system'.
 *
 * Input: { orgId, quantity, campaignId, reasonNote, idempotencyKey }
 */
export const issueRefund = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const orgId = requireOrgId(data);
  const quantity = requirePositiveQuantity(data);
  const reasonNote = requireReasonNote(data);
  const idempotencyKey = requireIdempotencyKey(data);
  const campaignId = data.campaignId;
  if (!campaignId || typeof campaignId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'campaignId is required for a refund.');
  }

  const result = await appendLedgerEntry({
    orgId,
    type: 'refund',
    quantity,
    reasonCode: 'manual_refund',
    reasonNote,
    campaignId,
    createdBy: context.auth!.uid,
    idempotencyKey,
  });

  await writeAuditLog({ action: 'credit_refund', actorUid: context.auth!.uid, orgId, targetId: result.id, metadata: { quantity, campaignId, reasonNote } });
  return result;
});

/**
 * Corrects a balance — for migrations or ledger errors. Always requires a reason note.
 * `quantity` may be negative (a downward correction). Superadmin only.
 *
 * Input: { orgId, quantity (+/-), reasonNote, idempotencyKey }
 */
export const adjustCredits = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const orgId = requireOrgId(data);
  const reasonNote = requireReasonNote(data);
  const idempotencyKey = requireIdempotencyKey(data);
  const quantity = data.quantity;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'quantity must be a non-zero number.');
  }

  const result = await appendLedgerEntry({
    orgId,
    type: 'adjustment',
    quantity,
    reasonCode: 'manual_adjustment',
    reasonNote,
    createdBy: context.auth!.uid,
    idempotencyKey,
  });

  await writeAuditLog({ action: 'credit_adjustment', actorUid: context.auth!.uid, orgId, targetId: result.id, metadata: { quantity, reasonNote } });
  return result;
});

/**
 * Reverses a prior transaction by appending an offsetting entry — the original
 * transaction is never edited or deleted, only offset, so it stays visible in history.
 * Superadmin only.
 *
 * Input: { orgId, transactionId, reasonNote, idempotencyKey }
 */
export const reverseTransaction = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const orgId = requireOrgId(data);
  const reasonNote = requireReasonNote(data);
  const idempotencyKey = requireIdempotencyKey(data);
  const transactionId = data.transactionId;
  if (!transactionId || typeof transactionId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'transactionId is required.');
  }

  const originalRef = db.collection('orgs').doc(orgId).collection('creditTransactions').doc(transactionId);
  const originalDoc = await originalRef.get();
  if (!originalDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Original transaction not found.');
  }
  const original = originalDoc.data()!;
  if (original.type === 'reversal') {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot reverse a reversal.');
  }

  const result = await appendLedgerEntry({
    orgId,
    type: 'reversal',
    quantity: -original.quantity,
    reasonCode: 'reversal',
    reasonNote,
    reversesTransactionId: transactionId,
    createdBy: context.auth!.uid,
    idempotencyKey,
  });

  await writeAuditLog({
    action: 'credit_reversal',
    actorUid: context.auth!.uid,
    orgId,
    targetId: result.id,
    metadata: { reversesTransactionId: transactionId, reasonNote },
  });
  return result;
});

/**
 * Suspends or re-enables Smart Distribution for an org. This is an org-level flag, not
 * a ledger entry — per the spec, suspension stops network recommendations/sends but
 * does not touch the credit balance. Superadmin only.
 *
 * Input: { orgId, suspended: boolean, reasonNote }
 */
export const suspendSmartDistribution = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const orgId = requireOrgId(data);
  const suspended = data.suspended;
  if (typeof suspended !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'suspended must be a boolean.');
  }

  const walletRef = db.collection('orgs').doc(orgId).collection('creditWallet').doc('summary');
  await walletRef.set(
    {
      smartDistributionSuspended: suspended,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAuditLog({
    action: 'suspend_smart_distribution',
    actorUid: context.auth!.uid,
    orgId,
    metadata: { suspended, reasonNote: data.reasonNote },
  });

  return { success: true, suspended };
});

/**
 * Returns an org's wallet summary + recent ledger entries for the superadmin console
 * (the org's own team can already read these documents directly via Firestore rules —
 * this callable exists purely so a superadmin, who is not a member of every org, can
 * view the same data from the admin console).
 *
 * Input: { orgId }
 */
export const getOrgCreditSummary = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const orgId = requireOrgId(data);

  const orgRef = db.collection('orgs').doc(orgId);
  const [walletDoc, transactionsSnapshot] = await Promise.all([
    orgRef.collection('creditWallet').doc('summary').get(),
    orgRef.collection('creditTransactions').orderBy('createdAt', 'desc').limit(50).get(),
  ]);

  return {
    wallet: walletDoc.exists ? walletDoc.data() : { balance: 0, smartDistributionSuspended: false },
    transactions: transactionsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
});
