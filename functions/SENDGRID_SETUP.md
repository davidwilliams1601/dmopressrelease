# SendGrid Setup Guide

## Step 1: Create SendGrid Account

1. Go to https://sendgrid.com/
2. Click "Start for Free"
3. Complete signup (Free tier: 100 emails/day forever)
4. Verify your email address

## Step 2: Create API Key

1. Log into SendGrid dashboard
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Name: `DMO Press Release`
5. Select **Full Access** (or Restricted Access with Mail Send permissions)
6. Click **Create & View**
7. **COPY THE API KEY** (you won't see it again!)

## Step 3: Verify Sender Email

**IMPORTANT:** You must verify your sender email address in SendGrid.

### Option A: Single Sender Verification (Quick - Recommended for Testing)

1. In SendGrid, go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Fill in your details:
   - **From Name:** Visit Kent Press Office
   - **From Email Address:** YOUR_EMAIL@yourdomain.com
   - **Reply To:** Same email
   - **Company Address:** Your address
4. Click **Create**
5. Check your email and click the verification link

### Option B: Domain Authentication (Better for Production)

1. In SendGrid, go to **Settings** → **Sender Authentication**
2. Click **Authenticate Your Domain**
3. Follow the wizard to add DNS records
4. Wait for verification (can take up to 48 hours)

## Step 4: Configure Cloud Functions

### For Local Development (.env file):

Create a file `functions/.env`:

```bash
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=your-verified-email@yourdomain.com
```

### For Production (Firebase):

```bash
# Set SendGrid API Key
firebase functions:config:set sendgrid.key="SG.xxxxxxxxxxxxxxxxxxx"

# Set verified sender email
firebase functions:config:set sendgrid.from_email="your-verified-email@yourdomain.com"

# View configuration
firebase functions:config:get
```

## Step 5: Install Dependencies

```bash
cd functions
npm install
```

## Step 6: Test Locally

```bash
# Start Firebase emulators
cd functions
npm run serve
```

Then in another terminal:
```bash
# Test sending a release
# The function will process any new sendJob documents
```

## Step 7: Deploy to Production

```bash
firebase deploy --only functions
```

## Troubleshooting

### Error: "The from email does not match a verified Sender Identity"

**Solution:** Make sure the email in `sendgrid.from_email` matches exactly what you verified in SendGrid.

### Error: "Unauthorized"

**Solution:**
- Check your API key is correct
- Make sure the API key has "Mail Send" permission
- Regenerate API key if needed

### Emails going to spam

**Solutions:**
- Use domain authentication instead of single sender
- Add SPF and DKIM records
- Avoid spam trigger words
- Include physical address in footer
- Add unsubscribe link

## Testing Without Sending Real Emails

If SendGrid is not configured, the function will run in mock mode:
- Logs emails without sending
- Updates send job status normally
- No actual emails sent

## SendGrid Dashboard Features

Monitor your emails:
- **Activity Feed** - See all sent emails
- **Statistics** - Open rates, click rates
- **Suppressions** - Bounces, blocks, spam reports

## Cost Information

**Free Tier:**
- 100 emails/day forever
- All essential features
- Good for testing and small campaigns

**Paid Plans:** (if you need more)
- Essentials: $19.95/mo (50,000 emails)
- Pro: $89.95/mo (100,000 emails)
- Premier: Custom pricing

## Next Steps

After setup:
1. Test with a few recipients first
2. Monitor the SendGrid Activity Feed
3. Check spam folders
4. Ask recipients to whitelist your domain
5. Scale up gradually

## Support

- SendGrid Docs: https://docs.sendgrid.com/
- Firebase Functions: https://firebase.google.com/docs/functions
