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
