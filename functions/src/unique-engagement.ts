import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { countUnique, rebuildUniqueEngagement, type EngagedState } from './unique-engagement-core';

const db = admin.firestore();

function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  if (!context.auth.token?.superAdmin) throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
}

async function writeMarkers(parent: FirebaseFirestore.DocumentReference, state: Map<string, EngagedState>) {
  const entries = Array.from(state.entries());
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [key, s] of entries.slice(i, i + 400)) {
      batch.set(parent.collection('uniqueEngagement').doc(key), { ...s, backfilled: true });
    }
    await batch.commit();
  }
}

async function backfillRelease(orgRef: FirebaseFirestore.DocumentReference, releaseId: string) {
  const releaseRef = orgRef.collection('releases').doc(releaseId);
  const jobs = await orgRef.collection('sendJobs').where('releaseId', '==', releaseId).get();
  const rows: Array<{ id: string; email?: string | null; opened: boolean; clicked: boolean }> = [];
  for (const job of jobs.docs) {
    const recips = await job.ref.collection('recipients').get();
    for (const r of recips.docs) {
      const d = r.data();
      rows.push({ id: r.id, email: d.email || null, opened: !!d.firstOpenedAt, clicked: !!d.firstClickedAt });
    }
  }
  const evSnap = await orgRef.collection('events').where('releaseId', '==', releaseId).get();
  const events = evSnap.docs.map((e) => e.data() as { eventType: string; recipientEmail?: string });
  const state = rebuildUniqueEngagement(rows, events);
  await writeMarkers(releaseRef, state);
  const counts = countUnique(state);
  await releaseRef.update(counts);
  return counts;
}

async function backfillPartnerEmail(orgRef: FirebaseFirestore.DocumentReference, partnerEmailId: string) {
  const ref = orgRef.collection('partnerEmails').doc(partnerEmailId);
  const evSnap = await orgRef.collection('partnerEmailEvents').where('partnerEmailId', '==', partnerEmailId).get();
  const events = evSnap.docs.map((e) => e.data() as { eventType: string; recipientEmail?: string });
  const state = rebuildUniqueEngagement([], events);
  await writeMarkers(ref, state);
  const counts = countUnique(state);
  await ref.update(counts);
  return counts;
}

/**
 * One-off: set uniqueOpens / uniqueClicks on releases and member emails sent before
 * unique counting existed, and write the per-recipient markers so later events don't
 * count anyone twice. Safe to re-run; it rebuilds from stored history each time.
 * Demo orgs are skipped (their figures are seeded). Super-admin only.
 *
 * Input: { orgId?: string } — omit to run across every org.
 */
export const backfillUniqueEngagement = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);
    const orgIds: string[] = data?.orgId
      ? [String(data.orgId)]
      : (await db.collection('orgs').select().get()).docs.map((d) => d.id);

    let releases = 0;
    let partnerEmails = 0;
    for (const orgId of orgIds) {
      const orgRef = db.collection('orgs').doc(orgId);
      const org = await orgRef.get();
      if (!org.exists || org.data()?.isDemo) continue;
      const sent = await orgRef.collection('releases').where('status', '==', 'Sent').get();
      for (const r of sent.docs) {
        await backfillRelease(orgRef, r.id);
        releases++;
      }
      const emails = await orgRef.collection('partnerEmails').get();
      for (const e of emails.docs) {
        await backfillPartnerEmail(orgRef, e.id);
        partnerEmails++;
      }
    }
    console.log(`[backfillUniqueEngagement] ${releases} releases, ${partnerEmails} member emails across ${orgIds.length} orgs by ${context.auth!.uid}`);
    return { success: true, orgs: orgIds.length, releases, partnerEmails };
  });
