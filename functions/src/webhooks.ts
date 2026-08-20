import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { refundSmartDistributionCredit } from './credits';

const db = admin.firestore();

const NUM_SHARDS = 10;

/**
 * Verify SendGrid webhook signature using ECDSA P-256.
 * Returns true when valid, or when no key is configured (dev/testing mode).
 */
function verifySendGridSignature(
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  const verificationKey = functions.config().sendgrid?.webhook_verification_key ||
                         process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

  if (!verificationKey) {
    console.warn('SendGrid webhook verification key not configured. Accepting webhook without verification.');
    return true;
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
      // Only advance pending -> delivered; never overwrite a later bounce/refund state
      // that a prior (out-of-order) webhook delivery may have already recorded.
      if (recipient.deliveryStatus === 'pending') {
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
 * Cloud Function to handle SendGrid webhook events
 */
export const handleSendGridWebhook = functions.https.onRequest(async (req, res) => {
  console.log('Received SendGrid webhook');

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
  const rawBody = JSON.stringify(req.body);

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
          recipientEmail: event.email,
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
          recipientEmail: event.email,
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

    // Commit in batches (each event uses up to 4 ops: event + parent counter + shard + daily)
    const BATCH_LIMIT = 125;
    let totalCommitted = 0;

    for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
      const chunk = operations.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();

      for (const op of chunk) {
        batch.set(op.eventRef, op.eventData);

        if (op.eventType === 'open') {
          // Keep best-effort counter on the parent doc for backwards compatibility
          batch.update(op.statRef, { opens: admin.firestore.FieldValue.increment(1) });
          // Write to distributed counter shard (source of truth)
          const shardId = Math.floor(Math.random() * NUM_SHARDS);
          const shardRef = op.statRef.collection('counters').doc(`shard_${shardId}`);
          batch.set(shardRef, { opens: admin.firestore.FieldValue.increment(1) }, { merge: true });
        } else if (op.eventType === 'click') {
          // Keep best-effort counter on the parent doc for backwards compatibility
          batch.update(op.statRef, { clicks: admin.firestore.FieldValue.increment(1) });
          // Write to distributed counter shard (source of truth)
          const shardId = Math.floor(Math.random() * NUM_SHARDS);
          const shardRef = op.statRef.collection('counters').doc(`shard_${shardId}`);
          batch.set(shardRef, { clicks: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }

        // Write daily aggregate stats
        batch.set(op.dailyRef, { [op.eventType]: admin.firestore.FieldValue.increment(1) }, { merge: true });
      }

      await batch.commit();
      totalCommitted += chunk.length;
    }

    console.log(`Successfully stored ${totalCommitted} events`);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});
