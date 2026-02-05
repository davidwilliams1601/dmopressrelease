import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

/**
 * Verify SendGrid webhook signature
 * @param payload The raw request payload
 * @param signature The signature from the request header
 * @param timestamp The timestamp from the request header
 * @returns True if signature is valid
 */
function verifySendGridSignature(
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  // Get the verification key from environment
  const verificationKey = functions.config().sendgrid?.webhook_verification_key ||
                         process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

  if (!verificationKey) {
    console.warn('SendGrid webhook verification key not configured');
    // In development, allow unsigned requests
    return process.env.NODE_ENV !== 'production';
  }

  try {
    // SendGrid uses ECDSA signature verification
    // Concatenate timestamp and payload
    const payload_to_verify = timestamp + payload;

    // Create HMAC
    const hmac = crypto.createHmac('sha256', verificationKey);
    hmac.update(payload_to_verify);
    const computed_signature = hmac.digest('base64');

    return computed_signature === signature;
  } catch (error) {
    console.error('Error verifying signature:', error);
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

    const batch = db.batch();
    let eventCount = 0;

    for (const event of events) {
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

      // Create event document
      const eventRef = db
        .collection('orgs')
        .doc(orgId)
        .collection('events')
        .doc();

      const eventData = {
        id: eventRef.id,
        orgId,
        releaseId,
        recipientEmail: event.email,
        eventType,
        timestamp: admin.firestore.Timestamp.fromMillis(event.timestamp * 1000),
        metadata: {
          userAgent: event.useragent || undefined,
          ip: event.ip || undefined,
          url: event.url || undefined,
          reason: event.reason || undefined,
        },
      };

      batch.set(eventRef, eventData);
      eventCount++;

      // Update release stats directly in the batch
      const releaseRef = db
        .collection('orgs')
        .doc(orgId)
        .collection('releases')
        .doc(releaseId);

      if (eventType === 'open') {
        batch.update(releaseRef, {
          opens: admin.firestore.FieldValue.increment(1),
        });
      } else if (eventType === 'click') {
        batch.update(releaseRef, {
          clicks: admin.firestore.FieldValue.increment(1),
        });
      }
    }

    // Commit all events in a single batch
    if (eventCount > 0) {
      await batch.commit();
      console.log(`Successfully stored ${eventCount} events`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});
