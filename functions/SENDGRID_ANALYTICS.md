# SendGrid Analytics Webhook Setup

This guide explains how to configure SendGrid Event Webhooks to enable email analytics tracking for the DMO Press Release Platform.

## Overview

The analytics system tracks email engagement events (opens, clicks, bounces, etc.) via SendGrid's Event Webhook feature. When recipients interact with press release emails, SendGrid sends real-time notifications to our Cloud Function, which processes and stores the events in Firestore.

## Prerequisites

1. SendGrid account with a verified sender email
2. Firebase project with Cloud Functions deployed
3. SendGrid API key configured in Firebase Functions

## Step 1: Deploy the Webhook Handler

First, ensure the webhook handler function is deployed:

```bash
# Build and deploy functions
cd functions
npm run build
cd ..
firebase deploy --only functions:handleSendGridWebhook
```

After deployment, you'll receive a webhook URL like:
```
https://us-central1-[YOUR-PROJECT-ID].cloudfunctions.net/handleSendGridWebhook
```

**Important:** Save this URL - you'll need it for SendGrid configuration.

## Step 2: Configure SendGrid Event Webhook

### 2.1 Access SendGrid Dashboard

1. Log in to your [SendGrid account](https://app.sendgrid.com/)
2. Navigate to **Settings** → **Mail Settings** → **Event Webhook**

### 2.2 Enable Event Webhook

Click **"Enable Event Webhook"** if it's not already enabled.

### 2.3 Configure HTTP POST URL

Enter your Cloud Function URL from Step 1:
```
https://us-central1-[YOUR-PROJECT-ID].cloudfunctions.net/handleSendGridWebhook
```

### 2.4 Select Events to Track

Enable the following event types:
- ✅ **Delivered** - Email successfully delivered to recipient's server
- ✅ **Opened** - Recipient opened the email
- ✅ **Clicked** - Recipient clicked a link in the email
- ✅ **Bounced** - Email bounced (hard or soft bounce)
- ✅ **Spam Report** - Recipient marked email as spam
- ❌ **Unsubscribe** (Optional) - If you implement unsubscribe functionality
- ❌ **Dropped** (Optional) - Email was dropped by SendGrid
- ❌ **Deferred** (Optional) - Email delivery was temporarily delayed

### 2.5 Configure Webhook Security (Recommended)

For production environments, enable webhook signature verification:

1. In SendGrid, enable **"Event Webhook Signature"**
2. Copy the **Verification Key** provided by SendGrid
3. Set it as a Firebase Functions environment variable:

```bash
# Set the webhook verification key
firebase functions:config:set sendgrid.webhook_verification_key="YOUR_VERIFICATION_KEY"

# Redeploy functions for the config to take effect
firebase deploy --only functions
```

Alternatively, for local development, set the environment variable:
```bash
export SENDGRID_WEBHOOK_VERIFICATION_KEY="YOUR_VERIFICATION_KEY"
```

### 2.6 Save Configuration

Click **"Save"** to activate the webhook.

## Step 3: Test the Webhook

SendGrid provides a built-in test feature:

1. In the Event Webhook settings, click **"Test Your Integration"**
2. SendGrid will send sample events to your webhook URL
3. Check Firebase Functions logs to verify events were received:

```bash
firebase functions:log --only handleSendGridWebhook
```

You should see log entries like:
```
Received SendGrid webhook
Processing 5 events
Successfully stored 5 events
```

## Step 4: Verify Analytics Data

After sending a test press release:

1. Navigate to the release detail page in your app
2. Scroll to the **Analytics** section
3. You should see:
   - Engagement overview (delivered, opens, clicks)
   - Chart showing activity over time
   - List of clicked URLs
   - Event timeline with detailed activity

## Troubleshooting

### No Events Appearing

**Check SendGrid Activity Feed:**
1. Go to SendGrid **Activity Feed**
2. Verify emails are being sent successfully
3. Check if events are being triggered

**Verify Webhook URL:**
1. Ensure the Cloud Function is deployed
2. Test the URL manually using curl:
```bash
curl -X POST https://your-webhook-url.cloudfunctions.net/handleSendGridWebhook \
  -H "Content-Type: application/json" \
  -d '[{"event":"test"}]'
```

**Check Function Logs:**
```bash
firebase functions:log --only handleSendGridWebhook --limit 50
```

Look for errors or warnings about:
- Invalid signatures (if verification is enabled)
- Missing orgId/releaseId in events
- Firestore permission errors

### Events Missing orgId/releaseId

The webhook needs custom arguments to associate events with releases. Verify that the `sendEmail` function includes:

```typescript
customArgs: {
  orgId: orgId,
  releaseId: release.id,
}
```

### Signature Verification Failures

If you see "Invalid webhook signature" errors:
1. Verify the verification key is set correctly
2. Ensure the key matches what SendGrid provides
3. For development, temporarily disable verification by setting `NODE_ENV=development`

### Permission Errors

If events aren't being stored in Firestore:
1. Check Firestore rules allow Cloud Functions to write events
2. Verify the `events` collection rules in `firestore.rules`
3. Ensure Cloud Functions have proper Firebase Admin permissions

## Data Structure

### Events Collection Path
```
/orgs/{orgId}/events/{eventId}
```

### Event Document Structure
```typescript
{
  id: string;
  orgId: string;
  releaseId: string;
  recipientEmail: string;
  eventType: 'delivered' | 'open' | 'click' | 'bounce' | 'spam_report';
  timestamp: Timestamp;
  metadata?: {
    url?: string;        // For click events
    userAgent?: string;  // Browser/email client
    ip?: string;         // Recipient IP
    reason?: string;     // For bounce events
  };
}
```

### Release Stats Updates

When events are received, the webhook automatically updates the release document:
- **Opens:** Increments `release.opens`
- **Clicks:** Increments `release.clicks`

These aggregated stats appear in:
- Dashboard engagement overview
- Release list (sends/opens/clicks columns)
- Release detail page stats card

## Security Considerations

1. **Webhook Signature Verification:** Always enable in production to prevent unauthorized requests
2. **Firestore Rules:** Events collection is read-only for clients; only Cloud Functions can write
3. **Rate Limiting:** Firebase automatically rate-limits Cloud Function invocations
4. **Data Privacy:** Consider GDPR/privacy laws when storing recipient email addresses

## Monitoring

### View Recent Events

Check the Firebase Console:
1. Go to **Firestore Database**
2. Navigate to `/orgs/{your-org-id}/events`
3. View recent event documents

### Monitor Function Performance

```bash
# View function metrics
firebase functions:log --only handleSendGridWebhook

# Check for errors
firebase functions:log --only handleSendGridWebhook | grep -i error
```

### SendGrid Event Webhook Dashboard

SendGrid provides webhook analytics:
1. Go to **Settings** → **Mail Settings** → **Event Webhook**
2. View delivery statistics and error rates

## Cost Considerations

- **Cloud Functions:** Charged per invocation (webhook calls + event processing)
- **Firestore:** Charged per document write (one write per event)
- **Estimated:** For 1,000 emails with typical engagement (~30% opens, ~5% clicks), expect ~350 events
  - ~350 Cloud Function invocations
  - ~350 Firestore writes
  - Cost: < $0.01 for most use cases

## Advanced Configuration

### Batch Event Processing

The webhook already handles SendGrid's batch event delivery (up to 1,000 events per request).

### Custom Event Filtering

To track only specific event types, modify `handleSendGridWebhook` in `functions/src/webhooks.ts`:

```typescript
// Example: Only track opens and clicks
const allowedEvents = ['open', 'click'];
if (!allowedEvents.includes(event.event)) {
  continue; // Skip this event
}
```

### Event Retention

To implement automatic cleanup of old events (e.g., delete events older than 90 days), create a scheduled function:

```typescript
export const cleanupOldEvents = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    );
    // Query and delete old events
  });
```

## Support

For issues with:
- **SendGrid:** Contact SendGrid Support or check their [Event Webhook Documentation](https://docs.sendgrid.com/for-developers/tracking-events/event)
- **Firebase:** Check Firebase Status or documentation
- **Application:** Review function logs and Firestore rules

## Next Steps

After setting up analytics:
1. Send test press releases to real email addresses
2. Monitor the analytics dashboard for engagement data
3. Use insights to optimize email content and timing
4. Consider A/B testing different headlines or content approaches
