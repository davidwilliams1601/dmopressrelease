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
  /**
   * Optional per-submission consent covering the subject of the content itself
   * (e.g. parental/guardian consent for a named or pictured minor). Shown as an
   * additional required checkbox on the submission form only when present —
   * verticals that don't need it (adult-facing partners) simply omit this field.
   */
  photoRelease?: string;
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
  partnerCategories: string[];
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
    partnerCategories: [
      'Accommodation',
      'Attraction',
      'Activity & Adventure',
      'Food & Drink',
      'Events & Festivals',
      'Transport',
      'Retail',
      'Spa & Wellness',
      'Arts & Culture',
      'Nature & Outdoor',
      'Sport',
      'Other',
    ],
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
    partnerCategories: [
      'Community Group',
      'Health & Wellbeing',
      'Education & Training',
      'Social Care',
      'Environment & Conservation',
      'Arts & Culture',
      'Housing & Homelessness',
      'International Aid',
      'Other',
    ],
  },

  publisher: {
    id: 'publisher',
    displayName: 'Trade Publisher / Media',
    nav: {
      releases: 'Features',
      outlets: 'Media Contacts',
      mediaRequests: 'Editorial Enquiries',
      submissions: 'Story Pitches',
      content: 'Web Content',
      partnerPortalTitle: 'Contributor Portal',
      partnersSettings: 'Contributors',
    },
    ai: {
      orgTypeDescription: 'trade publisher and specialist media outlet',
      contentDomain: 'further education, skills and workforce development',
      audienceOptions: ['Educators & Practitioners', 'Policy Makers', 'Employers & Industry', 'General'],
      expertPersona: 'further education editorial journalist and commissioning editor',
      themeExamples:
        '"Apprenticeships", "T-Levels", "Skills Policy", "Ofsted & Regulation", "Higher Technical Qualifications", "Digital Skills", "Employer Partnerships", "Inclusion & SEND", "EdTech & Innovation", "Funding & Finance", "Leadership & Governance", "Workforce Development"',
      webContentStyle: 'Authoritative, practitioner-focused language with clear news value',
      webContentTypes: ['News Story', 'Feature', 'Opinion & Comment', 'Case Study', 'Policy Update', 'General'],
      suggestedContentTypeInstruction:
        'Suggest the most appropriate content type from: "News Story", "Feature", "Opinion & Comment", "Case Study", "Policy Update", "General"',
    },
    consent: {
      contentUsage:
        'I consent to this publication using my submitted content in articles and digital communications.',
      marketing:
        'I agree to receive occasional updates and newsletters from the editorial team.',
    },
    provision: {
      description: 'Creates a new publisher organisation and its first admin account.',
    },
    partnerCategories: [
      'Further Education College',
      'Independent Training Provider',
      'Awarding Organisation',
      'Higher Education Institution',
      'EdTech & Technology',
      'Employer & Industry Body',
      'Government & Public Sector',
      'Think Tank & Research',
      'Professional Association',
      'Consultancy & Advisory',
      'Other',
    ],
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
    partnerCategories: [
      'Manufacturer',
      'Retailer',
      'Service Provider',
      'Consultant & Advisory',
      'Technology',
      'Media & Communications',
      'Professional Services',
      'Start-up & SME',
      'Enterprise',
      'Other',
    ],
  },

  education: {
    id: 'education',
    displayName: 'Education Provider / Multi-Academy Trust',
    nav: {
      releases: 'Press Releases',
      outlets: 'Media Contacts',
      mediaRequests: 'Media Enquiries',
      submissions: 'Success Stories',
      content: 'Web Content',
      partnerPortalTitle: 'School Portal',
      partnersSettings: 'Schools',
    },
    ai: {
      orgTypeDescription: 'education provider working with schools and multi-academy trusts',
      contentDomain: 'pupil achievement, school success stories, and educational outcomes',
      audienceOptions: ['Parents & Families', 'Local Press', 'Governors & Trustees', 'Education Sector', 'General Public'],
      expertPersona:
        'education sector PR specialist and former schools communications lead who understands safeguarding-first storytelling — celebrates pupil and school achievement in warm, accessible language while staying mindful of child safeguarding norms (e.g. avoiding full names alongside identifying photos unless consent is confirmed, using year group rather than exact age, and steering clear of details that could identify a child’s home or routine)',
      themeExamples:
        '"Exam Results & Attainment", "Ofsted & Inspection", "Pupil Achievement", "Extracurricular & Sport", "Fundraising & Community", "Staff & Governor News", "School Improvement", "Careers & Aspirations", "Inclusion & SEND", "Events & Open Days"',
      webContentStyle:
        'Warm, achievement-focused language that celebrates pupils, staff and schools while remaining safeguarding-appropriate',
      webContentTypes: ['Success Story', 'Press Release', 'Event', 'Ofsted Update', 'General'],
      suggestedContentTypeInstruction:
        'Suggest the most appropriate content type from: "Success Story", "Press Release", "Event", "Ofsted Update", "General"',
    },
    consent: {
      contentUsage:
        'I confirm this school has the right to submit this content and consents to it being used in press releases, website updates, and other publications produced by the education provider.',
      marketing:
        'I agree to receive occasional updates and opportunities, such as campaign briefs and partner news.',
      photoRelease:
        'I confirm that written parental/guardian consent has been obtained for every pupil named or pictured in this submission, in line with the school’s safeguarding and data protection policy, and that this consent is held on file at the school.',
    },
    provision: {
      description: 'Creates a new education provider organisation and its first admin account.',
    },
    partnerCategories: [
      'Primary School',
      'Secondary School',
      'Sixth Form / FE College',
      'Special School',
      'Multi-Academy Trust',
      'Independent School',
      'Early Years / Nursery',
      'Other',
    ],
  },
};

export const DEFAULT_VERTICAL: VerticalConfig = VERTICALS['dmo'];

export function getVerticalConfig(id: VerticalId | null | undefined): VerticalConfig {
  if (!id || !(id in VERTICALS)) return DEFAULT_VERTICAL;
  return VERTICALS[id];
}
