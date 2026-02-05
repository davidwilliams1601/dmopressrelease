# PressPilot Setup Guide

## Current Status

✅ **Deployed Successfully:**
- Frontend: Vercel
- Firestore Database: dmo-press-release
- Storage: dmo-press-release
- Cloud Functions: dmo-press-release
- Authentication: Email/Password enabled

✅ **Organization Created:**
- Org ID: `visit-kent`
- User account created and can access dashboard

## Remaining Setup Steps

### 1. Configure SendGrid for Email Sending

To enable email sending functionality, you need to set the SendGrid API key in Firebase Functions:

```bash
# Set the SendGrid API key
firebase functions:config:set sendgrid.key="YOUR_SENDGRID_API_KEY"

# Redeploy functions to apply the config
firebase deploy --only functions
```

**To get a SendGrid API key:**
1. Sign up at https://sendgrid.com/
2. Go to Settings → API Keys
3. Create a new API key with "Full Access" permissions
4. Copy the key (you won't be able to see it again)

### 2. Configure SendGrid Webhook for Analytics

To enable email analytics (opens, clicks, bounces, etc.), configure the SendGrid webhook:

**Webhook URL:**
```
https://us-central1-dmo-press-release.cloudfunctions.net/handleSendGridWebhook
```

**Setup Steps:**
1. Log into SendGrid dashboard
2. Go to Settings → Mail Settings → Event Webhook
3. Enable the Event Notification
4. Enter the webhook URL above
5. Select events to track:
   - Delivered
   - Opened
   - Clicked
   - Bounced
   - Spam Reports
   - Unsubscribe
6. Click "Test Your Integration" to verify
7. Save the settings

**Optional: Webhook Signature Verification**

For added security, you can enable webhook signature verification:

```bash
# Set the verification key from SendGrid
firebase functions:config:set sendgrid.webhook_verification_key="YOUR_VERIFICATION_KEY"

# Redeploy functions
firebase deploy --only functions
```

To get the verification key:
1. In SendGrid webhook settings, enable "Signed Event Webhook"
2. Copy the verification key
3. Use the command above to set it

### 3. Test the Application

Once SendGrid is configured, test the complete flow:

1. **Create a Press Release:**
   - Go to Releases → New Release
   - Fill in headline, subheading, and content
   - Upload an image (drag & drop)
   - Save the release

2. **Create an Outlet List:**
   - Go to Outlets → New List
   - Add recipients with email addresses
   - Save the list

3. **Send a Press Release:**
   - Open a release
   - Click "Send Release"
   - Select outlet lists
   - Confirm and send

4. **Monitor Analytics:**
   - Check email inbox for the press release
   - Open the email (should increment opens counter)
   - Click a link (should increment clicks counter)
   - View release analytics page for detailed stats

## Features Overview

### 📧 Email Distribution
- Send press releases to multiple outlet lists
- Custom email templates with branding
- Image embedding in emails
- Tracking links for analytics

### 📊 Analytics Dashboard
- Email opens tracking
- Click tracking with URL breakdown
- Bounce and spam report monitoring
- Event timeline for each release
- Charts and visualizations
- Individual recipient engagement

### 🖼️ Media Assets
- Drag-and-drop image uploads
- Image preview and management
- Firebase Storage integration
- Automatic cleanup when releases deleted
- 10MB file size limit
- Image-only validation

### 🔒 Security
- Multi-tenant data isolation by organization
- Role-based access control (Admin/User)
- Firestore security rules
- Storage security rules
- Webhook signature verification
- Authenticated requests only

## Project Structure

```
/
├── src/
│   ├── app/                    # Next.js App Router pages
│   ├── components/             # React components
│   ├── firebase/               # Firebase client SDK setup
│   └── lib/                    # Utilities and types
├── functions/
│   └── src/                    # Cloud Functions
│       ├── index.ts            # Email sending and cleanup
│       └── webhooks.ts         # SendGrid webhook handler
├── firestore.rules             # Firestore security rules
├── storage.rules               # Storage security rules
└── firebase.json               # Firebase configuration
```

## Support

For issues or questions:
- Review the implementation plan: `/plan.md`
- Check SendGrid webhook documentation: `functions/SENDGRID_ANALYTICS.md`
- View Firebase Console: https://console.firebase.google.com/project/dmo-press-release

## Next Steps

1. Set up SendGrid API key (required for sending emails)
2. Configure SendGrid webhook (required for analytics)
3. Test the complete flow
4. Invite team members to the organization
5. Start creating and sending press releases!
