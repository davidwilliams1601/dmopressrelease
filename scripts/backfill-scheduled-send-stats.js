/**
 * One-off backfill for the "scheduled sends never update release status/sends"
 * bug fixed in functions/src/index.ts (2026-09-09, PR #36).
 *
 * Before that fix, a release sent via "Send later" stayed stuck on
 * status: 'Scheduled' with sends: 0 forever, even after its sendJob actually
 * completed — because nothing revisited the release doc once the scheduled
 * job finished. Opens/Clicks were unaffected (the SendGrid webhook updates
 * those directly), so those releases could show real opens with zero sends.
 *
 * This script finds every release across every org that is still stuck on
 * status 'Scheduled' but has at least one 'completed' sendJob against it, and
 * fixes the release doc: status -> 'Sent', sends -> sum of sentCount across
 * all its completed sendJobs (only takes effect if that's greater than the
 * release's current sends, so it's safe to re-run).
 *
 * Uses firebase-admin from the functions directory, same pattern as
 * scripts/set-super-admin.js.
 *
 * Usage:
 *   node scripts/backfill-scheduled-send-stats.js            # dry run (default)
 *   node scripts/backfill-scheduled-send-stats.js --apply     # actually writes
 */

const admin = require('../functions/node_modules/firebase-admin');
const path = require('path');

const credPath = path.join(__dirname, '..', 'service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(credPath),
  projectId: 'dmo-press-release',
});

const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? 'Running in APPLY mode — writes will be made.' : 'Running in DRY RUN mode — no writes will be made (pass --apply to write).');

  const stuckReleasesSnap = await db
    .collectionGroup('releases')
    .where('status', '==', 'Scheduled')
    .get();

  console.log(`Found ${stuckReleasesSnap.size} release(s) with status 'Scheduled'.`);

  let fixedCount = 0;

  for (const releaseDoc of stuckReleasesSnap.docs) {
    const orgRef = releaseDoc.ref.parent.parent;
    const orgId = orgRef ? orgRef.id : null;
    const releaseData = releaseDoc.data();

    if (!orgId) {
      console.warn(`  Skipping ${releaseDoc.ref.path} — could not resolve parent org.`);
      continue;
    }

    const sendJobsSnap = await db
      .collection('orgs')
      .doc(orgId)
      .collection('sendJobs')
      .where('releaseId', '==', releaseDoc.id)
      .where('status', '==', 'completed')
      .get();

    if (sendJobsSnap.empty) {
      // Still genuinely scheduled / not yet sent — leave alone.
      continue;
    }

    const totalSent = sendJobsSnap.docs.reduce((sum, d) => sum + (d.data().sentCount || 0), 0);
    const currentSends = releaseData.sends || 0;

    if (totalSent <= currentSends) {
      console.log(`  Skipping ${orgId}/${releaseDoc.id} ("${releaseData.headline || 'untitled'}") — completed sentCount (${totalSent}) already <= current sends (${currentSends}).`);
      continue;
    }

    console.log(`  Fixing ${orgId}/${releaseDoc.id} ("${releaseData.headline || 'untitled'}"): status Scheduled -> Sent, sends ${currentSends} -> ${totalSent} (from ${sendJobsSnap.size} completed job(s)).`);
    fixedCount++;

    if (APPLY) {
      await releaseDoc.ref.update({
        status: 'Sent',
        sends: totalSent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  console.log(`${APPLY ? 'Fixed' : 'Would fix'} ${fixedCount} release(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
