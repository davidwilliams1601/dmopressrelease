import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

/**
 * Self-service creation of a daughter org, for network-root customers who license a
 * capped number of seats (the Visit England shape — 10 LVEP seats) rather than having
 * Press Pilot provision every daughter manually via provisionNewOrg.
 *
 * Deliberately narrow compared to provisionNewOrg: the caller cannot choose a tier,
 * set partner/user limits, or pick a vertical — those stay under Press Pilot's control
 * so a licensed-seat deal can't be used to spin up unlimited or arbitrarily-tiered orgs.
 * The only inputs are the new org's name/slug and its first admin's name/email.
 *
 * Gating (all enforced server-side, never trusted from the request body):
 *   - Caller must be signed in and hold the 'Admin' role in their own org's `users`
 *     subcollection (derived from their auth token's orgId, mirroring the pattern in
 *     escalateSubmissionToParent/getOrgRollup).
 *   - The caller's own org must have `canProvisionChildOrgs: true` and a `maxChildOrgs`
 *     cap set — both fields are settable only via the super-admin EditOrgLimitsDialog.
 *   - Seat usage is counted as DIRECT children only (`orgs where parentOrgId == callerOrgId`),
 *     matching the "N of maxChildOrgs seats" language used throughout the product and the
 *     platform-admin Networks dashboard (step 4). This is a deliberate reading of "seat" as
 *     "daughter org directly under the licensed root" — a grandchild org several levels down
 *     does not consume its great-grandparent's cap, only its own direct parent's (if that
 *     parent is itself seat-capped).
 *   - Every self-provisioned child is always assigned the root's own `childOrgDefaultTier`
 *     (falls back to 'starter' if that field isn't set) — the caller cannot request a
 *     different tier.
 */
export const createChildOrg = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const parentOrgId = context.auth.token.orgId as string | undefined;
  if (!parentOrgId) {
    throw new functions.https.HttpsError('failed-precondition', 'No organisation found for this account.');
  }

  const { orgName, orgSlug, adminName, adminEmail } = data || {};
  if (!orgName || !orgSlug || !adminName || !adminEmail) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: orgName, orgSlug, adminName, adminEmail'
    );
  }
  if (!/^[a-z0-9-]+$/.test(orgSlug)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Slug must contain only lowercase letters, numbers, and hyphens.'
    );
  }

  // Confirm the caller is a real Admin of parentOrgId — not just holding a stale/spoofed
  // custom claim, and not merely any team member (creating an org + its login is more
  // privileged than the Editor-level actions other org-scoped callables allow).
  const callerSnap = await db.collection('orgs').doc(parentOrgId).collection('users').doc(context.auth.uid).get();
  if (!callerSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'You are not a member of this organisation.');
  }
  if (callerSnap.data()?.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only an organisation Admin can create a member organisation.');
  }

  const parentSnap = await db.collection('orgs').doc(parentOrgId).get();
  if (!parentSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Organisation not found.');
  }
  const parentData = parentSnap.data() || {};

  if (!parentData.canProvisionChildOrgs) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Self-service member-org creation is not enabled for this organisation. Contact Press Pilot to license daughter-org seats.'
    );
  }

  const maxChildOrgs = parentData.maxChildOrgs as number | undefined;
  if (!maxChildOrgs || maxChildOrgs <= 0) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'No seat cap is configured for this organisation yet. Contact Press Pilot to set up your licensed seat count.'
    );
  }

  // Seat usage = direct children only (see doc comment above for why).
  const directChildrenSnap = await db.collection('orgs').where('parentOrgId', '==', parentOrgId).get();
  if (directChildrenSnap.size >= maxChildOrgs) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `All ${maxChildOrgs} licensed seats are in use (${directChildrenSnap.size} of ${maxChildOrgs}). Contact Press Pilot to license more.`
    );
  }

  const existingSlug = await db.collection('orgs').where('slug', '==', orgSlug).limit(1).get();
  if (!existingSlug.empty) {
    throw new functions.https.HttpsError('already-exists', `An organisation with slug "${orgSlug}" already exists.`);
  }

  const childTier = (parentData.childOrgDefaultTier as string | undefined) || 'starter';
  const ancestorOrgIds = [...((parentData.ancestorOrgIds as string[] | undefined) || []), parentOrgId];
  const tempPassword = crypto.randomBytes(12).toString('base64').slice(0, 16);

  try {
    const orgRef = db.collection('orgs').doc(orgSlug);
    await orgRef.set({
      id: orgSlug,
      name: orgName,
      slug: orgSlug,
      boilerplate: '',
      brandToneNotes: '',
      vertical: parentData.vertical || 'dmo',
      pressContact: { name: '', email: '' },
      tier: childTier,
      parentOrgId,
      ancestorOrgIds,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      provisionedBy: context.auth.uid,
      provisionedViaSelfService: true,
    });

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: adminEmail,
        password: tempPassword,
        displayName: adminName,
      });
    } catch (err: any) {
      await orgRef.delete();
      if (err.code === 'auth/email-already-exists') {
        throw new functions.https.HttpsError('already-exists', 'A user with this email already exists.');
      }
      throw err;
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, { orgId: orgSlug });

    const initials = (adminName as string)
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    await orgRef.collection('users').doc(userRecord.uid).set({
      id: userRecord.uid,
      orgId: orgSlug,
      email: adminEmail,
      name: adminName,
      initials,
      role: 'Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
      `[createChildOrg] ${orgSlug} created under ${parentOrgId} by ${context.auth.uid} | tier=${childTier} | seats now ${directChildrenSnap.size + 1}/${maxChildOrgs}`
    );

    return {
      success: true,
      orgId: orgSlug,
      adminUserId: userRecord.uid,
      tempPassword,
      tier: childTier,
      seatsUsed: directChildrenSnap.size + 1,
      maxChildOrgs,
    };
  } catch (error: any) {
    console.error('[createChildOrg] failed:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to create member organisation: ${error.message}`);
  }
});
