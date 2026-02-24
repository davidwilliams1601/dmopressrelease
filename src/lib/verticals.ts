import type { VerticalId } from '@/lib/types';

export type NavLabels = {
  releases: string;
  outlets: string;
  mediaRequests: string;
  submissions: string;
  content: string;
  partnerPortalTitle: string;
  partnersSettings: string;
};

export type AiContext = {
  orgTypeDescription: string;
  contentDomain: string;
  audienceOptions: string[];
  expertPersona: string;
  themeExamples: string;
  webContentStyle: string;
  webContentTypes: string[];
  suggestedContentTypeInstruction: string;
};

export type ConsentText = {
  contentUsage: string;
  marketing: string;
};

export type ProvisionText = {
  description: string;
};

export type VerticalConfig = {
  id: VerticalId;
  displayName: string;
  nav: NavLabels;
  ai: AiContext;
  consent: ConsentText;
  provision: ProvisionText;
};

export const VERTICALS: Record<VerticalId, VerticalConfig> = {
  dmo: {
    id: 'dmo',
    displayName: 'Destination Marketing Organisation (DMO)',
    nav: {
      releases: 'Releases',
      outlets: 'Outlets',
      mediaRequests: 'Media Requests',
      submissions: 'Submissions',
      content: 'Content',
      partnerPortalTitle: 'Partner Portal',
      partnersSettings: 'Partners',
    },
    ai: {
      orgTypeDescription: 'Destination Marketing Organization',
      contentDomain: 'tourism experiences',
      audienceOptions: ['Travel Trade', 'Consumer', 'Hybrid'],
      expertPersona: 'tourism and travel PR expert',
      themeExamples:
        '"Cultural Heritage", "Adventure Tourism", "Food & Drink", "Family Activities", "Sustainability", "Events & Festivals", "Accommodation", "Nature & Wildlife"',
      webContentStyle: 'Action-oriented, visitor-focused language',
      webContentTypes: ["What's New", 'Event Listing', 'Destination Guide', 'Seasonal Update', 'General'],
      suggestedContentTypeInstruction:
        'Suggest the most appropriate content type from: "What\'s New", "Event Listing", "Destination Guide", "Seasonal Update", "General"',
    },
    consent: {
      contentUsage:
        'I consent to Visit [Destination] using this content in press releases and digital communications.',
      marketing:
        'I agree to receive occasional updates and newsletters from the DMO.',
    },
    provision: {
      description: 'Creates a new organisation and its first admin account.',
    },
  },

  charity: {
    id: 'charity',
    displayName: 'Charity / Non-Profit',
    nav: {
      releases: 'Press Releases',
      outlets: 'Media Outlets',
      mediaRequests: 'Journalist Enquiries',
      submissions: 'Stories',
      content: 'Web Content',
      partnerPortalTitle: 'Partner Portal',
      partnersSettings: 'Partners',
    },
    ai: {
      orgTypeDescription: 'registered charity',
      contentDomain: 'charitable programmes and community impact',
      audienceOptions: ['Donors', 'Volunteers', 'General Public'],
      expertPersona: 'charity PR and communications expert',
      themeExamples:
        '"Community Impact", "Fundraising", "Volunteer Stories", "Service Delivery", "Awareness Campaigns", "Events", "Partnerships", "Policy"',
      webContentStyle: 'Impact-driven, empathetic language',
      webContentTypes: ['Campaign Update', 'Impact Story', 'Event', 'News', 'General'],
      suggestedContentTypeInstruction:
        'Suggest the most appropriate content type from: "Campaign Update", "Impact Story", "Event", "News", "General"',
    },
    consent: {
      contentUsage:
        'I consent to this charity using my story in press releases and digital communications.',
      marketing:
        'I agree to receive occasional updates and newsletters from the organisation.',
    },
    provision: {
      description: 'Creates a new organisation and its first admin account.',
    },
  },

  'trade-body': {
    id: 'trade-body',
    displayName: 'Trade Body / Industry Association',
    nav: {
      releases: 'Press Releases',
      outlets: 'Media Contacts',
      mediaRequests: 'Media Enquiries',
      submissions: 'Member News',
      content: 'Industry Content',
      partnerPortalTitle: 'Member Portal',
      partnersSettings: 'Members',
    },
    ai: {
      orgTypeDescription: 'trade body and industry association',
      contentDomain: 'industry news and member achievements',
      audienceOptions: ['Trade Press', 'Members', 'Policy Makers', 'General Business'],
      expertPersona: 'trade body and industry communications expert',
      themeExamples:
        '"Industry Trends", "Member Spotlight", "Policy & Regulation", "Market Data", "Awards", "Events", "Advocacy", "Innovation"',
      webContentStyle: 'Authoritative, B2B professional language',
      webContentTypes: ['Industry News', 'Member Spotlight', 'Policy Update', 'Report & Data', 'General'],
      suggestedContentTypeInstruction:
        'Suggest the most appropriate content type from: "Industry News", "Member Spotlight", "Policy Update", "Report & Data", "General"',
    },
    consent: {
      contentUsage:
        'I consent to the trade body using this content in press releases and member communications.',
      marketing:
        'I agree to receive occasional updates and newsletters from the organisation.',
    },
    provision: {
      description: 'Creates a new organisation and its first admin account.',
    },
  },
};

export const DEFAULT_VERTICAL: VerticalConfig = VERTICALS['dmo'];

export function getVerticalConfig(id: VerticalId | null | undefined): VerticalConfig {
  if (!id || !(id in VERTICALS)) return DEFAULT_VERTICAL;
  return VERTICALS[id];
}
