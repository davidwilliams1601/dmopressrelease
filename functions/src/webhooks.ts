import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

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
    // No key configured — accept the webhook but log a warning.
    // Set sendgrid.webhook_verification_key in Firebase config to enable
    // signature verification in production.
    console.warn('SendGrid webhook verification key not configured. Accepting webhook without verification.');
    return true;
  }

  try {
    // SendGrid signs webhooks with ECDSA P-256 (SHA-256).
    // The public key is base64-encoded DER (SPKI format).
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
 * SendGrid allows us to pass custom arguments with each email
 */
function extractMetadataFromEvent(event: any): { orgId?: string; releaseId?: string } {
  // SendGrid includes custom args in the event object
  // They can be at the root level or in a custom_args object
  if (event.orgId && event.releaseId) {
    return {
      orgId: event.orgId,
      releaseId: event.releaseId,
    };
  }

  // Check in custom_args object (SendGrid sometimes nests them here)
  if (event.custom_args?.orgId && event.custom_args?.releaseId) {
    return {
      orgId: event.custom_args.orgId,
      releaseId: event.custom_args.releaseId,
    };
  }

  // Fallback: try to extract from sg_message_id or other fields
  console.warn('Could not extract orgId/releaseId from event:', event.event);
  return {};
}

/**
 * Generate a deterministic event ID for idempotency.
 * Uses the SendGrid event's unique fields to prevent duplicate processing on webhook retries.
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
  // Must be between 2020 and 10 years from now
  const minTs = 1577836800; // 2020-01-01
  const maxTs = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60);
  return ts >= minTs && ts <= maxTs;
}

/**
 * Cloud Function to handle SendGrid webhook events
 * This receives email engagement events (opens, clicks, bounces, etc.)
 */
export const handleSendGridWebhook = functions.https.onRequest(async (req, res) => {
  console.log('Received SendGrid webhook');

  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Verify the webhook signature for security
  const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!verifySendGridSignature(rawBody, signature, timestamp)) {
    console.error('Invalid webhook signature');
    res.status(403).send('Forbidden - Invalid signature');
    return;
  }

  try {
    // SendGrid sends an array of events
    const events = Array.isArray(req.body) ? req.body : [req.body];
    console.log(`Processing ${events.length} events`);

    // Process events and build batch operations
    const operations: Array<{
      eventRef: FirebaseFirestore.DocumentReference;
      eventData: any;
      releaseRef: FirebaseFirestore.DocumentReference;
      eventType: string;
    }> = [];

    for (const event of events) {
      // Validate required fields
      if (!event.email || !event.event) {
        console.warn('Skipping event with missing email or event type');
        continue;
      }

      // Extract metadata
      const { orgId, releaseId } = extractMetadataFromEvent(event);

      if (!orgId || !releaseId) {
        console.warn('Skipping event without orgId/releaseId:', event.event);
        continue;
      }

      // Map SendGrid event types to our event types
      let eventType: string;
      switch (event.event) {
        case 'delivered':
          eventType = 'delivered';
          break;
        case 'open':
          eventType = 'open';
          break;
        case 'click':
          eventType = 'click';
          break;
        case 'bounce':
        case 'dropped':
          eventType = 'bounce';
          break;
        case 'spamreport':
          eventType = 'spam_report';
          break;
        case 'unsubscribe':
          eventType = 'unsubscribe';
          break;
        default:
          console.log(`Ignoring event type: ${event.event}`);
          continue;
      }

      // Use deterministic ID for idempotency
      const eventId = generateEventId(event);
      const eventRef = db
        .collection('orgs')
        .doc(orgId)
        .collection('events')
        .doc(eventId);

      // Validate and convert timestamp
      const eventTimestamp = isValidTimestamp(event.timestamp)
        ? admin.firestore.Timestamp.fromMillis(event.timestamp * 1000)
        : admin.firestore.Timestamp.now();

      // Build metadata omitting undefined/empty fields — Firestore rejects undefined values
      const metadata: Record<string, string> = {};
      if (event.useragent) metadata.userAgent = event.useragent;
      if (event.ip) metadata.ip = event.ip;
      if (event.url) metadata.url = event.url;
      if (event.reason) metadata.reason = event.reason;

      const eventData = {
        id: eventRef.id,
        orgId,
        releaseId,
        recipientEmail: event.email,
        eventType,
        timestamp: eventTimestamp,
        metadata,
      };

      const releaseRef = db
        .collection('orgs')
        .doc(orgId)
        .collection('releases')
        .doc(releaseId);

      operations.push({ eventRef, eventData, releaseRef, eventType });
    }

    // Commit in batches of 250 (each event may need 2 ops: set + update)
    // Firestore limit is 500 operations per batch
    const BATCH_LIMIT = 250;
    let totalCommitted = 0;

    for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
      const chunk = operations.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();

      for (const op of chunk) {
        batch.set(op.eventRef, op.eventData);

        if (op.eventType === 'open') {
          batch.update(op.releaseRef, {
            opens: admin.firestore.FieldValue.increment(1),
          });
        } else if (op.eventType === 'click') {
          batch.update(op.releaseRef, {
            clicks: admin.firestore.FieldValue.increment(1),
          });
        }
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
