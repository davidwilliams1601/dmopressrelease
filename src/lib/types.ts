import type { Timestamp } from 'firebase/firestore';

/**
 * QA fix (Low): every persisted timestamp field below used to be typed `Date | any`,
 * which removed compile-time protection at exactly the Firestore read/write boundary
 * (the `any` half accepted anything — a string, a number, undefined — with the compiler
 * silently allowing whatever the calling code did with it). Firestore reads genuinely
 * return a `Timestamp` object (not a `Date`) until something calls `.toDate()` on it, and
 * a fresh client-side write is a real `Date`, so `Date | Timestamp` is the honest type for
 * a field that may be read fresh off a snapshot or freshly constructed before being
 * written — not `any`. Use the `toDate()` helper in src/lib/utils.ts to normalise either
 * shape into a plain `Date` before calling Date-only methods like `.getTime()`.
 */
export type FirestoreTimestamp = Date | Timestamp;

export type VerticalId = 'dmo' | 'charity' | 'trade-body' | 'publisher' | 'education';

/** Curated UK region/nation options for Organization.region — see src/lib/regions.ts. */
export type RegionId =
  | 'north-east'
  | 'north-west'
  | 'yorkshire-humber'
  | 'east-midlands'
  | 'west-midlands'
  | 'east-of-england'
  | 'london'
  | 'south-east'
  | 'south-west'
  | 'scotland'
  | 'wales'
  | 'northern-ireland'
  | 'uk-wide';

export type SocialHandles = {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  linkedin?: string;
  tiktok?: string;
};

export type OrgBranding = {
  logoUrl?: string;
  logoStoragePath?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  boilerplate: string;
  brandToneNotes: string;
  createdAt?: any;
  vertical?: VerticalId;
  /** Free-text editorial priorities, set in Settings, injected into AI triage scoring. */
  editorialPriorities?: string;
  pressContact?: {
    name: string;
    email: string;
  };
  maxPartners?: number;
  maxSubmissionsPerPartner?: number;
  maxUsers?: number;
  tier?: 'starter' | 'professional' | 'organisation' | 'enterprise';
  approvalWorkflowEnabled?: boolean;
  contentTypes?: Array<{ name: string; description?: string }>;
  branding?: OrgBranding;

  // --- Federated tenants (members-of-members) ---
  /** Direct parent org, if this org is a daughter/member of a larger network. Absent/null = root org. */
  parentOrgId?: string | null;
  /** Denormalised full ancestor chain, root-first, so Firestore can query "all descendants of X" in one call. */
  ancestorOrgIds?: string[];
  /** Gates self-service "add a daughter org" capability for a root/parent org. Set only by Press Pilot. */
  canProvisionChildOrgs?: boolean;
  /** Seat cap on self-service daughter-org creation, e.g. 10 licensed LVEP seats. Set only by Press Pilot. */
  maxChildOrgs?: number;
  /** Tier auto-assigned to every self-provisioned daughter org. Set only by Press Pilot. */
  childOrgDefaultTier?: 'starter' | 'professional' | 'organisation';
  /** When an escalated submission is drafted into a release, whether to credit the source org (e.g. "Additional reporting from X"). Defaults to on. */
  showEscalationSourceCredit?: boolean;
  /**
   * UK region/nation the org operates in, from the curated list in src/lib/regions.ts
   * (RegionId) — enables regional trend/benchmarking products. Typed as `string` rather
   * than `RegionId` so pre-existing free-text values written before the list existed
   * still round-trip; all UI that sets this field should only offer the curated options.
   * Editable by the org's own Admin (self-service, like boilerplate/brandToneNotes) as
   * well as by Press Pilot via the Provision Org dialog at creation time.
   */
  region?: string;
  /** Manually-entered actual monthly Enterprise contract value in GBP, for network-root orgs whose real invoice differs from the sum of member tier prices. Set only by Press Pilot, via the super-admin "Edit Limits" dialog. Meaningful on network roots (canProvisionChildOrgs/parentOrgId-less orgs with members) — undefined/null elsewhere. */
  contractValueMonthly?: number | null;
};

/**
 * Private billing state, stored at orgs/{orgId}/billing/state (NOT on the public
 * org doc). Readable by the org's own team; written only by Cloud Functions.
 */
export type OrgBillingState = {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | 'incomplete';
  hasPaymentMethod?: boolean;
  trialEndsAt?: any;
  currentPeriodEnd?: any;
};

export type User = {
  id: string;
  name: string;
  email: string;
  initials: string;
  orgId: string;
  role: 'Admin' | 'User' | 'Partner';
  createdAt: FirestoreTimestamp;
  inviteId?: string;
  businessDescription?: string;
  businessCategories?: string[];
  avatarUrl?: string;
  avatarStoragePath?: string;
  socialHandles?: SocialHandles;
  notificationPrefs?: {
    partnerSubmissions: boolean;
    mediaRequests: boolean;
  };
};

export type Release = {
  id: string;
  orgId: string;
  campaignType: string;
  targetMarket: string;
  audience: 'Travel Trade' | 'Consumer' | 'Hybrid';
  headline: string;
  slug: string;
  bodyCopy?: string;
  status: 'Draft' | 'Ready' | 'Sent' | 'Scheduled';
  createdAt: FirestoreTimestamp; // Can be Date or Firestore Timestamp
  updatedAt?: FirestoreTimestamp; // Can be Date or Firestore Timestamp
  sends?: number;
  opens?: number;
  clicks?: number;
  pageViews?: number;
  imageUrl?: string;
  imageStoragePath?: string;
  imageMetadata?: {
    fileName: string;
    size: number;
    mimeType: string;
    uploadedAt: FirestoreTimestamp;
  };
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approverId?: string;
  approverName?: string;
  approverEmail?: string;
  approvalRequestedAt?: FirestoreTimestamp;
  approvalRequestedById?: string;
  approvalRequestedByName?: string;
  approvalRequestedByEmail?: string;
  approvalResolvedAt?: FirestoreTimestamp;
  approvalNotes?: string;

  // --- Smart Distribution additions (Phase 3; optional, additive) ---
  /** Controlled-taxonomy tags used to match this story against Recipient/MediaNetworkContact
   *  editorialFocus/geographies/topics when generating recommendations. Set via the release
   *  editor's "Smart Distribution focus" control (src/lib/media-taxonomy.ts DEFAULT_MEDIA_TAXONOMY). */
  smartDistribution?: {
    editorialFocus?: string[]; // controlled taxonomy IDs
    geographies?: string[]; // controlled taxonomy IDs
    topics?: string[]; // controlled taxonomy IDs
  };
};

export type EngagementStats = {
  releases: number;
  sends: number;
  opens: number;
  clicks: number;
  pageViews: number;
};

export type OutletList = {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  recipientCount?: number;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

export type OutletType =
  | 'trade'
  | 'local-news'
  | 'national-news'
  | 'newsletter'
  | 'podcast'
  | 'broadcast'
  | 'creator';

export type RelationshipStatus =
  | 'unknown'
  | 'known'
  | 'pitched'
  | 'responded'
  | 'published'
  | 'declined'
  | 'bounced'
  | 'opted_out';

export type Recipient = {
  id: string;
  orgId: string;
  outletListId: string;
  /** Always kept in sync with firstName + lastName ("${firstName} ${lastName}".trim()).
   *  Kept as the canonical display/personalisation field so every existing read site
   *  (sends, Cloud Functions matching/dedupe, exports) keeps working unchanged. */
  name: string;
  /** Added alongside `name` so the add/edit forms and CSV import (which offers separate
   *  first_name/last_name columns) can capture and edit each part individually.
   *  Optional because rows created before this field existed only have `name`. */
  firstName?: string;
  lastName?: string;
  email: string;
  outlet: string;
  position?: string;
  notes?: string;
  createdAt: FirestoreTimestamp;

  // --- Smart Distribution additions (all optional; existing rows remain valid) ---
  editorialFocus?: string[];       // controlled taxonomy IDs; import alias: "beat", "specialism", "sector"
  geography?: string[];            // controlled taxonomy IDs; import alias: "region", "area", "coverage area"
  topics?: string[];               // controlled taxonomy IDs
  outletType?: OutletType;         // controlled taxonomy ID
  relationshipStatus?: RelationshipStatus;
  lastContactedAt?: FirestoreTimestamp;
  doNotContact?: boolean;
  source?: 'customer_provided';    // fixed value for this collection; distinguishes from network contacts in matching
  updatedAt?: FirestoreTimestamp;
};

/**
 * A saved column-mapping profile for the CSV/XLSX import wizard, scoped to one
 * organisation, so a recurring export (e.g. a monthly CRM pull) maps automatically
 * on subsequent uploads.
 */
export type ImportMappingProfile = {
  id: string;
  orgId: string;
  name: string;
  mapping: Record<string, string>; // sourceHeader (normalised) -> target field key
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

/** Controlled taxonomy for media-contact matching, stored at /platform/config (mediaTaxonomy field). */
export type MediaTaxonomy = {
  editorialFocus: string[];
  geography: string[];
  outletType: string[];
  topics: string[];
};

export type SendJob = {
  id: string;
  orgId: string;
  releaseId: string;
  outletListIds: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'scheduled' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: FirestoreTimestamp;
  completedAt?: FirestoreTimestamp;
  error?: string;
  scheduledAt?: FirestoreTimestamp;

  // --- Smart Distribution additions (Phase 4; all optional, additive) ---
  /** Set by the client at creation: whether this send should also include the
   *  release's currently-`included` recommendationSnapshots. Absent/false on jobs
   *  created before Phase 4 or when the sender explicitly opted out for this send. */
  includeSmartDistributionRecommendations?: boolean;
  /** Server-computed once dispatch runs: how many Smart Distribution-sourced
   *  recipients (customer_contact or network_contact) were actually merged into this
   *  send, after the final eligibility/dedupe recheck. Convenience read for the UI so
   *  it doesn't need to read the whole `recipients` subcollection just to show a count. */
  smartDistributionRecipientCount?: number;
  /** Server-computed: Smart Distribution credits actually debited for this send
   *  (one per accepted network-contact delivery). */
  smartDistributionCreditsUsed?: number;
};

export type PartnerEmail = {
  id: string;
  orgId: string;
  subject: string;
  sentBy: string;
  sentAt: FirestoreTimestamp;
  recipientCount: number;
  sentCount: number;
  opens: number;
  clicks: number;
  recipients: Array<{ id: string; name: string; email: string }>;
};

export type PartnerInvite = {
  id: string;
  orgId: string;
  code: string;
  createdBy: string;
  createdAt: FirestoreTimestamp;
  expiresAt?: FirestoreTimestamp;
  maxUses?: number;
  useCount: number;
  status: 'active' | 'expired' | 'revoked';
  label?: string;
  sentTo?: string;
  sentAt?: FirestoreTimestamp;
  sentBy?: string;
  sentNote?: string | null;
  sendCount?: number;
};

export type Tag = {
  id: string;
  orgId: string;
  name: string;
  color?: string;
  createdBy: string;
  createdAt: FirestoreTimestamp;
};

export type PartnerSubmission = {
  id: string;
  orgId: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  title: string;
  bodyCopy: string;
  tagIds: string[];
  imageUrls: string[];
  imageStoragePaths: string[];
  imageMetadata: Array<{
    fileName: string;
    size: number;
    mimeType: string;
    uploadedAt: FirestoreTimestamp;
  }>;
  status: 'submitted' | 'reviewed' | 'used' | 'archived';
  aiThemes?: string[];
  aiThemeAnalysis?: string;
  aiEditorialScore?: number;
  aiEditorialRationale?: string;
  aiContentType?: string;
  aiAnalyzedAt?: FirestoreTimestamp;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  reviewNotes?: string;
  usedInReleaseIds?: string[];
  partnerSocialHandles?: SocialHandles;
  /** Per-submission subject consent (e.g. parental/guardian consent for a named or pictured minor), captured when the org's vertical requires it. Null when the vertical has no such requirement. */
  subjectConsentConfirmed?: boolean | null;
  /** Snapshot of the consent wording shown to the submitter at time of submission, for audit purposes. */
  subjectConsentText?: string | null;

  // --- Story escalation (federated tenants) ---
  /** Set on an escalated COPY living in the parent org's submissions: the daughter org this story originated from. */
  sourceOrgId?: string;
  /** Set on an escalated COPY: id of the original submission doc in the daughter org, for traceability. */
  sourceSubmissionId?: string;
  /** Set on an escalated COPY: snapshot of the daughter org's display name at the time of escalation. */
  sourceOrgName?: string;
  /** Set on the ORIGINAL submission once a team member pushes it up to the parent org. */
  escalatedAt?: FirestoreTimestamp;
  /** Set on the ORIGINAL submission: which parent org it was escalated to. */
  escalatedToOrgId?: string;
  /** Set on the ORIGINAL submission: id of the copy created in the parent org's submissions, for traceability. */
  escalatedToSubmissionId?: string;
};

export type MediaRequest = {
  id: string;
  orgId: string;
  name: string;
  email: string;
  outlet: string;
  topic: string;
  destinations?: string;
  deadline?: string;
  additionalInfo?: string;
  status: 'new' | 'in-progress' | 'completed' | 'archived';
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

export type WebContent = {
  id: string;
  orgId: string;
  title: string;
  metaDescription: string;
  introParagraph: string;
  sections: Array<{ heading: string; body: string }>;
  contentType: string;
  targetMarket?: string;
  status: 'Draft' | 'Ready' | 'Published';
  sourceSubmissionIds: string[];
  sourceReleaseId?: string;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

export type EmailEvent = {
  id: string;
  orgId: string;
  releaseId: string;
  recipientEmail: string;
  eventType: 'delivered' | 'open' | 'click' | 'bounce' | 'spam_report' | 'unsubscribe';
  timestamp: FirestoreTimestamp;
  metadata?: {
    url?: string;
    userAgent?: string;
    ip?: string;
    reason?: string;
  };
};

// ============================================================================
// Smart Distribution — Phase 2: Press Pilot media network (platform-owned)
// See docs/smart-distribution/data-model-and-security.md §3.
// ============================================================================

/**
 * A single contact in Press Pilot's own media network. Platform-owned, never
 * tenant-scoped. `identity` must NEVER be returned to an org-facing client read —
 * only superadmin console callables may read it directly (and must audit-log the
 * read, see AuditLogEntry below). Org clients only ever see this data anonymised,
 * via a Phase 3 recommendationSnapshot.
 */
export type MediaNetworkContact = {
  id: string;
  identity: {
    name: string;
    email: string;
    role?: string;
    profileUrl?: string;
  };
  outlet: {
    name: string;
    type: string; // controlled taxonomy ID — same list as Recipient.outletType
    location?: string;
    audienceScope?: 'local' | 'regional' | 'national' | 'international';
  };
  editorialFocus: string[]; // controlled taxonomy IDs
  geographies: string[]; // controlled taxonomy IDs
  topics: string[]; // controlled taxonomy IDs
  recentCoverage: {
    title: string;
    url: string;
    publishedAt: FirestoreTimestamp;
    themes: string[];
  }[];
  provenance: {
    sourceType: 'press_pilot_research' | 'licensed' | 'partner_provided' | 'public_research' | 'other';
    sourceReference?: string;
    collectedAt: FirestoreTimestamp;
    lawfulUseNotes?: string;
    rightsReviewStatus: 'pending' | 'approved' | 'rejected';
    importBatchId?: string;
  };
  contactHealth: {
    verificationStatus: 'unverified' | 'verified' | 'invalid';
    verifiedAt?: FirestoreTimestamp;
    lastContactedAt?: FirestoreTimestamp;
    bounceCount: number;
    suppressionStatus: 'none' | 'suppressed' | 'opted_out';
  };
  networkStatus: 'active' | 'review' | 'suppressed' | 'archived';
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

/** Tracks a single superadmin upload of network contacts, for review-queue and upload history. */
export type MediaNetworkImportBatch = {
  id: string;
  fileName: string;
  sourceType: MediaNetworkContact['provenance']['sourceType'];
  sourceReference?: string;
  uploadedBy: string; // superadmin uid
  uploadedAt: FirestoreTimestamp;
  totalRows: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  suppressedCount: number;
  status: 'processing' | 'review' | 'published' | 'failed';
};

// ============================================================================
// Smart Distribution — Phase 2: Credit ledger & wallet
// See docs/smart-distribution/import-wizard-and-credits.md §4.
// ============================================================================

/**
 * One immutable, append-only entry in an organisation's Smart Distribution credit
 * ledger. Balances are always derived from this collection — never edited in place.
 * `reversesTransactionId` is an additive field (not in the original spec doc) used by
 * `type: 'reversal'` entries to link back to the transaction being reversed, so the
 * original stays untouched in history while the reversal is traceable. Phase 4 reuses
 * this same field on `type: 'refund'` entries created by an automatic hard-bounce /
 * delivery-failure refund, to link precisely back to the specific `usage` transaction
 * being refunded (in addition to sharing the same `campaignId`).
 */
export type CreditTransaction = {
  id: string;
  orgId: string;
  type:
    | 'purchase'
    | 'included_allowance'
    | 'grant'
    | 'adjustment'
    | 'usage'
    | 'refund'
    | 'expiry'
    | 'reversal'
    | 'migration';
  quantity: number; // positive or negative
  balanceAfter: number;
  reasonCode: string;
  reasonNote?: string;
  campaignId?: string; // required for usage / refund
  reversesTransactionId?: string; // set only on type: 'reversal'
  createdBy: string; // 'system' or a superadmin uid
  createdAt: FirestoreTimestamp;
  expiresAt?: FirestoreTimestamp;
  idempotencyKey: string;
};

/** Read-optimised cache of an organisation's current Smart Distribution credit balance. */
export type CreditWalletSummary = {
  balance: number;
  lastTransactionId?: string;
  smartDistributionSuspended: boolean;
  updatedAt: FirestoreTimestamp;
};

/**
 * Records every superadmin action that reads raw Press Pilot media-network contact
 * identity (name/email/profileUrl) directly, or performs a credit-ledger mutation.
 * Written by Cloud Functions only; readable by superadmins for their own accountability
 * trail. Not tenant-scoped — this is a platform-level control, not an org-facing feature.
 */
export type AuditLogEntry = {
  id: string;
  action:
    | 'view_network_contact_identity'
    | 'view_network_batch_identities'
    | 'view_network_contact_identity_for_diagnostic'
    | 'credit_grant'
    | 'credit_purchase'
    | 'credit_refund'
    | 'credit_adjustment'
    | 'credit_reversal'
    | 'suspend_smart_distribution';
  actorUid: string;
  targetId?: string; // contactId, batchId, orgId, or transactionId depending on action
  orgId?: string; // set for credit actions
  metadata?: Record<string, unknown>;
  createdAt: FirestoreTimestamp;
};

// ============================================================================
// Smart Distribution — Phase 3: Matching & recommendation snapshots
// See docs/smart-distribution/implementation-plan.md lines 49-77.
// ============================================================================

export type RecommendationMatchBand = 'strong' | 'good' | 'possible';

/**
 * One row of a combined, ranked recommendation list generated for an approved story.
 * Never contains a name/email/profileUrl for `source: 'network_contact'` rows — this is
 * enforced structurally by this type having no identity fields at all, not just by
 * convention. Written only by the `generateRecommendations` Cloud Function; the
 * `decision` field is updated only by `recordRecommendationDecision`. See
 * docs/smart-distribution/data-model-and-security.md for the Firestore rules (team
 * members: get/list only; all writes are Cloud-Function-only).
 */
export type RecommendationSnapshot = {
  id: string;
  orgId: string;
  storyId: string; // = Release.id
  source: 'customer_contact' | 'network_contact';
  /** Set only when source === 'customer_contact'. Path: orgs/{orgId}/outletLists/{listId}/recipients/{id}. */
  recipientRef?: string;
  /** Set only when source === 'network_contact'. QA fix (H1): this is now an opaque
   *  reference into the server-only orgs/{orgId}/networkContactRefs collection
   *  (functions/src/network-contact-refs.ts) — NOT the real mediaNetworkContacts/{id}.
   *  This doc is team-member readable, so the raw ID must never be stored here;
   *  only Cloud Functions resolve this reference back to the real ID when needed. */
  networkContactRef?: string;
  /** e.g. "Regional lifestyle journalist — South West England". Always set for network_contact rows. */
  anonymisedLabel: string;
  /** Real name — set only for source === 'customer_contact' (the org already owns this contact). */
  displayName?: string;
  outletCategory: string; // outlet type taxonomy id
  editorialFocus: string[];
  geographies: string[];
  recentCoverageThemes: string[];
  rationale: string;
  matchBand: RecommendationMatchBand;
  matchScore: number;
  creditCost: 0 | 1;
  decision: 'pending' | 'included' | 'not_relevant';
  decidedAt?: FirestoreTimestamp;
  decidedBy?: string; // uid
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

// ============================================================================
// Smart Distribution — Phase 4: controlled distribution & credit debit
// See docs/smart-distribution/data-model-and-security.md §4 and
// docs/smart-distribution/implementation-plan.md lines 79-93.
// ============================================================================

/**
 * Per-recipient delivery + credit-cost record for a send job, extending the existing
 * `sendJobs` collection. Written only by Cloud Functions (the dispatch loop in
 * `executeSendJob` creates the row before attempting delivery; the SendGrid webhook
 * updates `deliveryStatus` and, for a hard bounce / delivery failure on a
 * `smart_distribution_recommendation` row, triggers the auto-refund). One row exists
 * for every recipient of a send job — both plain outlet-list recipients and any
 * `recommendationSnapshot` merged in because its decision was `included` — so the
 * collection is a complete per-send audit trail, not a Smart-Distribution-only one.
 *
 * `source` distinguishes cost, not identity type: `'customer_contact'` covers any
 * recipient that is the org's own contact (whether drawn directly from a selected
 * outlet list, or from an included recommendation whose `RecommendationSnapshot.source
 * === 'customer_contact'`) and always costs 0 credits. `'smart_distribution_recommendation'`
 * covers only an included recommendation whose `RecommendationSnapshot.source ===
 * 'network_contact'` and is the only case that ever debits a credit.
 *
 * `refundTransactionId` is additive (not in the original spec doc, same convention as
 * `CreditTransaction.reversesTransactionId`) — set once an automatic refund has been
 * issued for this row, so the UI/webhook can tell at a glance a refund already happened
 * and never issue a second one for the same row (the ledger's own idempotency key is
 * the actual safety net; this field is just a fast, denormalised read).
 */
export type SendJobRecipient = {
  id: string;
  orgId: string;
  sendJobId: string;
  source: 'customer_contact' | 'smart_distribution_recommendation';
  /** Set when source === 'customer_contact'. Path: orgs/{orgId}/outletLists/{listId}/recipients/{id}. */
  recipientRef?: string;
  /** Set only when source === 'smart_distribution_recommendation'. QA fix (H1): this
   *  field previously held the real mediaNetworkContacts document ID and the comment
   *  here incorrectly claimed it was "never exposed to a non-superadmin client read" —
   *  in fact this row IS team-member readable (see firestore.rules), so that was a raw
   *  anonymity leak. It now holds only an opaque reference into the server-only
   *  orgs/{orgId}/networkContactRefs collection (functions/src/network-contact-refs.ts);
   *  the UI never needs the real ID because the identity itself is never shown to the org. */
  networkContactRef?: string;
  /** Set whenever this row's inclusion is attributable to a recommendation the
   *  customer explicitly included (both source types can have one). Absent for a
   *  "plain" outlet-list recipient with no matching recommendation. */
  recommendationSnapshotId?: string;
  /** Set once a credit has been debited (source === 'smart_distribution_recommendation'
   *  only, and only after Press Pilot's delivery layer accepted the message). */
  creditTransactionId?: string;
  /** Set once an automatic refund has been issued for this row (see field doc above). */
  refundTransactionId?: string;
  deliveryStatus: 'pending' | 'delivered' | 'bounced_hard' | 'bounced_soft' | 'suppressed' | 'failed';
  /** Set when deliveryStatus is 'suppressed' or 'failed' before an actual send attempt
   *  (e.g. failed the final pre-send eligibility/dedupe recheck, or the org's credit
   *  balance was insufficient at the moment this recipient's turn came up). */
  skipReason?: string;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};
