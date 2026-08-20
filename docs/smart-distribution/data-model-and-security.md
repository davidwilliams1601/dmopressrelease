# Data Model & Security Rules Plan

## 1. Design principle

Enforcement lives at the **database/security-rule level**, not just in the UI. A customer
client must be structurally unable to read raw Press Pilot-network contact identities, no
matter what the front end does.

Three data layers, matching the earlier product decision:

| Layer | Firestore location | Who can read raw records |
|---|---|---|
| Organisation contacts (customer-owned) | `orgs/{orgId}/outletLists/{outletListId}/recipients/{recipientId}` (existing, extended) | That organisation's team members only |
| Press Pilot media network | `mediaNetworkContacts/{contactId}` (new, top-level, platform-owned) | Superadmins only. Never returned to org clients. |
| Recommendation snapshot (what a customer was actually shown) | `orgs/{orgId}/recommendationSnapshots/{snapshotId}` | That organisation's team members. Contains anonymised fields only — no name/email. |

## 2. Extending the existing customer contact model

Rather than introduce a parallel "customer media contact" collection, extend the existing
`Recipient` type (`src/lib/types.ts`) with optional fields. This keeps outlet lists working
exactly as they do today and gives Smart Distribution the fields it needs to match on.

```ts
// src/lib/types.ts — additive, backward-compatible changes to the existing Recipient type
export type Recipient = {
  id: string;
  orgId: string;
  outletListId: string;
  name: string;
  email: string;
  outlet: string;
  position?: string;
  notes?: string;
  createdAt: Date | any;

  // --- Smart Distribution additions (all optional; existing rows remain valid) ---
  editorialFocus?: string[];       // controlled taxonomy IDs; import alias: "beat", "specialism", "sector"
  geography?: string[];            // controlled taxonomy IDs; import alias: "region", "area", "coverage area"
  topics?: string[];               // controlled taxonomy IDs
  outletType?: string;             // controlled taxonomy ID: trade | local-news | national-news | newsletter | podcast | broadcast | creator
  relationshipStatus?: 'unknown' | 'known' | 'pitched' | 'responded' | 'published' | 'declined' | 'bounced' | 'opted_out';
  lastContactedAt?: Date | any;
  doNotContact?: boolean;
  source?: 'customer_provided';    // fixed value for this collection; distinguishes from network contacts in matching logic
  updatedAt?: Date | any;
};
```

No security-rule change is required for this collection beyond what already exists at
`orgs/{orgId}/outletLists/{outletListId}/recipients/{recipientId}` — the new fields are
additive and covered by the current `isOrgMember`/`isTeamMember` checks.

## 3. New collection: Press Pilot media network (platform-owned)

```ts
// src/lib/types.ts — new type
export type MediaNetworkContact = {
  id: string;
  identity: {
    name: string;
    email: string;
    role?: string;
    profileUrl?: string;
  };                                    // NEVER returned to org-facing APIs or client reads
  outlet: {
    name: string;
    type: string;                       // controlled taxonomy ID, same list as Recipient.outletType
    location?: string;
    audienceScope?: 'local' | 'regional' | 'national' | 'international';
  };
  editorialFocus: string[];             // controlled taxonomy IDs
  geographies: string[];                // controlled taxonomy IDs
  topics: string[];                     // controlled taxonomy IDs
  recentCoverage: {
    title: string;
    url: string;
    publishedAt: Date | any;
    themes: string[];
  }[];
  provenance: {
    sourceType: 'press_pilot_research' | 'licensed' | 'partner_provided' | 'public_research' | 'other';
    sourceReference?: string;
    collectedAt: Date | any;
    lawfulUseNotes?: string;
    rightsReviewStatus: 'pending' | 'approved' | 'rejected';
    importBatchId?: string;
  };
  contactHealth: {
    verificationStatus: 'unverified' | 'verified' | 'invalid';
    verifiedAt?: Date | any;
    lastContactedAt?: Date | any;
    bounceCount: number;
    suppressionStatus: 'none' | 'suppressed' | 'opted_out';
  };
  networkStatus: 'active' | 'review' | 'suppressed' | 'archived';
  createdAt: Date | any;
  updatedAt?: Date | any;
};
```

Import batches are tracked separately so the superadmin console can show upload history and
review queues:

```ts
export type MediaNetworkImportBatch = {
  id: string;
  fileName: string;
  sourceType: MediaNetworkContact['provenance']['sourceType'];
  sourceReference?: string;
  uploadedBy: string;             // superadmin uid
  uploadedAt: Date | any;
  totalRows: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  suppressedCount: number;
  status: 'processing' | 'review' | 'published' | 'failed';
};
```

### Firestore rules addition

```js
// Append inside `match /databases/{database}/documents { ... }`, alongside the
// existing helper functions near the top of firestore.rules.

/**
 * Verifies the authenticated user carries the platform superAdmin custom claim.
 * Mirrors requireSuperAdmin() in functions/src/super-admin.ts.
 */
function isSuperAdmin() {
  return isSignedIn() && request.auth.token.superAdmin == true;
}

/**
 * @description Press Pilot's own media network. Platform-owned, never tenant-scoped.
 * @path /mediaNetworkContacts/{contactId}
 * @principle Raw identity is a Press Pilot asset, not a customer asset. Only superadmins
 *            (the admin console) may read these documents directly. Org-facing clients
 *            never query this collection — matching and anonymised recommendations are
 *            produced by a Cloud Function and written to recommendationSnapshots instead.
 *            All writes happen via Cloud Functions using the Admin SDK, which bypasses
 *            these rules entirely — so `allow write: if false` here is a defence-in-depth
 *            backstop, not the primary control.
 */
match /mediaNetworkContacts/{contactId} {
  allow read: if isSuperAdmin();
  allow write: if false;
}

match /mediaNetworkImportBatches/{batchId} {
  allow read: if isSuperAdmin();
  allow write: if false;
}

/**
 * @description Anonymised recommendations actually shown to an organisation for a story.
 * @path /orgs/{orgId}/recommendationSnapshots/{snapshotId}
 * @principle Contains only anonymised labels, rationale, match band, credit cost and the
 *            customer's accept/reject decision — never a name or email for network-sourced
 *            entries. Written by Cloud Functions only, so the snapshot (and therefore the
 *            audit trail of what a customer was shown and chose) cannot be edited client-side.
 */
match /orgs/{orgId}/recommendationSnapshots/{snapshotId} {
  allow get: if isTeamMember(orgId);
  allow list: if isTeamMember(orgId);
  allow write: if false;
}

/**
 * @description Immutable per-organisation Smart Distribution credit ledger.
 * @path /orgs/{orgId}/creditTransactions/{transactionId}
 * @principle Every balance change (purchase, allowance, grant, usage, refund, expiry,
 *            reversal) is an individual, append-only record. Balance is derived from this
 *            ledger, never edited directly. Cloud Function / Admin SDK writes only.
 */
match /orgs/{orgId}/creditTransactions/{transactionId} {
  allow get: if isTeamMember(orgId);
  allow list: if isTeamMember(orgId);
  allow write: if false;
}

/**
 * @description Cached current balance for an organisation's Smart Distribution wallet.
 * @path /orgs/{orgId}/creditWallet/summary
 * @principle A read-optimised cache derived from creditTransactions. Never the source of
 *            truth. Cloud Function / Admin SDK writes only.
 */
match /orgs/{orgId}/creditWallet/{docId} {
  allow get: if isTeamMember(orgId);
  allow write: if false;
}

/**
 * @description Controlled taxonomy for editorial focus, geography, outlet type and topics.
 * @path /platform/mediaTaxonomy
 * @principle Same access pattern as the existing platform/{docId} vertical/theme taxonomy —
 *            readable by any signed-in user (needed for import mapping suggestions and
 *            recommendation-card labels), writable only via Cloud Function / admin console.
 *            No new rule block is required: this fits inside the existing
 *            `match /platform/{docId}` rule already in the file.
 */
```

## 4. Recipient-level send record (extends existing `sendJobs`)

To know whether a given send used a customer contact or a network credit, add a subcollection
under the existing send job:

```ts
export type SendJobRecipient = {
  id: string;
  orgId: string;
  sendJobId: string;
  source: 'customer_contact' | 'smart_distribution_recommendation';
  recipientRef?: string;          // orgs/{orgId}/outletLists/{listId}/recipients/{id}, when source = customer_contact
  networkContactId?: string;      // mediaNetworkContacts/{id}, when source = smart_distribution_recommendation — server-side only, never sent to client reads that aren't superadmin
  recommendationSnapshotId?: string;
  creditTransactionId?: string;   // set once a credit has been debited
  deliveryStatus: 'pending' | 'delivered' | 'bounced_hard' | 'bounced_soft' | 'suppressed' | 'failed';
  createdAt: Date | any;
};
```

```js
/**
 * @description Per-recipient delivery + credit-cost record for a send job.
 * @path /orgs/{orgId}/sendJobs/{sendJobId}/recipients/{recipientId}
 * @principle Team members may read to see delivery/outcome status. The networkContactId
 *            field must never be exposed through client-facing reads of this collection in
 *            application code (enforce in the callable/API layer, not just here) — the rule
 *            below governs Firestore access, but the read-time projection used in the UI is
 *            what actually keeps identity hidden.
 */
match /orgs/{orgId}/sendJobs/{sendJobId}/recipients/{recipientId} {
  allow get: if isTeamMember(orgId);
  allow list: if isTeamMember(orgId);
  allow write: if false;
}
```

## 5. Why Cloud Functions own every write here

Every collection above is `allow write: if false` for clients. This is a deliberate, stricter
posture than the existing `orgs/{orgId}/releases` or `outletLists` rules (which allow team
members to write directly). Smart Distribution's integrity depends on:

- credits only ever changing through a ledger transaction (never a direct balance edit),
- a recommendation snapshot exactly reflecting what a Cloud Function actually computed and
  what the customer actually saw and chose,
- network identity never round-tripping through a client write.

All of these are naturally satisfied by routing every mutation through callable Cloud
Functions (which use the Admin SDK and therefore bypass these rules on the server side),
consistent with how `functions/src/super-admin.ts` already handles org provisioning and
billing-sensitive operations today.
