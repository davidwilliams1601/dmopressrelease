import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

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
 * Extract orgId and releaseId from custom args in SendGrid event
 */
function extractMetadataFromEvent(event: any): { orgId?: string; releaseId?: string; partnerEmailId?: string } {
  const root = event;
  const nested = event.custom_args || {};

  const orgId = root.orgId || nested.orgId;
  const releaseId = root.releaseId || nested.releaseId;
  const partnerEmailId = root.partnerEmailId || nested.partnerEmailId;

  if (orgId && (releaseId || partnerEmailId)) {
    return { orgId, releaseId, partnerEmailId };
  }

  console.warn('Could not extract orgId/releaseId or partnerEmailId from event:', event.event);
  return {};
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

      const { orgId, releaseId, partnerEmailId } = extractMetadataFromEvent(event);

      if (!orgId || (!releaseId && !partnerEmailId)) {
        console.warn('Skipping event without orgId and releaseId/partnerEmailId:', event.event);
        continue;
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
