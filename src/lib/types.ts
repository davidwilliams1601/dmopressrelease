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
  createdAt: Date | any;
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
  createdAt: Date | any; // Can be Date or Firestore Timestamp
  updatedAt?: Date | any; // Can be Date or Firestore Timestamp
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
    uploadedAt: Date | any;
  };
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approverId?: string;
  approverName?: string;
  approverEmail?: string;
  approvalRequestedAt?: Date | any;
  approvalRequestedById?: string;
  approvalRequestedByName?: string;
  approvalRequestedByEmail?: string;
  approvalResolvedAt?: Date | any;
  approvalNotes?: string;
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
  createdAt: Date | any;
  updatedAt?: Date | any;
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
  outletType?: OutletType;         // controlled taxonomy ID
  relationshipStatus?: RelationshipStatus;
  lastContactedAt?: Date | any;
  doNotContact?: boolean;
  source?: 'customer_provided';    // fixed value for this collection; distinguishes from network contacts in matching
  updatedAt?: Date | any;
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
  createdAt: Date | any;
  updatedAt?: Date | any;
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
  createdAt: Date | any;
  completedAt?: Date | any;
  error?: string;
  scheduledAt?: Date | any;
};

export type PartnerEmail = {
  id: string;
  orgId: string;
  subject: string;
  sentBy: string;
  sentAt: Date | any;
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
  createdAt: Date | any;
  expiresAt?: Date | any;
  maxUses?: number;
  useCount: number;
  status: 'active' | 'expired' | 'revoked';
  label?: string;
  sentTo?: string;
  sentAt?: Date | any;
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
  createdAt: Date | any;
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
    uploadedAt: Date | any;
  }>;
  status: 'submitted' | 'reviewed' | 'used' | 'archived';
  aiThemes?: string[];
  aiThemeAnalysis?: string;
  aiEditorialScore?: number;
  aiEditorialRationale?: string;
  aiContentType?: string;
  aiAnalyzedAt?: Date | any;
  createdAt: Date | any;
  updatedAt?: Date | any;
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
  escalatedAt?: Date | any;
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
  createdAt: Date | any;
  updatedAt?: Date | any;
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
  createdAt: Date | any;
  updatedAt?: Date | any;
};

export type EmailEvent = {
  id: string;
  orgId: string;
  releaseId: string;
  recipientEmail: string;
  eventType: 'delivered' | 'open' | 'click' | 'bounce' | 'spam_report' | 'unsubscribe';
  timestamp: Date | any;
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

/** Tracks a single superadmin upload of network contacts, for review-queue and upload history. */
export type MediaNetworkImportBatch = {
  id: string;
  fileName: string;
  sourceType: MediaNetworkContact['provenance']['sourceType'];
  sourceReference?: string;
  uploadedBy: string; // superadmin uid
  uploadedAt: Date | any;
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
 * `reversesTransactionId` is an additive field (not in the original spec doc) used
 * only by `type: 'reversal'` entries to link back to the transaction being reversed,
 * so the original stays untouched in history while the reversal is traceable.
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
  createdAt: Date | any;
  expiresAt?: Date | any;
  idempotencyKey: string;
};

/** Read-optimised cache of an organisation's current Smart Distribution credit balance. */
export type CreditWalletSummary = {
  balance: number;
  lastTransactionId?: string;
  smartDistributionSuspended: boolean;
  updatedAt: Date | any;
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
  createdAt: Date | any;
};
