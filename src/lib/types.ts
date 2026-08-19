export type VerticalId = 'dmo' | 'charity' | 'trade-body' | 'publisher' | 'education';

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
  /** Structured geography, e.g. "Cornwall" or "South West England" — enables regional trend/benchmarking products. */
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
