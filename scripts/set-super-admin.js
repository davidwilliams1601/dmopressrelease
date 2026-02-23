/**
 * One-off script to grant superAdmin custom claim to a user.
 * Uses firebase-admin from the functions directory.
 *
 * Usage: node scripts/set-super-admin.js
 */

const admin = require('../functions/node_modules/firebase-admin');

const path = require('path');
const credPath = path.join(__dirname, '..', 'service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(credPath),
  projectId: 'dmo-press-release',
});

const TARGET_EMAIL = 'david@theentrepreneurialdad.com';
const TARGET_UID   = 'jH04xkNH1cMJzSc382foXnemUWx2';

async function main() {
  // Fetch current claims so we don't overwrite orgId
  const user = await admin.auth().getUser(TARGET_UID);
  const existing = user.customClaims || {};

  console.log('Current claims:', existing);

  const updated = { ...existing, superAdmin: true };
  await admin.auth().setCustomUserClaims(TARGET_UID, updated);

  // Verify
  const verified = await admin.auth().getUser(TARGET_UID);
  console.log(`✅  Claims set for ${TARGET_EMAIL}:`, verified.customClaims);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
