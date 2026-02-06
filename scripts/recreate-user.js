const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function recreateUser() {
  const email = 'davidwilliams1601@gmail.com';
  const name = 'David Test';
  const orgId = 'visit-kent';
  const role = 'Admin'; // Let's make you an admin this time

  console.log(`\n🔍 Step 1: Checking existing user with email ${email}...`);

  try {
    // Try to get existing user
    const existingUser = await auth.getUserByEmail(email);
    console.log(`✅ Found existing Firebase Auth user: ${existingUser.uid}`);

    // Check if Firestore document exists
    const userDocRef = db.collection('orgs').doc(orgId).collection('users').doc(existingUser.uid);
    const userDoc = await userDocRef.get();

    if (userDoc.exists) {
      console.log(`✅ Firestore document exists`);
      console.log('   Current data:', userDoc.data());
    } else {
      console.log(`❌ Firestore document DOES NOT exist at: /orgs/${orgId}/users/${existingUser.uid}`);
      console.log(`   This is the problem! The Auth account exists but the Firestore document doesn't.`);
    }

    // Delete the auth user
    console.log(`\n🗑️  Step 2: Deleting existing Firebase Auth user...`);
    await auth.deleteUser(existingUser.uid);
    console.log(`✅ Deleted auth user`);

    // Delete Firestore document if it exists
    if (userDoc.exists) {
      await userDocRef.delete();
      console.log(`✅ Deleted Firestore document`);
    }

  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`✅ No existing user found (this is fine)`);
    } else {
      console.error('Error checking existing user:', error);
      process.exit(1);
    }
  }

  // Create new user
  console.log(`\n🆕 Step 3: Creating new user...`);
  const newPassword = 'TempPassword123!';

  try {
    // Create Firebase Auth user
    const userRecord = await auth.createUser({
      email,
      password: newPassword,
      displayName: name,
    });

    console.log(`✅ Created Firebase Auth user: ${userRecord.uid}`);

    // Create initials
    const initials = name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    // Create Firestore document
    const userData = {
      id: userRecord.uid,
      orgId: orgId,
      email: email,
      name: name,
      initials: initials,
      role: role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'admin-script',
    };

    console.log(`\n📝 Step 4: Creating Firestore document at /orgs/${orgId}/users/${userRecord.uid}...`);
    console.log('   Data:', JSON.stringify(userData, null, 2));

    await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(userRecord.uid)
      .set(userData);

    console.log(`✅ Created Firestore document`);

    // Verify the document was created
    console.log(`\n✅ Step 5: Verifying document creation...`);
    const verifyDoc = await db
      .collection('orgs')
      .doc(orgId)
      .collection('users')
      .doc(userRecord.uid)
      .get();

    if (verifyDoc.exists) {
      console.log(`✅ VERIFIED: Document exists and contains:`);
      console.log(JSON.stringify(verifyDoc.data(), null, 2));
    } else {
      console.log(`❌ ERROR: Document was not created!`);
      process.exit(1);
    }

    console.log(`\n🎉 SUCCESS! User recreated successfully.`);
    console.log(`\n📋 Login credentials:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    console.log(`   Role: ${role}`);
    console.log(`\n⚠️  Please log in with these credentials and change your password immediately.`);

  } catch (error) {
    console.error('\n❌ Error creating user:', error);
    process.exit(1);
  }

  process.exit(0);
}

recreateUser();
