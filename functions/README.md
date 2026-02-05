# Cloud Functions for DMO Press Release

## Quick Start with SendGrid

**👉 See [SENDGRID_SETUP.md](./SENDGRID_SETUP.md) for complete setup instructions**

## Setup

1. Install dependencies:
   ```bash
   cd functions
   npm install
   ```

2. Configure SendGrid (see SENDGRID_SETUP.md):
   - Create SendGrid account
   - Get API key
   - Verify sender email
   - Set environment variables

3. Build the functions:
   ```bash
   npm run build
   ```

## Email Service Provider

SendGrid is pre-configured and ready to use. The `sendEmail` function will automatically use SendGrid when configured.

### Option 1: SendGrid

1. Install SendGrid:
   ```bash
   npm install @sendgrid/mail
   ```

2. Get API key from https://sendgrid.com/

3. Set environment variable:
   ```bash
   firebase functions:config:set sendgrid.key="YOUR_API_KEY"
   ```

4. Update the `sendEmail` function to use SendGrid (code example is in the comments)

### Option 2: Mailgun

1. Install Mailgun:
   ```bash
   npm install mailgun.js form-data
   ```

2. Get API key from https://mailgun.com/

3. Set environment variable:
   ```bash
   firebase functions:config:set mailgun.key="YOUR_API_KEY"
   firebase functions:config:set mailgun.domain="YOUR_DOMAIN"
   ```

### Option 3: AWS SES, Postmark, etc.

Similar setup - install the SDK, configure credentials, and update the `sendEmail` function.

## Testing Locally

1. Start the Firebase emulator:
   ```bash
   npm run serve
   ```

2. The function will watch for new sendJob documents in the Firestore emulator

## Deployment

Deploy functions to Firebase:
```bash
firebase deploy --only functions
```

Or deploy everything:
```bash
firebase deploy
```

## Function: processSendJob

**Trigger:** onCreate of `orgs/{orgId}/sendJobs/{jobId}`

**What it does:**
1. Updates send job status to 'processing'
2. Fetches the release document
3. Fetches all recipients from selected outlet lists
4. Sends email to each recipient
5. Updates send job with sent/failed counts
6. Marks job as 'completed' or 'failed'

**Environment Variables Needed:**
- Email service provider credentials (SendGrid, Mailgun, etc.)

## Monitoring

View logs:
```bash
firebase functions:log
```

Or in Firebase Console: Functions > Logs
