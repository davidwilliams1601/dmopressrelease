import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { buildTranquilityDataset } from './demo-tranquility';
import { canonicalCoverageUrl } from './coverage-core';

const db = admin.firestore();

function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  if (!context.auth.token?.superAdmin) throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
}

/** Delete all documents in a collection reference (in batches of 400). */
async function deleteCollectionDocs(collRef: admin.firestore.CollectionReference) {
  const snap = await collRef.get();
  if (snap.empty) return;
  const batches: Promise<any>[] = [];
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    batches.push(batch.commit());
  }
  await Promise.all(batches);
}

/** Returns a Firestore Timestamp for N days ago. */
function daysAgo(n: number): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// Demo seed data
// ---------------------------------------------------------------------------
//
// Demo data is vertical-aware: writeDemoData() looks up the org's `vertical`
// field and picks the matching dataset below. Verticals without a bespoke
// dataset (charity, trade-body, publisher) fall back to the DMO/tourism
// dataset. The DMO dataset is the fictional destination "Tranquility"
// (see demo-tranquility.ts): no real places, businesses, outlets or inboxes.
// Add a new entry to DEMO_DATASETS to give another vertical its own content.

const DEMO_PARTNERS_EDUCATION = [
  { id: 'demo-edu-partner-1', name: 'Riverside Primary School', email: 'office@riversideprimary.sch.uk', category: 'Primary School' },
  { id: 'demo-edu-partner-2', name: 'Oakfield Secondary Academy', email: 'comms@oakfieldacademy.sch.uk', category: 'Secondary School' },
  { id: 'demo-edu-partner-3', name: 'Greenwood Sixth Form College', email: 'press@greenwoodsfc.ac.uk', category: 'Sixth Form / FE College' },
  { id: 'demo-edu-partner-4', name: 'Meadow View Special School', email: 'admin@meadowview.sch.uk', category: 'Special School' },
  { id: 'demo-edu-partner-5', name: 'Thameside Multi-Academy Trust', email: 'comms@thamesidemat.org.uk', category: 'Multi-Academy Trust' },
  { id: 'demo-edu-partner-6', name: "St Augustine's Independent School", email: 'office@staugustines.sch.uk', category: 'Independent School' },
  { id: 'demo-edu-partner-7', name: 'Little Explorers Nursery', email: 'hello@littleexplorersnursery.co.uk', category: 'Early Years / Nursery' },
  { id: 'demo-edu-partner-8', name: 'Northgate Community College', email: 'press@northgatecc.sch.uk', category: 'Secondary School' },
];

const DEMO_OUTLET_LISTS_EDUCATION = [
  {
    id: 'demo-edu-list-trade',
    name: 'Education Trade Press',
    description: 'National education trade titles covering schools, MATs and the wider sector.',
    recipients: [
      { id: 'demo-edu-r-1', name: 'Sam Fletcher', email: 's.fletcher@schoolsweek.co.uk', outlet: 'Schools Week', position: 'News Editor' },
      { id: 'demo-edu-r-2', name: 'Priya Anand', email: 'p.anand@tes.com', outlet: 'TES (Times Educational Supplement)', position: 'Reporter' },
      { id: 'demo-edu-r-3', name: 'Callum Ross', email: 'c.ross@feweek.co.uk', outlet: 'FE Week', position: 'Senior Reporter' },
      { id: 'demo-edu-r-4', name: 'Nina Okafor', email: 'n.okafor@sec-ed.co.uk', outlet: 'SecEd', position: 'Editor' },
    ],
  },
  {
    id: 'demo-edu-list-regional',
    name: 'Local & Regional Press',
    description: 'Regional newspapers and broadcast desks with dedicated education reporters.',
    recipients: [
      { id: 'demo-edu-r-5', name: 'Holly Bennett', email: 'h.bennett@localgazette.co.uk', outlet: 'Local Gazette', position: 'Education Reporter' },
      { id: 'demo-edu-r-6', name: 'Aaron Shaw', email: 'a.shaw@regionalecho.co.uk', outlet: 'Regional Echo', position: 'News Editor' },
      { id: 'demo-edu-r-7', name: 'Grace Lin', email: 'g.lin@bbc.co.uk', outlet: 'BBC Regional News', position: 'Reporter' },
    ],
  },
];

const DEMO_RELEASES_EDUCATION = [
  {
    id: 'demo-edu-release-1',
    headline: 'Thameside Trust Schools Celebrate Record GCSE Results',
    slug: 'thameside-trust-record-gcse-results',
    campaignType: 'Seasonal',
    targetMarket: 'UK',
    audience: 'Local Press',
    status: 'Sent',
    sends: 412, opens: 201, clicks: 58,
    createdAt: daysAgo(18),
    updatedAt: daysAgo(15),
    bodyCopy: `Schools across the Thameside Multi-Academy Trust are celebrating their best-ever set of GCSE results this summer, with the proportion of pupils achieving grade 4 and above in English and maths rising for the third consecutive year.

Oakfield Secondary Academy and Northgate Community College both reported significant gains, with Oakfield seeing 92% of Year 11 pupils achieve grade 4+ in English and maths — up from 84% last year. Staff credit a renewed focus on targeted small-group support and a trust-wide reading intervention programme rolled out over the past two academic years.

"These results reflect the hard work of our pupils and the dedication of every member of staff across our schools," said the Trust's Director of Education. "We are especially proud of the progress made by pupils who joined us below expected standards and have gone on to exceed them."

The Trust says it will use the results to inform its improvement plans for the coming year, with a particular focus on widening access to STEM subjects at GCSE and A Level.

About Thameside Multi-Academy Trust:
Thameside Multi-Academy Trust supports eight schools across the region. For media enquiries contact comms@thamesidemat.org.uk.`,
  },
  {
    id: 'demo-edu-release-2',
    headline: 'Riverside Primary Launches Reading Recovery Programme Backed by Local Businesses',
    slug: 'riverside-primary-reading-recovery-programme',
    campaignType: 'Product Launch',
    targetMarket: 'UK',
    audience: 'Parents & Families',
    status: 'Ready',
    approvalStatus: 'approved',
    sends: 0, opens: 0, clicks: 0,
    createdAt: daysAgo(6),
    updatedAt: daysAgo(2),
    bodyCopy: `Riverside Primary School has launched a new Reading Recovery programme aimed at supporting pupils who fell behind in early literacy, funded through a partnership with three local businesses.

The programme pairs specially trained teaching assistants with small groups of pupils for daily 20-minute sessions, using a structured phonics approach shown to accelerate reading progress. Early results from a pilot group of Year 2 pupils show an average of eight months' reading age gained over a single term.

"Every child deserves to leave primary school as a confident reader," said the school's headteacher. "This partnership means we can give extra support to the pupils who need it most, without taking resources away from the rest of the class."

The scheme is being funded for its first two years by local sponsors, with the school hoping to secure further funding to extend it trust-wide.`,
  },
  {
    id: 'demo-edu-release-3',
    headline: 'Meadow View Special School Rated Outstanding by Ofsted',
    slug: 'meadow-view-special-school-ofsted-outstanding',
    campaignType: 'Award',
    targetMarket: 'UK',
    audience: 'Education Sector',
    status: 'Sent',
    sends: 289, opens: 134, clicks: 41,
    createdAt: daysAgo(40),
    updatedAt: daysAgo(33),
    bodyCopy: `Meadow View Special School has been rated 'Outstanding' in every category by Ofsted following its latest inspection, with inspectors singling out the school's approach to pupil wellbeing and personalised learning plans for particular praise.

Inspectors noted that pupils "make exceptional progress from their starting points" and praised the school's close working relationships with families and outside specialists. The report also highlighted staff training and a calm, consistent approach to behaviour support as key strengths.

"This is a wonderful recognition of the whole school community's commitment to our pupils," said the headteacher. "Every judgement reflects the exceptional care and skill our staff bring to work every day."

The full inspection report is available on the Ofsted website.`,
  },
];

const DEMO_SUBMISSIONS_EDUCATION = [
  {
    id: 'demo-edu-sub-1',
    partnerId: 'demo-edu-partner-1',
    partnerName: 'Riverside Primary School',
    partnerEmail: 'office@riversideprimary.sch.uk',
    title: 'Riverside Pupils Raise £2,400 for Local Foodbank in Sponsored Winter Walk',
    bodyCopy: `Pupils across Riverside Primary School took part in a sponsored winter walk last week, raising an incredible £2,400 for the local foodbank.

Every class walked a mile around the school field in the cold, with many pupils and families choosing to dress up in festive jumpers for the occasion. The event was organised by the School Council, who wanted to do something to help local families over the winter months.

"We're so proud of how much the whole school got behind this," said the School Council's Year 6 representatives. "Knowing we've helped families in our own community feels really special."

The school will be presenting the donation to the foodbank in person next week. We'd love this to be included in any local community or fundraising coverage — happy to provide photos with parental consent already confirmed.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'submitted',
    subjectConsentConfirmed: true,
    subjectConsentText: 'I confirm that written parental/guardian consent has been obtained for every pupil named or pictured in this submission, in line with the school\u2019s safeguarding and data protection policy, and that this consent is held on file at the school.',
    createdAt: daysAgo(4),
  },
  {
    id: 'demo-edu-sub-2',
    partnerId: 'demo-edu-partner-2',
    partnerName: 'Oakfield Secondary Academy',
    partnerEmail: 'comms@oakfieldacademy.sch.uk',
    title: 'Year 11 Students Achieve Best-Ever GCSE Results',
    bodyCopy: `Oakfield Secondary Academy is celebrating its best-ever set of GCSE results, with 92% of Year 11 students achieving grade 4 or above in both English and maths.

The cohort's progress has been particularly strong among students who joined the academy below expected standards in Year 7, with the school's targeted small-group intervention programme credited as a key factor.

"This group of students have worked incredibly hard, and it's brilliant to see that reflected in their results," said the Head of Year 11. "We're really proud of every one of them."

Happy to share more detail on the intervention programme for any feature on school improvement or attainment.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'reviewed',
    reviewNotes: 'Strong attainment story — good fit for the trust-wide GCSE results release.',
    subjectConsentConfirmed: true,
    subjectConsentText: 'I confirm that written parental/guardian consent has been obtained for every pupil named or pictured in this submission, in line with the school\u2019s safeguarding and data protection policy, and that this consent is held on file at the school.',
    createdAt: daysAgo(9),
    updatedAt: daysAgo(7),
  },
  {
    id: 'demo-edu-sub-3',
    partnerId: 'demo-edu-partner-3',
    partnerName: 'Greenwood Sixth Form College',
    partnerEmail: 'press@greenwoodsfc.ac.uk',
    title: 'Greenwood Students Secure Record Number of Russell Group University Offers',
    bodyCopy: `Greenwood Sixth Form College has recorded its highest-ever number of Russell Group university offers this year, with students securing places to study subjects ranging from medicine to law and engineering.

The college's dedicated careers and higher education team has expanded its one-to-one support over the past two years, including mock interviews with local professionals and additional support for students applying to competitive courses.

"Seeing our students achieve offers at this level is a testament to their ambition and the support they've had from staff throughout their time here," said the college's Head of Careers.

Happy to arrange interviews with students and staff for any feature on higher education access or careers guidance.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'submitted',
    subjectConsentConfirmed: true,
    subjectConsentText: 'I confirm that written parental/guardian consent has been obtained for every pupil named or pictured in this submission, in line with the school\u2019s safeguarding and data protection policy, and that this consent is held on file at the school.',
    createdAt: daysAgo(2),
  },
  {
    id: 'demo-edu-sub-4',
    partnerId: 'demo-edu-partner-4',
    partnerName: 'Meadow View Special School',
    partnerEmail: 'admin@meadowview.sch.uk',
    title: 'Meadow View Pupils Shine at Regional Inclusive Sports Festival',
    bodyCopy: `Pupils from Meadow View Special School took part in the regional Inclusive Sports Festival last month, with the school's team bringing home medals in swimming, boccia and athletics.

The festival, which brings together special schools from across the region, gives pupils the chance to compete and take part in adapted sports events tailored to a range of needs and abilities. Staff say the event is one of the highlights of the school year.

"Watching our pupils take part with such enthusiasm and confidence is incredibly rewarding," said the school's PE lead. "Events like this are so important for building self-esteem alongside physical skills."

This story ties in well with our recent Ofsted 'Outstanding' rating and would be a nice addition to any inclusive education or SEND feature.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'used',
    usedInReleaseIds: ['demo-edu-release-3'],
    subjectConsentConfirmed: true,
    subjectConsentText: 'I confirm that written parental/guardian consent has been obtained for every pupil named or pictured in this submission, in line with the school\u2019s safeguarding and data protection policy, and that this consent is held on file at the school.',
    createdAt: daysAgo(30),
    updatedAt: daysAgo(25),
  },
];

type DemoRecipient = { id: string; name: string; email: string; outlet: string; position: string } & Record<string, unknown>;

type DemoDataset = {
  partners: Array<{ id: string; name: string; email: string; category: string }>;
  outletLists: Array<{ id: string; name: string; description: string; recipients: DemoRecipient[] }>;
  releases: Array<Record<string, unknown>>;
  submissions: Array<Record<string, unknown>>;
  /** Earned coverage records (orgs/{orgId}/coverage). */
  coverage?: Array<Record<string, unknown>>;
  /** Pre-built opportunity cards (orgs/{orgId}/mediaOpportunities). */
  opportunities?: Array<Record<string, unknown>>;
  opportunitySettings?: Record<string, unknown>;
  /** Org profile fields, applied only where the org has none of its own. */
  boilerplate?: string;
  pressContact?: { name: string; email: string; phone?: string };
  editorialPriorities?: string;
  creditBalance?: number;
  /** Completed send jobs with per-recipient rows. `__ORG__` in a recipientRef becomes `orgs/{orgId}`. */
  sendJobs?: Array<Record<string, unknown> & { id: string; recipients: Array<Record<string, unknown> & { id: string }> }>;
  /** Tracked email events (orgs/{orgId}/events). */
  events?: Array<Record<string, unknown> & { id: string }>;
  /** Logged follow-ups (orgs/{orgId}/releases/{releaseId}/followUps). */
  followUps?: Array<Record<string, unknown> & { id: string; releaseId: string }>;
};

/**
 * Vertical-aware demo datasets, built at call time so relative dates are fresh on
 * every seed or reset. Verticals not listed here fall back to 'dmo'.
 */
const DEMO_DATASETS: Record<string, () => DemoDataset> = {
  dmo: () => buildTranquilityDataset(Date.now()),
  education: () => ({
    partners: DEMO_PARTNERS_EDUCATION,
    outletLists: DEMO_OUTLET_LISTS_EDUCATION,
    releases: DEMO_RELEASES_EDUCATION,
    submissions: DEMO_SUBMISSIONS_EDUCATION,
  }),
};

function getDemoDataset(vertical: string | undefined): DemoDataset {
  return (DEMO_DATASETS[vertical ?? 'dmo'] ?? DEMO_DATASETS.dmo)();
}

// ---------------------------------------------------------------------------
// Cloud Functions
// ---------------------------------------------------------------------------

/**
 * Seed an organisation with realistic demo data.
 * Super-admin only. Safe to call on a freshly provisioned org.
 *
 * Input: { orgId: string }
 */
export const seedDemoData = functions
  .runWith({ timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);

    const { orgId } = data;
    if (!orgId) throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');

    const orgRef = db.collection('orgs').doc(orgId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) throw new functions.https.HttpsError('not-found', `Organisation ${orgId} not found.`);

    await writeDemoData(orgId);

    console.log(`[seedDemoData] Demo data seeded for org ${orgId} by ${context.auth!.uid}`);
    return { success: true };
  });

/**
 * Reset a demo organisation back to its pristine seeded state.
 * Deletes releases, outletLists (+ recipients), submissions, sendJobs, events, coverage,
 * opportunities, recommendations and seeded member businesses, then re-seeds with demo
 * data. Real users are preserved.
 *
 * Super-admin only.
 *
 * Input: { orgId: string }
 */
export const resetDemoOrg = functions
  .runWith({ timeoutSeconds: 180 })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);

    const { orgId } = data;
    if (!orgId) throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');

    const orgRef = db.collection('orgs').doc(orgId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) throw new functions.https.HttpsError('not-found', `Organisation ${orgId} not found.`);

    // 1. Delete content subcollections (preserve real users). Everything a demo can
    //    accumulate is wiped, including anything the live opportunity engine or a
    //    previous seed wrote, so a reset always returns to exactly the seeded state.
    const collectionsToWipe = [
      'releases',
      'submissions',
      'sendJobs',
      'events',
      'content',
      'coverage',
      'mediaOpportunities',
      'mediaOpportunityFeedback',
      'recommendationSnapshots',
      'networkContactRefs',
      'partnerEmails',
    ];
    // releases and sendJobs carry subcollections (followUps, counters, recipients),
    // which a plain collection delete would leave behind for the next seed to inherit.
    const recursive = new Set(['releases', 'sendJobs']);
    await Promise.all(
      collectionsToWipe.map((c) =>
        recursive.has(c) ? db.recursiveDelete(orgRef.collection(c)) : deleteCollectionDocs(orgRef.collection(c))
      )
    );

    // Old seeded member businesses (e.g. the retired Cornwall set). Real team members
    // and any partners invited by hand are left alone.
    const seededPartners = await orgRef.collection('users').where('role', '==', 'Partner').get();
    await Promise.all(
      seededPartners.docs.filter((d) => d.id.startsWith('demo-partner-')).map((d) => d.ref.delete())
    );

    // outletLists: delete recipients subcollection for each list first, then the list docs
    const listsSnap = await orgRef.collection('outletLists').get();
    await Promise.all(
      listsSnap.docs.map(async (listDoc) => {
        await deleteCollectionDocs(listDoc.ref.collection('recipients'));
        await listDoc.ref.delete();
      })
    );

    // 2. Re-seed
    await writeDemoData(orgId);

    console.log(`[resetDemoOrg] Org ${orgId} reset by ${context.auth!.uid}`);
    return { success: true };
  });

/** Write all demo data into an org, using the dataset matching its vertical. */
async function writeDemoData(orgId: string) {
  const orgRef = db.collection('orgs').doc(orgId);

  const orgDoc = await orgRef.get();
  const org = orgDoc.data() || {};
  const vertical = org.vertical as string | undefined;
  const dataset = getDemoDataset(vertical);

  // Mark the org as a demo. This is what keeps it isolated: no live opportunity
  // generation, no real network contacts in recommendations, simulated sends, and
  // its coverage is excluded from (and replaced by fixed figures in) peer benchmarks.
  const orgUpdate: Record<string, unknown> = {
    isDemo: true,
    demoSeededAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (dataset.boilerplate && !String(org.boilerplate || '').trim()) orgUpdate.boilerplate = dataset.boilerplate;
  if (dataset.pressContact && !String(org.pressContact?.email || '').trim()) orgUpdate.pressContact = dataset.pressContact;
  if (dataset.editorialPriorities && !String(org.editorialPriorities || '').trim()) {
    orgUpdate.editorialPriorities = dataset.editorialPriorities;
  }
  await orgRef.set(orgUpdate, { merge: true });

  // Partners (as user documents with role Partner)
  const partnerBatch = db.batch();
  for (const p of dataset.partners) {
    const initials = p.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    partnerBatch.set(orgRef.collection('users').doc(p.id), {
      id: p.id,
      orgId,
      email: p.email,
      name: p.name,
      initials,
      role: 'Partner',
      businessCategories: [p.category],
      createdAt: daysAgo(60),
    });
  }
  await partnerBatch.commit();

  // Releases
  const releaseBatch = db.batch();
  for (const r of dataset.releases) {
    releaseBatch.set(orgRef.collection('releases').doc(r.id as string), { ...r, orgId });
  }
  await releaseBatch.commit();

  // Outlet lists + recipients
  for (const list of dataset.outletLists) {
    const { recipients, ...listMeta } = list;
    await orgRef.collection('outletLists').doc(list.id).set({
      ...listMeta,
      orgId,
      recipientCount: recipients.length,
      createdAt: daysAgo(90),
    });
    const recipBatch = db.batch();
    for (const r of recipients) {
      recipBatch.set(
        orgRef.collection('outletLists').doc(list.id).collection('recipients').doc(r.id),
        { ...r, orgId, outletListId: list.id, createdAt: daysAgo(90) }
      );
    }
    await recipBatch.commit();
  }

  // Submissions
  const subBatch = db.batch();
  for (const s of dataset.submissions) {
    subBatch.set(orgRef.collection('submissions').doc(s.id as string), { ...s, orgId });
  }
  await subBatch.commit();

  // Coverage
  if (dataset.coverage?.length) {
    const covBatch = db.batch();
    for (const c of dataset.coverage) {
      const { id, ...rest } = c;
      covBatch.set(orgRef.collection('coverage').doc(id as string), {
        ...rest,
        orgId,
        canonicalUrl: c.url ? canonicalCoverageUrl(c.url as string) : null,
        createdById: 'demo-seed',
        createdByName: 'Demo data',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await covBatch.commit();
  }

  // Media opportunities + settings
  if (dataset.opportunitySettings) {
    await orgRef.collection('mediaOpportunitySettings').doc('config').set({
      ...dataset.opportunitySettings,
      orgId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: 'demo-seed',
    });
  }
  if (dataset.opportunities?.length) {
    const oppBatch = db.batch();
    for (const o of dataset.opportunities) {
      oppBatch.set(orgRef.collection('mediaOpportunities').doc(o.id as string), { ...o, orgId });
    }
    await oppBatch.commit();
  }

  // Send history with per-recipient engagement, tracked events and logged follow-ups
  const orgPath = `orgs/${orgId}`;
  const withOrg = (v: unknown) => (typeof v === 'string' ? v.replace('__ORG__', orgPath) : v);
  for (const job of dataset.sendJobs || []) {
    const { id, recipients, ...jobData } = job;
    const jobRef = orgRef.collection('sendJobs').doc(id);
    await jobRef.set({ ...jobData, orgId });
    const batch = db.batch();
    for (const r of recipients) {
      const { id: rid, ...row } = r;
      batch.set(jobRef.collection('recipients').doc(rid), {
        ...row,
        recipientRef: withOrg(row.recipientRef),
        orgId,
        sendJobId: id,
      });
    }
    await batch.commit();
  }
  if (dataset.events?.length) {
    for (let i = 0; i < dataset.events.length; i += 400) {
      const batch = db.batch();
      for (const e of dataset.events.slice(i, i + 400)) {
        batch.set(orgRef.collection('events').doc(e.id), { ...e, orgId });
      }
      await batch.commit();
    }
  }
  if (dataset.followUps?.length) {
    const batch = db.batch();
    for (const f of dataset.followUps) {
      const { id, ...rest } = f;
      batch.set(orgRef.collection('releases').doc(f.releaseId).collection('followUps').doc(id), {
        ...rest,
        recipientRef: withOrg(rest.recipientRef),
        orgId,
      });
    }
    await batch.commit();
  }

  // Display-only credit balance so the Smart Distribution step doesn't warn about
  // low credit mid-demo. Demo sends are simulated, so nothing is ever debited.
  if (typeof dataset.creditBalance === 'number') {
    await orgRef.collection('creditWallet').doc('summary').set(
      { balance: dataset.creditBalance, smartDistributionSuspended: false },
      { merge: true }
    );
  }
}
