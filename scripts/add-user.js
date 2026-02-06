const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyCEQji1lRBsREmY7Vt5l8_XDyTY0Pp_Oqc",
  authDomain: "dmo-press-release.firebaseapp.com",
  projectId: "dmo-press-release",
  storageBucket: "dmo-press-release.firebasestorage.app",
  messagingSenderId: "959287689887",
  appId: "1:959287689887:web:4af709961507f1790ad8aa"
};

async function addUser() {
  const userUid = 'jH04xkNH1cMJzSc382foXnemUWx2';
  const userEmail = 'david@theentrepreneurialdad.com';

  console.log('🚀 Adding user to visit-kent organization...\n');

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  try {
    const userRef = doc(db, 'orgs', 'visit-kent', 'users', userUid);
    await setDoc(userRef, {
      id: userUid,
      orgId: 'visit-kent',
      email: userEmail,
      name: 'David Williams',
      initials: 'DW',
      role: 'Admin',
      createdAt: serverTimestamp(),
    });
    
    console.log('✅ User added successfully!\n');
    console.log('User document created at:');
    console.log(`  /orgs/visit-kent/users/${userUid}\n`);
    console.log('You should now be able to access the application.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding user:', error);
    process.exit(1);
  }
}

addUser();
