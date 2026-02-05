# Setup Scripts

## Initial Data Setup

This script automatically creates your organization, user, and sample data in Firestore.

### Prerequisites

1. **Environment variables**: Make sure your `.env` file has Firebase config:
   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   ```

2. **Firebase Authentication**: You need to have created a user account:
   - Go to Firebase Console > Authentication
   - Click "Add user" if you haven't already
   - Note your User UID (you'll need this for the script)

3. **Firestore Enabled**: Make sure Firestore is enabled in your Firebase project

4. **Node modules**: Run `npm install` if you haven't already

### Usage

```bash
node scripts/setup-initial-data.js YOUR_AUTH_UID YOUR_EMAIL
```

**Example:**
```bash
node scripts/setup-initial-data.js abc123def456ghi789 user@visitkent.co.uk
```

### Finding Your Auth UID

1. Open Firebase Console
2. Go to **Authentication** > **Users**
3. Find your user in the list
4. Copy the **User UID** column value

### What This Script Creates

1. **Organization** (`orgs/visit-kent`)
   - Name: Visit Kent
   - Slug: visit-kent
   - Boilerplate text
   - Press contact info
   - Brand tone notes

2. **User** (`orgs/visit-kent/users/{yourUID}`)
   - Your email
   - Role: Admin
   - Links you to the organization

3. **Sample Press Release** (one example release to test with)

### Troubleshooting

**Error: "Missing permissions"**
- Make sure you've deployed your Firestore security rules:
  ```bash
  firebase deploy --only firestore:rules
  ```

**Error: "Firebase config not found"**
- Check that your `.env` file exists and has all required variables
- Make sure you're running the script from the project root directory

**Error: "User not found"**
- Make sure you've created a user in Firebase Authentication first
- Double-check you're using the correct User UID

### After Setup

Once the script completes successfully:

1. Start your dev server: `npm run dev`
2. Log in with your Firebase Auth credentials
3. You should see:
   - Your organization data in Settings
   - The sample press release in Releases
   - Stats on the Dashboard

### Resetting Data

If you need to start over, you can delete the data in Firebase Console:
1. Go to Firestore Database
2. Delete the `orgs` collection
3. Run the setup script again
