/**
 * Initial Data Setup Script for PressPilot
 *
 * This script creates the initial organization and user data in Firestore.
 * Run this once to set up your Firebase database for development.
 *
 * Prerequisites:
 * 1. You must be logged in with Firebase CLI: `firebase login`
 * 2. Your Firebase project must be initialized: `firebase init`
 *
 * Usage:
 *   node scripts/setup-initial-data.js YOUR_AUTH_UID YOUR_EMAIL
 *
 * To find your Auth UID:
 *   - Go to Firebase Console > Authentication > Users
 *   - Copy the UID of your user
 */

const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  collection,
  doc,
  setDoc,
  serverTimestamp
} = require('firebase/firestore');

// Firebase configuration - update with your config from Firebase Console
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

async function setupInitialData() {
  // Get user UID and email from command line arguments
  const userUid = process.argv[2];
  const userEmail = process.argv[3];

  if (!userUid || !userEmail) {
    console.error('❌ Error: Missing required arguments');
    console.log('\nUsage:');
    console.log('  node scripts/setup-initial-data.js YOUR_AUTH_UID YOUR_EMAIL');
    console.log('\nExample:');
    console.log('  node scripts/setup-initial-data.js abc123xyz user@visitkent.co.uk');
    console.log('\nTo find your Auth UID:');
    console.log('  1. Go to Firebase Console');
    console.log('  2. Click Authentication > Users');
    console.log('  3. Copy your user\'s UID');
    process.exit(1);
  }

  console.log('🚀 Setting up PressPilot initial data...\n');

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  try {
    // Create organization
    console.log('📝 Creating organization...');
    const orgRef = doc(db, 'orgs', 'visit-kent');
    await setDoc(orgRef, {
      name: 'Visit Kent',
      slug: 'visit-kent',
      boilerplate: 'Visit Kent is the Destination Management Organisation for Kent, the Garden of England. Our role is to promote Kent as a premier visitor destination to both domestic and international markets, working with and on behalf of our partners to grow the value of tourism to the Kent economy.',
      pressContact: {
        name: 'Jane Doe',
        email: 'press@visitkent.co.uk',
      },
      brandToneNotes: 'Our tone is professional, inviting, and inspiring. We focus on the rich history, beautiful landscapes, and vibrant culture of Kent. Avoid overly casual language. Emphasize quality and authenticity.',
      createdAt: serverTimestamp(),
    });
    console.log('✅ Organization created: visit-kent\n');

    // Create user
    console.log('👤 Creating user...');
    const userRef = doc(db, 'orgs', 'visit-kent', 'users', userUid);
    await setDoc(userRef, {
      orgId: 'visit-kent',
      email: userEmail,
      role: 'Admin',
      createdAt: serverTimestamp(),
    });
    console.log(`✅ User created: ${userEmail}\n`);

    // Create a sample press release
    console.log('📰 Creating sample press release...');
    const releaseRef = doc(collection(db, 'orgs', 'visit-kent', 'releases'));
    await setDoc(releaseRef, {
      orgId: 'visit-kent',
      headline: "Kent's Gardens Bloom for Summer Festival",
      slug: 'kents-gardens-bloom-for-summer-festival',
      campaignType: 'Seasonal',
      targetMarket: 'UK',
      audience: 'Consumer',
      status: 'Draft',
      createdAt: serverTimestamp(),
      sends: 0,
      opens: 0,
      clicks: 0,
    });
    console.log('✅ Sample press release created\n');

    console.log('🎉 Setup complete!\n');
    console.log('Next steps:');
    console.log('  1. Run: npm run dev');
    console.log('  2. Log in with your Firebase account');
    console.log('  3. Visit the dashboard to see your data!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up data:', error);
    console.error('\nMake sure you have:');
    console.error('  1. Created a .env file with your Firebase config');
    console.error('  2. Enabled Firestore in Firebase Console');
    console.error('  3. Deployed your Firestore security rules');
    process.exit(1);
  }
}

setupInitialData();
