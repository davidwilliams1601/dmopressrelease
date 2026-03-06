import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  // Vercel: set FIREBASE_SERVICE_ACCOUNT_JSON to the full service account JSON string
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    return initializeApp({ credential: cert(JSON.parse(json)) });
  }

  // Local dev: set GOOGLE_APPLICATION_CREDENTIALS=./service-account.json in .env.local
  // or rely on application default credentials when running on Google Cloud
  return initializeApp();
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}
