import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      // Strip any wrapping quotes Vercel may add
      const cleaned = json.trim().replace(/^["']|["']$/g, '');
      const serviceAccount = JSON.parse(cleaned);

      if (!serviceAccount.project_id) {
        throw new Error('Service account JSON missing project_id field');
      }

      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    } catch (e) {
      console.error('[firebase-admin] Failed to init with service account:', e);
      throw e;
    }
  }

  // Fallback: use project ID directly if service account isn't available
  return initializeApp({ projectId: 'dmo-press-release' });
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}
