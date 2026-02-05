# Initial Organization Setup

Before we can use real Firestore data, you need to create an initial organization document.

## Option 1: Using Firebase Console (Recommended)

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Go to Firestore Database
4. Click "Start collection"
5. Collection ID: `orgs`
6. Document ID: `visit-kent` (or auto-generate)
7. Add these fields:

```
name: "Visit Kent"
slug: "visit-kent"
boilerplate: "Visit Kent is the Destination Management Organisation for Kent, the Garden of England..."
brandToneNotes: "Professional, inviting, and inspiring. Focus on rich history, beautiful landscapes, and vibrant culture of Kent."
createdAt: [Click "timestamp" type and select current time]
```

8. After creating the organization, create a user document:
   - Navigate to `orgs/visit-kent/users`
   - Document ID: [Your Firebase Auth UID - you can find this in Authentication > Users]
   - Add fields:
```
orgId: "visit-kent"
email: "your-email@example.com"
role: "Admin"
createdAt: [timestamp]
```

## Option 2: Using Firebase Admin SDK (if you have it set up)

Run this script with Node.js:

```javascript
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

async function setupOrganization() {
  const orgRef = db.collection('orgs').doc('visit-kent');

  await orgRef.set({
    name: 'Visit Kent',
    slug: 'visit-kent',
    boilerplate: 'Visit Kent is the Destination Management Organisation for Kent, the Garden of England. Our role is to promote Kent as a premier visitor destination to both domestic and international markets, working with and on behalf of our partners to grow the value of tourism to the Kent economy.',
    brandToneNotes: 'Our tone is professional, inviting, and inspiring. We focus on the rich history, beautiful landscapes, and vibrant culture of Kent. Avoid overly casual language. Emphasize quality and authenticity.',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Replace YOUR_USER_UID with your actual Firebase Auth UID
  const userRef = orgRef.collection('users').doc('YOUR_USER_UID');

  await userRef.set({
    orgId: 'visit-kent',
    email: 'your-email@example.com',
    role: 'Admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('Organization and user created successfully!');
}

setupOrganization();
```

## Next Steps

After creating the organization and user, the app will be able to:
- Fetch your organization data from Firestore
- Display your actual org info on the dashboard
- Save settings back to Firestore
- Store press releases in Firestore

Let me know once you've set this up!
