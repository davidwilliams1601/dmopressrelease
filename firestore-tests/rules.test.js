/**
 * Firestore Security Rules test suite for the collections reviewed in the
 * 2026-08-20 Smart Distribution QA pass (M12: "No Firestore rules test suite exists
 * for any of the reviewed collections").
 *
 * Scope: the Smart Distribution / platform-level collections this QA review actually
 * covers — mediaNetworkContacts, mediaNetworkImportBatches, recommendationSnapshots,
 * auditLogs (M11's fix is the main regression this guards against), creditTransactions,
 * creditWallet, creditReservations, networkContactRefs, sendJobs (+ its recipients
 * subcollection), and platform/{docId} (M8's read path). Pre-existing, unrelated
 * collections (releases, outletLists, tags, submissions, etc.) are intentionally out of
 * scope for this pass — add rules.test blocks for them separately if they're revisited.
 *
 * Run with `npm run test:rules` from the repo root (wraps this in
 * `firebase emulators:exec --only firestore`, which is required — these tests talk to
 * the Firestore emulator, never a real project).
 */

const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, addDoc } = require('firebase/firestore');

const PROJECT_ID = 'smart-distribution-rules-test';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || 'localhost',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

/** Seeds fixture data with security rules disabled (equivalent to Admin SDK writes). */
async function seed(setupFn) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setupFn(context.firestore());
  });
}

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const TEAM_UID = 'team-member-a';
const OTHER_ORG_TEAM_UID = 'team-member-b';
const PARTNER_UID = 'partner-a';
const SUPERADMIN_UID = 'superadmin-1';
const OTHER_SUPERADMIN_UID = 'superadmin-2';
const RANDOM_UID = 'random-authed-user';

async function seedOrgMembers() {
  await seed(async (db) => {
    await setDoc(doc(db, 'orgs', ORG_A, 'users', TEAM_UID), {
      id: TEAM_UID,
      orgId: ORG_A,
      role: 'Admin',
    });
    await setDoc(doc(db, 'orgs', ORG_A, 'users', PARTNER_UID), {
      id: PARTNER_UID,
      orgId: ORG_A,
      role: 'Partner',
      partnerId: PARTNER_UID,
    });
    await setDoc(doc(db, 'orgs', ORG_B, 'users', OTHER_ORG_TEAM_UID), {
      id: OTHER_ORG_TEAM_UID,
      orgId: ORG_B,
      role: 'Admin',
    });
  });
}

function teamCtx() {
  return testEnv.authenticatedContext(TEAM_UID);
}
function otherOrgTeamCtx() {
  return testEnv.authenticatedContext(OTHER_ORG_TEAM_UID);
}
function partnerCtx() {
  return testEnv.authenticatedContext(PARTNER_UID);
}
function superAdminCtx(uid = SUPERADMIN_UID) {
  return testEnv.authenticatedContext(uid, { superAdmin: true });
}
function randomAuthedCtx() {
  return testEnv.authenticatedContext(RANDOM_UID);
}
function anonCtx() {
  return testEnv.unauthenticatedContext();
}

describe('/mediaNetworkContacts/{contactId} — platform-owned raw identity', () => {
  beforeEach(async () => {
    await seedOrgMembers();
    await seed(async (db) => {
      await setDoc(doc(db, 'mediaNetworkContacts', 'contact-1'), {
        identity: { name: 'Jane Doe', email: 'jane@example.com' },
      });
    });
  });

  test('superadmin can read', async () => {
    await assertSucceeds(getDoc(doc(superAdminCtx().firestore(), 'mediaNetworkContacts', 'contact-1')));
  });

  test('ordinary team member cannot read', async () => {
    await assertFails(getDoc(doc(teamCtx().firestore(), 'mediaNetworkContacts', 'contact-1')));
  });

  test('unauthenticated cannot read', async () => {
    await assertFails(getDoc(doc(anonCtx().firestore(), 'mediaNetworkContacts', 'contact-1')));
  });

  test('no client, including superadmin, can write (Cloud Function / Admin SDK only)', async () => {
    await assertFails(setDoc(doc(superAdminCtx().firestore(), 'mediaNetworkContacts', 'contact-2'), { identity: {} }));
  });
});

describe('/mediaNetworkImportBatches/{batchId} — superadmin review queue', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'mediaNetworkImportBatches', 'batch-1'), { status: 'pending_review' });
    });
  });

  test('superadmin can read', async () => {
    await assertSucceeds(getDoc(doc(superAdminCtx().firestore(), 'mediaNetworkImportBatches', 'batch-1')));
  });

  test('ordinary team member cannot read', async () => {
    await seedOrgMembers();
    await assertFails(getDoc(doc(teamCtx().firestore(), 'mediaNetworkImportBatches', 'batch-1')));
  });

  test('no client can write', async () => {
    await assertFails(updateDoc(doc(superAdminCtx().firestore(), 'mediaNetworkImportBatches', 'batch-1'), { status: 'published' }));
  });
});

describe('/orgs/{orgId}/recommendationSnapshots/{snapshotId} — per-org, team-only, read-only', () => {
  beforeEach(async () => {
    await seedOrgMembers();
    await seed(async (db) => {
      await setDoc(doc(db, 'orgs', ORG_A, 'recommendationSnapshots', 'snap-1'), {
        orgId: ORG_A,
        storyId: 'story-1',
        matchBand: 'strong',
        matchScore: 90,
        decision: 'pending',
      });
    });
  });

  test('a team member of the owning org can get', async () => {
    await assertSucceeds(getDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'recommendationSnapshots', 'snap-1')));
  });

  test('a team member of the owning org can list', async () => {
    await assertSucceeds(getDocs(collection(teamCtx().firestore(), 'orgs', ORG_A, 'recommendationSnapshots')));
  });

  test('a team member of a DIFFERENT org cannot read — no cross-org leakage', async () => {
    await assertFails(getDoc(doc(otherOrgTeamCtx().firestore(), 'orgs', ORG_A, 'recommendationSnapshots', 'snap-1')));
  });

  test('a partner (non-team-member) of the owning org cannot read', async () => {
    await assertFails(getDoc(doc(partnerCtx().firestore(), 'orgs', ORG_A, 'recommendationSnapshots', 'snap-1')));
  });

  test('a team member cannot edit a snapshot directly — decisions must go through the recordRecommendationDecision callable', async () => {
    await assertFails(
      updateDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'recommendationSnapshots', 'snap-1'), { decision: 'included' })
    );
  });
});

describe('/auditLogs/{actorUid}/entries/{logId} — M11 regression guard: own-trail only', () => {
  beforeEach(async () => {
    await seedOrgMembers();
    await seed(async (db) => {
      await setDoc(doc(db, 'auditLogs', SUPERADMIN_UID, 'entries', 'entry-1'), {
        action: 'credit_grant',
        actorUid: SUPERADMIN_UID,
      });
      await setDoc(doc(db, 'auditLogs', OTHER_SUPERADMIN_UID, 'entries', 'entry-2'), {
        action: 'credit_refund',
        actorUid: OTHER_SUPERADMIN_UID,
      });
    });
  });

  test('a superadmin can read their OWN entry', async () => {
    await assertSucceeds(getDoc(doc(superAdminCtx(SUPERADMIN_UID).firestore(), 'auditLogs', SUPERADMIN_UID, 'entries', 'entry-1')));
  });

  test('a superadmin can list their OWN entries', async () => {
    await assertSucceeds(getDocs(collection(superAdminCtx(SUPERADMIN_UID).firestore(), 'auditLogs', SUPERADMIN_UID, 'entries')));
  });

  test('THE BUG THIS GUARDS AGAINST (M11): a superadmin CANNOT read another superadmin\'s entry', async () => {
    await assertFails(getDoc(doc(superAdminCtx(SUPERADMIN_UID).firestore(), 'auditLogs', OTHER_SUPERADMIN_UID, 'entries', 'entry-2')));
  });

  test('THE BUG THIS GUARDS AGAINST (M11): a superadmin CANNOT list another superadmin\'s entries', async () => {
    await assertFails(getDocs(collection(superAdminCtx(SUPERADMIN_UID).firestore(), 'auditLogs', OTHER_SUPERADMIN_UID, 'entries')));
  });

  test('a non-superadmin team member cannot read even their own uid\'s trail path', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'auditLogs', TEAM_UID, 'entries', 'entry-3'), { action: 'noop', actorUid: TEAM_UID });
    });
    await assertFails(getDoc(doc(teamCtx().firestore(), 'auditLogs', TEAM_UID, 'entries', 'entry-3')));
  });

  test('no client, including superadmin, can write', async () => {
    await assertFails(
      addDoc(collection(superAdminCtx(SUPERADMIN_UID).firestore(), 'auditLogs', SUPERADMIN_UID, 'entries'), {
        action: 'forged',
        actorUid: SUPERADMIN_UID,
      })
    );
  });
});

describe('/orgs/{orgId}/creditTransactions/{transactionId} — immutable ledger', () => {
  beforeEach(async () => {
    await seedOrgMembers();
    await seed(async (db) => {
      await setDoc(doc(db, 'orgs', ORG_A, 'creditTransactions', 'tx-1'), {
        orgId: ORG_A,
        type: 'grant',
        quantity: 10,
        balanceAfter: 10,
      });
    });
  });

  test('a team member of the owning org can read', async () => {
    await assertSucceeds(getDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'creditTransactions', 'tx-1')));
  });

  test('a team member of a different org cannot read', async () => {
    await assertFails(getDoc(doc(otherOrgTeamCtx().firestore(), 'orgs', ORG_A, 'creditTransactions', 'tx-1')));
  });

  test('no client can write — even an org admin cannot edit a ledger row', async () => {
    await assertFails(updateDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'creditTransactions', 'tx-1'), { quantity: 999 }));
  });
});

describe('/orgs/{orgId}/creditWallet/{docId} — cached balance, read-only cache', () => {
  beforeEach(async () => {
    await seedOrgMembers();
    await seed(async (db) => {
      await setDoc(doc(db, 'orgs', ORG_A, 'creditWallet', 'summary'), { balance: 42 });
    });
  });

  test('a team member of the owning org can read', async () => {
    await assertSucceeds(getDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'creditWallet', 'summary')));
  });

  test('a team member of a different org cannot read', async () => {
    await assertFails(getDoc(doc(otherOrgTeamCtx().firestore(), 'orgs', ORG_A, 'creditWallet', 'summary')));
  });

  test('no client can write — a team member cannot self-grant credits by editing the cache', async () => {
    await assertFails(updateDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'creditWallet', 'summary'), { balance: 999999 }));
  });
});

describe('/orgs/{orgId}/creditReservations/{reservationId} — internal hold, no client access at all', () => {
  beforeEach(async () => {
    await seedOrgMembers();
    await seed(async (db) => {
      await setDoc(doc(db, 'orgs', ORG_A, 'creditReservations', 'res-1'), { status: 'held' });
    });
  });

  test('even a team member/admin of the owning org cannot read', async () => {
    await assertFails(getDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'creditReservations', 'res-1')));
  });

  test('even a team member/admin of the owning org cannot write', async () => {
    await assertFails(setDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'creditReservations', 'res-2'), { status: 'held' }));
  });
});

describe('/orgs/{orgId}/networkContactRefs/{refId} — opaque-reference indirection table, no client access at all', () => {
  beforeEach(async () => {
    await seedOrgMembers();
    await seed(async (db) => {
      await setDoc(doc(db, 'orgs', ORG_A, 'networkContactRefs', 'ref-1'), { realContactId: 'contact-1' });
    });
  });

  test('even a team member/admin of the owning org cannot read (would defeat the anonymisation indirection)', async () => {
    await assertFails(getDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'networkContactRefs', 'ref-1')));
  });

  test('even a team member/admin of the owning org cannot write', async () => {
    await assertFails(setDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'networkContactRefs', 'ref-2'), { realContactId: 'x' }));
  });
});

describe('/orgs/{orgId}/sendJobs/{sendJobId} — read-only, callable-created only (H2 regression guard)', () => {
  beforeEach(async () => {
    await seedOrgMembers();
    await seed(async (db) => {
      await setDoc(doc(db, 'orgs', ORG_A, 'sendJobs', 'job-1'), { orgId: ORG_A, status: 'scheduled' });
    });
  });

  test('a team member of the owning org can read', async () => {
    await assertSucceeds(getDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'sendJobs', 'job-1')));
  });

  test('a team member cannot create a send job directly — must go through createSendJob callable', async () => {
    await assertFails(setDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'sendJobs', 'job-2'), { orgId: ORG_A, status: 'scheduled' }));
  });

  test('a team member cannot update a send job directly — must go through cancelScheduledSend callable', async () => {
    await assertFails(updateDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'sendJobs', 'job-1'), { status: 'cancelled' }));
  });

  test('a team member cannot delete a send job directly', async () => {
    await assertFails(deleteDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'sendJobs', 'job-1')));
  });
});

describe('/orgs/{orgId}/sendJobs/{sendJobId}/recipients/{recipientId} — read-only per-recipient rows', () => {
  beforeEach(async () => {
    await seedOrgMembers();
    await seed(async (db) => {
      await setDoc(doc(db, 'orgs', ORG_A, 'sendJobs', 'job-1', 'recipients', 'rec-1'), {
        outletListId: 'list-1',
        deliveryStatus: 'pending',
      });
    });
  });

  test('a team member of the owning org can get', async () => {
    await assertSucceeds(getDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'sendJobs', 'job-1', 'recipients', 'rec-1')));
  });

  test('a team member of the owning org can list', async () => {
    await assertSucceeds(getDocs(collection(teamCtx().firestore(), 'orgs', ORG_A, 'sendJobs', 'job-1', 'recipients')));
  });

  test('a team member of a different org cannot read', async () => {
    await assertFails(getDoc(doc(otherOrgTeamCtx().firestore(), 'orgs', ORG_A, 'sendJobs', 'job-1', 'recipients', 'rec-1')));
  });

  test('no client can write', async () => {
    await assertFails(
      updateDoc(doc(teamCtx().firestore(), 'orgs', ORG_A, 'sendJobs', 'job-1', 'recipients', 'rec-1'), { deliveryStatus: 'delivered' })
    );
  });
});

describe('/platform/{docId} — platform-wide config, M8\'s read path', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'platform', 'config'), {
        mediaTaxonomy: { editorialFocus: ['Sustainability'] },
      });
    });
  });

  test('any signed-in user can read, even with no org membership at all', async () => {
    await assertSucceeds(getDoc(doc(randomAuthedCtx().firestore(), 'platform', 'config')));
  });

  test('an unauthenticated request cannot read', async () => {
    await assertFails(getDoc(doc(anonCtx().firestore(), 'platform', 'config')));
  });

  test('no client, including superadmin, can write directly — must go through the updateMediaTaxonomy callable', async () => {
    await assertFails(
      updateDoc(doc(superAdminCtx().firestore(), 'platform', 'config'), {
        mediaTaxonomy: { editorialFocus: ['Hacked'] },
      })
    );
  });
});
