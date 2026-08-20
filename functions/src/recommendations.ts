import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { stageNetworkContactRef } from './network-contact-refs';

const db = admin.firestore();

/**
 * Checks that the caller has the superAdmin custom claim.
 * Duplicated from super-admin.ts's requireSuperAdmin — same pattern used elsewhere
 * in this codebase (see media-taxonomy.ts, media-network.ts, credits.ts).
 */
function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (!context.auth.token?.superAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
  }
}

/**
 * Verifies the caller is a signed-in team member of `orgId` — same pattern duplicated
 * inline in billing.ts, child-org-provisioning.ts, story-escalation.ts, org-rollup.ts and
 * theme-trends.ts (no shared helper module exists in this codebase for this check).
 * Returns the caller's uid for convenience.
 */
async function requireTeamMember(context: functions.https.CallableContext, orgId: string): Promise<string> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerOrgId = context.auth.token.orgId as string | undefined;
  if (callerOrgId !== orgId) {
    throw new functions.https.HttpsError('permission-denied', 'You can only act on your own organisation.');
  }
  const callerSnap = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  if (!callerSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'You are not a member of this organisation.');
  }
  return context.auth.uid;
}

/** Writes a superadmin accountability-trail entry. Never fails the calling function.
 *  Duplicated from media-network.ts / credits.ts — same rationale (no cross-module dependency
 *  between admin feature files). */
async function writeAuditLog(entry: {
  action: string;
  actorUid: string;
  targetId?: string;
  orgId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.collection('auditLogs').add({
      ...entry,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[recommendations] Failed to write audit log:', err);
  }
}

// ============================================================================
// Scoring
// ============================================================================
// NOTE ON ASSUMPTIONS: the implementation plan specifies WHICH signals to rank on
// (editorial-focus match, geography, outlet type, recency of related coverage, and —
// for the org's own contacts — relationship history) but does not specify exact
// weights, a frequency-cap cooldown window, or match-band score cutoffs. The values
// below are a first, documented pass and are easy to retune later without touching
// the data model (nothing about these constants is persisted — every snapshot is
// regenerated from current data + current constants each time generateRecommendations
// runs, except previously-decided rows which are always left untouched).

/** How many days must pass since a contact was last contacted before they're eligible
 *  again ("frequency-capped" exclusion from the implementation plan). Not specified
 *  anywhere else in the spec docs — chosen as a reasonable default pending product input. */
const FREQUENCY_CAP_COOLDOWN_DAYS = 30;

/** Below this combined score, a candidate is excluded from the list entirely rather than
 *  shown as a weak "possible" match — this is the "low relevance" exclusion reason. */
const MIN_RECOMMENDATION_SCORE = 0.15;

const STRONG_MATCH_THRESHOLD = 0.7;
const GOOD_MATCH_THRESHOLD = 0.4;

/** Coverage published within this many days scores as fully "recent"; older coverage
 *  decays to a smaller bonus rather than dropping straight to zero. */
const RECENT_COVERAGE_FULL_CREDIT_DAYS = 90;
const RECENT_COVERAGE_PARTIAL_CREDIT_DAYS = 365;

const RELATIONSHIP_TIER_SCORE: Record<string, number> = {
  published: 0.15,
  responded: 0.12,
  pitched: 0.08,
  known: 0.04,
  unknown: 0,
};

function toMillis(value: any): number | undefined {
  if (!value) return undefined;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

function overlapRatio(target: string[] | undefined, candidate: string[] | undefined): number {
  const targetSet = new Set((target || []).filter(Boolean));
  if (targetSet.size === 0) return 0;
  const candidateSet = new Set((candidate || []).filter(Boolean));
  let hits = 0;
  for (const value of targetSet) {
    if (candidateSet.has(value)) hits++;
  }
  return hits / targetSet.size;
}

function overlapValues(target: string[] | undefined, candidate: string[] | undefined): string[] {
  const candidateSet = new Set((candidate || []).filter(Boolean));
  return (target || []).filter((v) => candidateSet.has(v));
}

function isFrequencyCapped(lastContactedAt: any): boolean {
  const ms = toMillis(lastContactedAt);
  if (!ms) return false;
  const cooldownMs = FREQUENCY_CAP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - ms < cooldownMs;
}

type StoryTags = { editorialFocus: string[]; geographies: string[]; topics: string[] };

function getStoryTags(release: FirebaseFirestore.DocumentData): StoryTags {
  const sd = release.smartDistribution || {};
  return {
    editorialFocus: sd.editorialFocus || [],
    geographies: sd.geographies || [],
    topics: sd.topics || [],
  };
}

type EligibilityResult =
  | { eligible: true }
  | {
      eligible: false;
      reason: 'suppressed' | 'inactive' | 'recently_contacted' | 'duplicate';
    };

function eligibilityForRecipient(recipient: FirebaseFirestore.DocumentData): EligibilityResult {
  if (recipient.doNotContact === true) return { eligible: false, reason: 'suppressed' };
  if (recipient.relationshipStatus === 'bounced' || recipient.relationshipStatus === 'opted_out') {
    return { eligible: false, reason: 'suppressed' };
  }
  if (isFrequencyCapped(recipient.lastContactedAt)) {
    return { eligible: false, reason: 'recently_contacted' };
  }
  return { eligible: true };
}

function eligibilityForNetworkContact(contact: FirebaseFirestore.DocumentData): EligibilityResult {
  if (contact.networkStatus !== 'active') return { eligible: false, reason: 'inactive' };
  const health = contact.contactHealth || {};
  if (health.suppressionStatus && health.suppressionStatus !== 'none') {
    return { eligible: false, reason: 'suppressed' };
  }
  if (health.verificationStatus === 'invalid') return { eligible: false, reason: 'inactive' };
  if (isFrequencyCapped(health.lastContactedAt)) {
    return { eligible: false, reason: 'recently_contacted' };
  }
  return { eligible: true };
}

function normaliseIdentity(name?: string, email?: string): string {
  return `${(name || '').trim().toLowerCase()}|${(email || '').trim().toLowerCase()}`;
}

function scoreCustomerContact(
  story: StoryTags,
  recipient: FirebaseFirestore.DocumentData
): { score: number; rationale: string; matchedFocus: string[]; matchedGeo: string[] } {
  const focusOverlap = overlapRatio(story.editorialFocus, recipient.editorialFocus);
  const geoOverlap = overlapRatio(story.geographies, recipient.geography);
  const topicOverlap = overlapRatio(story.topics, recipient.topics);
  const outletTypeBonus = recipient.outletType ? 0.05 : 0;
  const relationshipScore = RELATIONSHIP_TIER_SCORE[recipient.relationshipStatus as string] ?? 0;

  const score = focusOverlap * 0.4 + geoOverlap * 0.25 + topicOverlap * 0.15 + outletTypeBonus + relationshipScore;

  const matchedFocus = overlapValues(story.editorialFocus, recipient.editorialFocus);
  const matchedGeo = overlapValues(story.geographies, recipient.geography);

  const parts: string[] = [];
  if (matchedFocus.length) parts.push(`Editorial focus match: ${matchedFocus.join(', ')}`);
  if (matchedGeo.length) parts.push(`Geography match: ${matchedGeo.join(', ')}`);
  if (recipient.relationshipStatus && recipient.relationshipStatus !== 'unknown') {
    parts.push(`Relationship history: ${String(recipient.relationshipStatus)}`);
  }
  if (!parts.length) parts.push('Existing contact in your outlet list.');

  return { score: Math.min(score, 1), rationale: parts.join('. '), matchedFocus, matchedGeo };
}

function scoreNetworkContact(
  story: StoryTags,
  contact: FirebaseFirestore.DocumentData
): { score: number; rationale: string; matchedFocus: string[]; matchedGeo: string[]; matchedThemes: string[] } {
  const focusOverlap = overlapRatio(story.editorialFocus, contact.editorialFocus);
  const geoOverlap = overlapRatio(story.geographies, contact.geographies);
  const topicOverlap = overlapRatio(story.topics, contact.topics);
  const outletTypeBonus = contact.outlet?.type ? 0.05 : 0;

  const relevantThemes = new Set([...(story.topics || []), ...(story.editorialFocus || [])]);
  const coverage: Array<{ themes?: string[]; publishedAt?: any }> = contact.recentCoverage || [];
  let recencyScore = 0;
  const matchedThemes: string[] = [];
  for (const item of coverage) {
    const themeOverlap = (item.themes || []).filter((t) => relevantThemes.has(t));
    if (!themeOverlap.length) continue;
    const publishedMs = toMillis(item.publishedAt);
    if (!publishedMs) continue;
    const ageDays = (Date.now() - publishedMs) / (24 * 60 * 60 * 1000);
    let credit = 0;
    if (ageDays <= RECENT_COVERAGE_FULL_CREDIT_DAYS) credit = 0.15;
    else if (ageDays <= RECENT_COVERAGE_PARTIAL_CREDIT_DAYS) credit = 0.08;
    if (credit > recencyScore) recencyScore = credit;
    matchedThemes.push(...themeOverlap);
  }

  const score = focusOverlap * 0.4 + geoOverlap * 0.25 + topicOverlap * 0.15 + outletTypeBonus + recencyScore;

  const matchedFocus = overlapValues(story.editorialFocus, contact.editorialFocus);
  const matchedGeo = overlapValues(story.geographies, contact.geographies);

  const parts: string[] = [];
  if (matchedFocus.length) parts.push(`Editorial focus match: ${matchedFocus.join(', ')}`);
  if (matchedGeo.length) parts.push(`Geography match: ${matchedGeo.join(', ')}`);
  if (matchedThemes.length) parts.push(`Recently covered related themes: ${[...new Set(matchedThemes)].join(', ')}`);
  if (!parts.length) parts.push('Broad outlet-type fit for this story.');

  return { score: Math.min(score, 1), rationale: parts.join('. '), matchedFocus, matchedGeo, matchedThemes };
}

function matchBandFor(score: number): 'strong' | 'good' | 'possible' {
  if (score >= STRONG_MATCH_THRESHOLD) return 'strong';
  if (score >= GOOD_MATCH_THRESHOLD) return 'good';
  return 'possible';
}

function anonymisedLabelFor(contact: FirebaseFirestore.DocumentData): string {
  const focus = (contact.editorialFocus && contact.editorialFocus[0]) || 'Journalist';
  const location = contact.outlet?.location || 'Location unspecified';
  return `${focus} contact — ${location}`;
}

/** Maximum number of recommendation rows written per generation, so a large network
 *  or outlet list can't produce an unbounded write batch. */
const MAX_RECOMMENDATIONS = 50;

/**
 * Given an approved story, returns a deduplicated, ranked list of recommended contacts
 * drawing from the org's own eligible Recipient records and eligible Press Pilot-network
 * contacts, and writes the result to orgs/{orgId}/recommendationSnapshots. Team-member
 * gated (not superadmin-only) — any signed-in member of the org may generate
 * recommendations for their own org's stories.
 *
 * Regeneration behaviour: existing snapshots for this storyId still at decision:
 * 'pending' are deleted and replaced; snapshots already decided (included/not_relevant)
 * are left untouched so a customer's prior choice survives regeneration.
 */
export const generateRecommendations = functions.https.onCall(async (data, context) => {
  const { orgId, storyId } = (data || {}) as { orgId?: string; storyId?: string };
  if (!orgId || !storyId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and storyId are required.');
  }
  await requireTeamMember(context, orgId);

  const releaseRef = db.collection('orgs').doc(orgId).collection('releases').doc(storyId);
  const releaseSnap = await releaseRef.get();
  if (!releaseSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Story not found.');
  }
  const release = releaseSnap.data()!;

  // Approval is an optional, org-level review step (Professional plan and
  // above — see approvalWorkflowEnabled in Settings). Orgs that haven't
  // enabled it (every Starter-tier org included, since they can't enable it
  // at all) should still be able to generate recommendations — mirrors the
  // same gate in RecommendationList on the frontend.
  const orgSnap = await db.collection('orgs').doc(orgId).get();
  const approvalRequired = orgSnap.exists && orgSnap.data()?.approvalWorkflowEnabled === true;
  if (approvalRequired && release.approvalStatus !== 'approved') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Only an approved story can generate recommendations.'
    );
  }

  const story = getStoryTags(release);
  if (!story.editorialFocus.length && !story.geographies.length && !story.topics.length) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Tag this story with a Smart Distribution focus (editorial focus, geography, or topics) before generating recommendations.'
    );
  }

  // --- Org's own recipients across every outlet list ---
  const recipientsSnap = await db.collectionGroup('recipients').where('orgId', '==', orgId).get();
  const dedupeIdentities = new Set<string>();
  type Candidate = {
    source: 'customer_contact' | 'network_contact';
    recipientRef?: string;
    networkContactId?: string;
    displayName?: string;
    anonymisedLabel: string;
    outletCategory: string;
    editorialFocus: string[];
    geographies: string[];
    recentCoverageThemes: string[];
    rationale: string;
    matchScore: number;
    creditCost: 0 | 1;
  };
  const candidates: Candidate[] = [];

  for (const doc of recipientsSnap.docs) {
    const recipient = doc.data();
    const elig = eligibilityForRecipient(recipient);
    if (!elig.eligible) continue;
    dedupeIdentities.add(normaliseIdentity(recipient.name, recipient.email));
    const { score, rationale, matchedFocus, matchedGeo } = scoreCustomerContact(story, recipient);
    if (score < MIN_RECOMMENDATION_SCORE) continue;
    candidates.push({
      source: 'customer_contact',
      recipientRef: doc.ref.path,
      displayName: recipient.name,
      anonymisedLabel: recipient.name,
      outletCategory: recipient.outletType || 'unclassified',
      editorialFocus: matchedFocus,
      geographies: matchedGeo,
      recentCoverageThemes: [],
      rationale,
      matchScore: score,
      creditCost: 0,
    });
  }

  // --- Press Pilot media network ---
  // QA fix (H8): previously suspension was only enforced by disabling the checkbox in
  // the send dialog UI — nothing stopped this callable itself from still generating
  // (and letting a customer select) network-sourced recommendations for a suspended
  // org. Per spec, suspension only stops network recommendations/sends; the org's own
  // customer_contact candidates above are generated and scored completely unaffected —
  // simply skip this whole network section when suspended rather than reject the call.
  const walletSnap = await db.collection('orgs').doc(orgId).collection('creditWallet').doc('summary').get();
  const isSuspended = walletSnap.exists && walletSnap.data()?.smartDistributionSuspended === true;

  const networkSnap = isSuspended
    ? { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }
    : await db.collection('mediaNetworkContacts').where('networkStatus', '==', 'active').get();
  for (const doc of networkSnap.docs) {
    const contact = doc.data();
    const elig = eligibilityForNetworkContact(contact);
    if (!elig.eligible) continue;
    // Exclude a network contact if the org already has that same person as a named Recipient.
    if (dedupeIdentities.has(normaliseIdentity(contact.identity?.name, contact.identity?.email))) continue;
    const { score, rationale, matchedFocus, matchedGeo, matchedThemes } = scoreNetworkContact(story, contact);
    if (score < MIN_RECOMMENDATION_SCORE) continue;
    candidates.push({
      source: 'network_contact',
      networkContactId: doc.id,
      anonymisedLabel: anonymisedLabelFor(contact),
      outletCategory: contact.outlet?.type || 'unclassified',
      editorialFocus: matchedFocus,
      geographies: matchedGeo,
      recentCoverageThemes: [...new Set(matchedThemes)],
      rationale,
      matchScore: score,
      creditCost: 1,
    });
  }

  candidates.sort((a, b) => b.matchScore - a.matchScore);
  const ranked = candidates.slice(0, MAX_RECOMMENDATIONS);

  // Delete existing still-pending snapshots for this story; leave decided ones untouched.
  const existingSnap = await db
    .collection('orgs')
    .doc(orgId)
    .collection('recommendationSnapshots')
    .where('storyId', '==', storyId)
    .where('decision', '==', 'pending')
    .get();

  // QA fix (Medium): the previous code deleted every existing pending snapshot and
  // wrote every new one inside a single shared db.batch(). Firestore batches cap out
  // at 500 operations; a story with more than ~450 existing pending rows (each one
  // delete op) combined with the new writes below (each up to 2 ops, thanks to the
  // H1 stageNetworkContactRef companion write) would exceed that limit and throw,
  // failing the whole regeneration. Deletes are now chunked into their own batches
  // (well under the 500-op ceiling) and committed independently of the new-write
  // batch, so an arbitrarily large existing snapshot set can never blow the limit.
  const DELETE_BATCH_SIZE = 400;
  for (let i = 0; i < existingSnap.docs.length; i += DELETE_BATCH_SIZE) {
    const deleteBatch = db.batch();
    for (const doc of existingSnap.docs.slice(i, i + DELETE_BATCH_SIZE)) {
      deleteBatch.delete(doc.ref);
    }
    await deleteBatch.commit();
  }

  const batch = db.batch();

  const snapshotsCollection = db.collection('orgs').doc(orgId).collection('recommendationSnapshots');
  const now = admin.firestore.FieldValue.serverTimestamp();
  let strongCount = 0;
  let goodCount = 0;
  let possibleCount = 0;

  for (const candidate of ranked) {
    const band = matchBandFor(candidate.matchScore);
    if (band === 'strong') strongCount++;
    else if (band === 'good') goodCount++;
    else possibleCount++;

    const ref = snapshotsCollection.doc();
    batch.set(ref, {
      orgId,
      storyId,
      source: candidate.source,
      ...(candidate.recipientRef ? { recipientRef: candidate.recipientRef } : {}),
      // QA fix (H1): store only an opaque reference to the network contact, never
      // the real mediaNetworkContacts document ID, on this client-readable doc.
      // stageNetworkContactRef allocates the ref's ID synchronously and stages its
      // write onto this same `batch`, so both writes commit atomically together.
      ...(candidate.networkContactId
        ? { networkContactRef: stageNetworkContactRef(batch, orgId, candidate.networkContactId) }
        : {}),
      anonymisedLabel: candidate.anonymisedLabel,
      ...(candidate.displayName ? { displayName: candidate.displayName } : {}),
      outletCategory: candidate.outletCategory,
      editorialFocus: candidate.editorialFocus,
      geographies: candidate.geographies,
      recentCoverageThemes: candidate.recentCoverageThemes,
      rationale: candidate.rationale,
      matchBand: band,
      matchScore: candidate.matchScore,
      creditCost: candidate.creditCost,
      decision: 'pending',
      createdAt: now,
    });
  }

  await batch.commit();

  return {
    generated: ranked.length,
    strongCount,
    goodCount,
    possibleCount,
    deletedPrevious: existingSnap.size,
  };
});

/**
 * Sets a recommendation snapshot's decision (included / not_relevant). Team-member
 * gated. A callable is required because recommendationSnapshots is `allow write: if
 * false` for clients (see firestore.rules) — the snapshot is an audit trail of what a
 * customer was shown and chose, so it cannot be edited directly from the browser.
 */
export const recordRecommendationDecision = functions.https.onCall(async (data, context) => {
  const { orgId, storyId, snapshotId, decision } = (data || {}) as {
    orgId?: string;
    storyId?: string;
    snapshotId?: string;
    decision?: 'included' | 'not_relevant';
  };
  if (!orgId || !storyId || !snapshotId || !decision) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'orgId, storyId, snapshotId and decision are required.'
    );
  }
  if (decision !== 'included' && decision !== 'not_relevant') {
    throw new functions.https.HttpsError('invalid-argument', "decision must be 'included' or 'not_relevant'.");
  }
  const uid = await requireTeamMember(context, orgId);

  const ref = db.collection('orgs').doc(orgId).collection('recommendationSnapshots').doc(snapshotId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Recommendation not found.');
  }
  const snapshot = snap.data()!;
  if (snapshot.orgId !== orgId || snapshot.storyId !== storyId) {
    throw new functions.https.HttpsError('permission-denied', 'This recommendation does not belong to that story.');
  }

  await ref.update({
    decision,
    decidedAt: admin.firestore.FieldValue.serverTimestamp(),
    decidedBy: uid,
  });

  return { id: snapshotId, decision };
});

const EXCLUSION_REASON_LABELS = [
  'wrong_focus',
  'wrong_location',
  'duplicate',
  'recently_contacted',
  'suppressed',
  'inactive',
  'low_relevance',
] as const;
type ExclusionReason = (typeof EXCLUSION_REASON_LABELS)[number];

/**
 * Superadmin-only diagnostic: re-runs the eligibility/scoring pipeline for one specific
 * contact against one story and returns why it wasn't (or wouldn't be) recommended.
 * Reads raw network-contact identity (to run the same name+email duplicate check
 * generateRecommendations performs) so this call is audit-logged, same accountability
 * requirement as the other direct-identity-read callables in media-network.ts.
 */
export const explainRecommendationExclusion = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const { orgId, storyId, source, contactId } = (data || {}) as {
    orgId?: string;
    storyId?: string;
    source?: 'customer_contact' | 'network_contact';
    contactId?: string; // recipient doc path for customer_contact, mediaNetworkContacts id for network_contact
  };
  if (!orgId || !storyId || !source || !contactId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'orgId, storyId, source and contactId are required.'
    );
  }

  const releaseSnap = await db.collection('orgs').doc(orgId).collection('releases').doc(storyId).get();
  if (!releaseSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Story not found.');
  }
  const story = getStoryTags(releaseSnap.data()!);

  let reason: ExclusionReason | null = null;

  if (source === 'customer_contact') {
    const recipientSnap = await db.doc(contactId).get();
    if (!recipientSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Recipient not found.');
    }
    const recipient = recipientSnap.data()!;
    const elig = eligibilityForRecipient(recipient);
    if (!elig.eligible) {
      reason = elig.reason;
    } else {
      const { score, matchedFocus, matchedGeo } = scoreCustomerContact(story, recipient);
      if (score < MIN_RECOMMENDATION_SCORE) {
        reason = !matchedFocus.length && story.editorialFocus.length ? 'wrong_focus' : 'low_relevance';
        if (!matchedGeo.length && story.geographies.length && !matchedFocus.length) reason = 'wrong_location';
      }
    }
  } else {
    const contactSnap = await db.collection('mediaNetworkContacts').doc(contactId).get();
    if (!contactSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Network contact not found.');
    }
    const contact = contactSnap.data()!;

    await writeAuditLog({
      action: 'view_network_contact_identity_for_diagnostic',
      actorUid: context.auth!.uid,
      targetId: contactId,
      orgId,
      metadata: { storyId },
    });

    const elig = eligibilityForNetworkContact(contact);
    if (!elig.eligible) {
      reason = elig.reason;
    } else {
      // Duplicate check against this org's own recipients (same identity comparison
      // generateRecommendations uses).
      const recipientsSnap = await db.collectionGroup('recipients').where('orgId', '==', orgId).get();
      const isDuplicate = recipientsSnap.docs.some(
        (d) => normaliseIdentity(d.data().name, d.data().email) === normaliseIdentity(contact.identity?.name, contact.identity?.email)
      );
      if (isDuplicate) {
        reason = 'duplicate';
      } else {
        const { score, matchedFocus, matchedGeo } = scoreNetworkContact(story, contact);
        if (score < MIN_RECOMMENDATION_SCORE) {
          reason = !matchedFocus.length && story.editorialFocus.length ? 'wrong_focus' : 'low_relevance';
          if (!matchedGeo.length && story.geographies.length && !matchedFocus.length) reason = 'wrong_location';
        }
      }
    }
  }

  return { reason: reason ?? 'eligible' };
});
