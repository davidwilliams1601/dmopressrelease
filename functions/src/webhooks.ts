import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { refundSmartDistributionCredit } from './credits';

const db = admin.firestore();

const NUM_SHARDS = 10;

/**
 * Verify SendGrid webhook signature using ECDSA P-256.
 *
 * QA fix (2026-08-20): this used to return `true` (accept unverified) whenever no
 * key was configured, with only a console.warn — meaning any unauthenticated caller
 * could POST fabricated bounce/dropped events and trigger a real automatic credit
 * refund. This endpoint mutates a financial ledger, so it now fails CLOSED: missing
 * key or missing signature headers both reject the request outright. The
 * `SENDGRID_WEBHOOK_VERIFICATION_KEY` secret (or `functions.config().sendgrid.
 * webhook_verification_key`) MUST be configured before this webhook is enabled in
 * any environment, or every event — including legitimate delivery/bounce updates —
 * will now be rejected instead of silently trusted.
 */
function verifySendGridSignature(
  payload: string,
  signature: string | undefined,
  timestamp: string | undefined
): boolean {
  const verificationKey = functions.config().sendgrid?.webhook_verification_key ||
                         process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

  if (!verificationKey) {
    console.error('SendGrid webhook verification key not configured — rejecting webhook (fail closed).');
    return false;
  }

  if (!signature || !timestamp) {
    console.error('SendGrid webhook request missing signature/timestamp headers — rejecting.');
    return false;
  }

  try {
    const publicKeyDer = Buffer.from(verificationKey, 'base64');
    const verifier = crypto.createVerify('SHA256');
    verifier.update(timestamp + payload);
    return verifier.verify(
      { key: publicKeyDer, format: 'der', type: 'spki' },
      Buffer.from(signature, 'base64')
    );
  } catch (error) {
    console.error('Error verifying SendGrid signature:', error);
    return false;
  }
}

/**
 * Extract orgId and releaseId from custom args in SendGrid event. Also extracts the
 * Phase-4 Smart Distribution custom args (`sendJobId`/`sendJobRecipientId`) set by
 * `sendEmail()`'s `customArgs` — present on every send-job-originated email, absent on
 * anything sent outside a sendJob (e.g. partner emails), so their presence alone is
 * what gates the auto-refund logic below.
 */
function extractMetadataFromEvent(event: any): {
  orgId?: string;
  releaseId?: string;
  partnerEmailId?: string;
  sendJobId?: string;
  sendJobRecipientId?: string;
} {
  const root = event;
  const nested = event.custom_args || {};

  const orgId = root.orgId || nested.orgId;
  const releaseId = root.releaseId || nested.releaseId;
  const partnerEmailId = root.partnerEmailId || nested.partnerEmailId;
  const sendJobId = root.sendJobId || nested.sendJobId;
  const sendJobRecipientId = root.sendJobRecipientId || nested.sendJobRecipientId;

  if (orgId && (releaseId || partnerEmailId)) {
    return { orgId, releaseId, partnerEmailId, sendJobId, sendJobRecipientId };
  }

  console.warn('Could not extract orgId/releaseId or partnerEmailId from event:', event.event);
  return {};
}

/**
 * QA fix (2026-08-20): whether a SendJobRecipient row is a network-sourced Smart
 * Distribution contact (`source === 'smart_distribution_recommendation'` with a
 * `networkContactRef`) rather than a customer-owned outlet contact. Used to decide
 * whether the raw email address may be written into a team-readable document.
 * Fails safe: any read error is treated as network-sourced (the more restrictive
 * outcome) rather than risking a leak.
 * QA fix (H1): checks the opaque `networkContactRef` field, not the old raw
 * `networkContactId` (which no longer exists on this client-readable row).
 */
async function isNetworkSourcedRecipient(
  orgId: string,
  sendJobId: string,
  sendJobRecipientId: string
): Promise<boolean> {
  try {
    const recipientSnap = await db
      .collection('orgs').doc(orgId)
      .collection('sendJobs').doc(sendJobId)
      .collection('recipients').doc(sendJobRecipientId)
      .get();

    if (!recipientSnap.exists) {
      return true;
    }
    const data = recipientSnap.data()!;
    return data.source === 'smart_distribution_recommendation' && !!data.networkContactRef;
  } catch (error) {
    console.error(`[webhook] Failed to check recipient source for ${sendJobRecipientId}, failing safe:`, error);
    return true;
  }
}

/**
 * Smart Distribution (Phase 4): updates the per-recipient `SendJobRecipient` doc for a
 * SendGrid delivery/bounce event and, for a hard bounce or dropped message on a
 * network-sourced recipient that was actually charged, issues the automatic refund
 * (`import-wizard-and-credits.md` §4 refund rules table). Never throws — a failure here
 * must not take down the rest of the webhook batch; errors are logged and swallowed.
 *
 * Idempotent against webhook retries: `refundSmartDistributionCredit` writes its ledger
 * entry with idempotencyKey `refund_${sendJobRecipientId}`, so a duplicate delivery of
 * the same bounce event safely no-ops on the ledger even if this function runs twice.
 *
 * NOTE on the 'dropped' interpretation: SendGrid's 'dropped' event covers several
 * reasons (invalid email, spam-content, unsubscribed, etc.) and is not explicitly
 * addressed in the spec docs. This treats every 'dropped' event as a hard-bounce
 * equivalent for refund purposes — documented here as a deliberate interpretation,
 * not a literal requirement, and called out again in the Phase 4 PR description.
 */
async function handleSmartDistributionRecipientEvent(
  orgId: string,
  sendJobId: string,
  sendJobRecipientId: string,
  event: any
): Promise<void> {
  try {
    const recipientRef = db
      .collection('orgs').doc(orgId)
      .collection('sendJobs').doc(sendJobId)
      .collection('recipients').doc(sendJobRecipientId);

    const recipientSnap = await recipientRef.get();
    if (!recipientSnap.exists) {
      console.warn(`[webhook] SendJobRecipient ${sendJobRecipientId} not found for job ${sendJobId}`);
      return;
    }
    const recipient = recipientSnap.data()!;

    if (event.event === 'delivered') {
      // QA fix (H7): bounced_soft is documented as an interim status — "credit held,
      // resolved automatically once final status known" (see the isSoftBounce branch
      // below) — not a terminal one. Previously this only advanced pending -> delivered,
      // so once a soft bounce landed, a later 'delivered' event for the same recipient
      // (SendGrid retried the deferred message and it succeeded) had no way to ever mark
      // the recipient delivered: it stayed stuck at bounced_soft forever, with its credit
      // reservation never resolved either way. Advance from bounced_soft too, but still
      // protect the true terminal states (bounced_hard, failed) and an existing delivered
      // from being overwritten by a stale, out-of-order 'delivered' webhook — same intent
      // as the original guard.
      if (recipient.deliveryStatus === 'pending' || recipient.deliveryStatus === 'bounced_soft') {
        await recipientRef.update({ deliveryStatus: 'delivered', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      return;
    }

    const isSoftBounce = event.event === 'bounce' && event.type === 'blocked';
    const isHardBounceOrDrop =
      (event.event === 'bounce' && event.type !== 'blocked') || event.event === 'dropped';

    if (isSoftBounce) {
      // "Credit held, resolved automatically once final status known" — no refund yet.
      await recipientRef.update({ deliveryStatus: 'bounced_soft', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    if (isHardBounceOrDrop) {
      // QA fix (H7): a hard bounce/drop already supersedes bounced_soft with no extra
      // guard needed here (bounced_soft -> bounced_hard/failed was always allowed) — this
      // is the other half of "later terminal event supersedes bounced_soft". What it must
      // NOT do is downgrade a recipient that's already reached a terminal state, so a
      // stale, out-of-order hard-bounce webhook can't re-trigger a second refund attempt
      // or flip an already-delivered/failed/bounced_hard row backwards.
      if (
        recipient.deliveryStatus === 'delivered' ||
        recipient.deliveryStatus === 'bounced_hard' ||
        recipient.deliveryStatus === 'failed'
      ) {
        return;
      }
      const newStatus = event.event === 'dropped' ? 'failed' : 'bounced_hard';
      const canRefund =
        recipient.source === 'smart_distribution_recommendation' &&
        !!recipient.creditTransactionId &&
        !recipient.refundTransactionId;

      if (canRefund) {
        const refund = await refundSmartDistributionCredit({
          orgId,
          campaignId: sendJobId,
          originalTransactionId: recipient.creditTransactionId,
          sendJobRecipientId,
          reasonCode: event.event === 'dropped' ? 'delivery_failure_auto_refund' : 'hard_bounce_auto_refund',
        });
        await recipientRef.update({
          deliveryStatus: newStatus,
          refundTransactionId: refund.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await recipientRef.update({ deliveryStatus: newStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
  } catch (err) {
    console.error(`[webhook] Failed to process Smart Distribution recipient event for ${sendJobRecipientId}:`, err);
  }
}

/**
 * Generate a deterministic event ID for idempotency.
 */
function generateEventId(event: any): string {
  const key = `${event.sg_event_id || ''}_${event.sg_message_id || ''}_${event.event || ''}_${event.timestamp || ''}`;
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 20);
}

/**
 * Validate that a timestamp is a reasonable Unix epoch value
 */
function isValidTimestamp(ts: any): boolean {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false;
  const minTs = 1577836800; // 2020-01-01
  const maxTs = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60);
  return ts >= minTs && ts <= maxTs;
}

/**
 * Secret name bound below via `.runWith({ secrets: [...] })`, same pattern as
 * STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET in stripe.ts. The value lives in Google
 * Secret Manager (set with `firebase functions:secrets:set SENDGRID_WEBHOOK_VERIFICATION_KEY`).
 *
 * QA fix (2026-08-20): without this binding, setting the Secret Manager value alone
 * does NOT expose it to this function's runtime `process.env` — the C3 fail-closed
 * check would then reject every webhook call permanently, secret or not.
 */
export const SENDGRID_WEBHOOK_VERIFICATION_KEY = 'SENDGRID_WEBHOOK_VERIFICATION_KEY';

/**
 * QA fix (H9): transactionally claims a single webhook event's deterministic ID and,
 * only if it hasn't been claimed already, writes the event doc and increments every
 * associated counter (best-effort parent counter, distributed shard, and daily
 * aggregate) in that same transaction. Returns true if this call newly claimed the
 * event (counters were incremented), false if it was already claimed by an earlier
 * delivery of the same event (a pure no-op — safe and expected for SendGrid's
 * at-least-once, retry-on-non-2xx delivery model).
 */
async function claimWebhookEventAndIncrementCounters(op: {
  eventRef: FirebaseFirestore.DocumentReference;
  dailyRef: FirebaseFirestore.DocumentReference;
  eventData: any;
  statRef: FirebaseFirestore.DocumentReference;
  eventType: string;
}): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(op.eventRef);
    if (existing.exists) {
      // Already claimed by a prior delivery of this exact event — no-op.
      return false;
    }

    tx.set(op.eventRef, op.eventData);

    if (op.eventType === 'open' || op.eventType === 'click') {
      const field = op.eventType === 'open' ? 'opens' : 'clicks';
      // Keep best-effort counter on the parent doc for backwards compatibility
      tx.update(op.statRef, { [field]: admin.firestore.FieldValue.increment(1) });
      // Write to distributed counter shard (source of truth)
      const shardId = Math.floor(Math.random() * NUM_SHARDS);
      const shardRef = op.statRef.collection('counters').doc(`shard_${shardId}`);
      tx.set(shardRef, { [field]: admin.firestore.FieldValue.increment(1) }, { merge: true });
    }

    // Write daily aggregate stats
    tx.set(op.dailyRef, { [op.eventType]: admin.firestore.FieldValue.increment(1) }, { merge: true });

    return true;
  });
}

/**
 * Cloud Function to handle SendGrid webhook events
 */
export const handleSendGridWebhook = functions
  .runWith({ secrets: [SENDGRID_WEBHOOK_VERIFICATION_KEY] })
  .https.onRequest(async (req, res) => {
  console.log('Received SendGrid webhook');

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const signature = req.headers['x-twilio-email-event-webhook-signature'] as string | undefined;
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string | undefined;
  // QA fix (2026-08-20): verify against the exact bytes SendGrid signed (Firebase
  // Functions attaches the raw request body as `req.rawBody`), not a re-serialized
  // `JSON.stringify(req.body)` — which can differ in key ordering/whitespace from
  // what was actually signed and cause valid signatures to fail verification.
  const rawBody = req.rawBody instanceof Buffer ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

  if (!verifySendGridSignature(rawBody, signature, timestamp)) {
    console.error('Invalid webhook signature');
    res.status(403).send('Forbidden - Invalid signature');
    return;
  }

  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    console.log(`Processing ${events.length} events`);

    const operations: Array<{
      eventRef: FirebaseFirestore.DocumentReference;
      dailyRef: FirebaseFirestore.DocumentReference;
      eventData: any;
      statRef: FirebaseFirestore.DocumentReference;
      eventType: string;
    }> = [];

    for (const event of events) {
      if (!event.email || !event.event) {
        console.warn('Skipping event with missing email or event type');
        continue;
      }

      const { orgId, releaseId, partnerEmailId, sendJobId, sendJobRecipientId } = extractMetadataFromEvent(event);

      if (!orgId || (!releaseId && !partnerEmailId)) {
        console.warn('Skipping event without orgId and releaseId/partnerEmailId:', event.event);
        continue;
      }

      // Smart Distribution (Phase 4): update the per-recipient doc and run the
      // auto-refund logic alongside (not instead of) the existing generic events/stats
      // write path below. Only relevant events matter here; the generic path still
      // records every event type for analytics as before.
      if (
        sendJobId &&
        sendJobRecipientId &&
        (event.event === 'delivered' || event.event === 'bounce' || event.event === 'dropped')
      ) {
        await handleSmartDistributionRecipientEvent(orgId, sendJobId, sendJobRecipientId, event);
      }

      // QA fix (2026-08-20): a network-sourced Smart Distribution contact's raw email
      // must never land in a team-readable doc (the generic `events` collection below
      // is readable by any team member per firestore.rules). Fails safe — treat as
      // network-sourced (omit the email) on any lookup error — since the alternative
      // is silently leaking an anonymised contact's address.
      const networkSourced = sendJobId && sendJobRecipientId
        ? await isNetworkSourcedRecipient(orgId, sendJobId, sendJobRecipientId)
        : false;

      let eventType: string;
      switch (event.event) {
        case 'delivered': eventType = 'delivered'; break;
        case 'open': eventType = 'open'; break;
        case 'click': eventType = 'click'; break;
        case 'bounce':
        case 'dropped': eventType = 'bounce'; break;
        case 'spamreport': eventType = 'spam_report'; break;
        case 'unsubscribe': eventType = 'unsubscribe'; break;
        default:
          console.log(`Ignoring event type: ${event.event}`);
          continue;
      }

      const eventId = generateEventId(event);

      const eventTimestamp = isValidTimestamp(event.timestamp)
        ? admin.firestore.Timestamp.fromMillis(event.timestamp * 1000)
        : admin.firestore.Timestamp.now();

      const metadata: Record<string, string> = {};
      if (event.useragent) metadata.userAgent = event.useragent;
      if (event.ip) metadata.ip = event.ip;
      if (event.url) metadata.url = event.url;
      if (event.reason) metadata.reason = event.reason;

      // Compute date string for daily aggregation
      const eventTs = isValidTimestamp(event.timestamp) ? event.timestamp : Math.floor(Date.now() / 1000);
      const dateStr = new Date(eventTs * 1000).toISOString().split('T')[0];

      if (partnerEmailId) {
        const eventRef = db
          .collection('orgs').doc(orgId!)
          .collection('partnerEmailEvents').doc(eventId);

        const eventData = {
          id: eventRef.id,
          orgId,
          partnerEmailId,
          ...(networkSourced ? {} : { recipientEmail: event.email }),
          eventType,
          timestamp: eventTimestamp,
          metadata,
        };

        const statRef = db
          .collection('orgs').doc(orgId!)
          .collection('partnerEmails').doc(partnerEmailId);

        const dailyRef = db
          .collection('orgs').doc(orgId!)
          .collection('partnerEmails').doc(partnerEmailId)
          .collection('dailyStats').doc(dateStr);

        operations.push({ eventRef, dailyRef, eventData, statRef, eventType });
      } else {
        const eventRef = db
          .collection('orgs').doc(orgId!)
          .collection('events').doc(eventId);

        const eventData = {
          id: eventRef.id,
          orgId,
          releaseId,
          ...(networkSourced ? {} : { recipientEmail: event.email }),
          eventType,
          timestamp: eventTimestamp,
          metadata,
        };

        const statRef = db
          .collection('orgs').doc(orgId!)
          .collection('releases').doc(releaseId!);

        const dailyRef = db
          .collection('orgs').doc(orgId!)
          .collection('releases').doc(releaseId!)
          .collection('dailyStats').doc(dateStr);

        operations.push({ eventRef, dailyRef, eventData, statRef, eventType });
      }
    }

    // QA fix (H9): claim each event's deterministic ID transactionally before touching
    // any counter, instead of batching an unconditional `batch.set` + `increment(1)`
    // pair together. The deterministic eventId already prevented a *duplicate event
    // document* on a webhook retry/replay, but the counter increments below ran
    // unconditionally in the same batch regardless of whether that event doc already
    // existed — so a replayed 'open'/'click' delivery (SendGrid explicitly documents
    // at-least-once delivery with retries) double-counted analytics even though no
    // duplicate event row was ever created. Reading eventRef and writing the event doc
    // + every counter inside one transaction makes the whole claim atomic: if the event
    // was already claimed by a prior delivery, this is a no-op (treated as a successful,
    // idempotent re-delivery, not an error) and nothing is incremented a second time.
    const CONCURRENCY = 20;
    let totalCommitted = 0;
    let totalDuplicates = 0;

    for (let i = 0; i < operations.length; i += CONCURRENCY) {
      const chunk = operations.slice(i, i + CONCURRENCY);
      const claimed = await Promise.all(chunk.map((op) => claimWebhookEventAndIncrementCounters(op)));
      totalCommitted += claimed.filter(Boolean).length;
      totalDuplicates += claimed.filter((wasClaimed) => !wasClaimed).length;
    }

    console.log(`Successfully stored ${totalCommitted} events (${totalDuplicates} duplicate deliveries skipped)`);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});
