export type Organization = {
  id: string;
  name: string;
  slug: string;
  boilerplate: string;
  brandToneNotes: string;
  createdAt?: any;
  pressContact?: {
    name: string;
    email: string;
  };
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
  status: 'Draft' | 'Ready' | 'Sent';
  createdAt: Date | any; // Can be Date or Firestore Timestamp
  updatedAt?: Date | any; // Can be Date or Firestore Timestamp
  sends?: number;
  opens?: number;
  clicks?: number;
  imageUrl?: string;
  imageStoragePath?: string;
  imageMetadata?: {
    fileName: string;
    size: number;
    mimeType: string;
    uploadedAt: Date | any;
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
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: Date | any;
  completedAt?: Date | any;
  error?: string;
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
  aiAnalyzedAt?: Date | any;
  createdAt: Date | any;
  updatedAt?: Date | any;
  reviewNotes?: string;
  usedInReleaseIds?: string[];
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
