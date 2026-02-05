import type { Organization, Release, EngagementStats } from './types';

export const getOrganization = (): Organization => ({
  id: 'visit-kent',
  name: 'Visit Kent',
  slug: 'visit-kent',
  boilerplate:
    'Visit Kent is the Destination Management Organisation for Kent, the Garden of England. Our role is to promote Kent as a premier visitor destination to both domestic and international markets, working with and on behalf of our partners to grow the value of tourism to the Kent economy.',
  pressContact: {
    name: 'Jane Doe',
    email: 'press@visitkent.co.uk',
  },
  brandToneNotes:
    'Our tone is professional, inviting, and inspiring. We focus on the rich history, beautiful landscapes, and vibrant culture of Kent. Avoid overly casual language. Emphasize quality and authenticity.',
});

const allReleases: Release[] = [
  {
    id: 'rel-005',
    orgId: 'visit-kent',
    headline: "Kent's Gardens Bloom for Summer Festival",
    campaignType: 'Seasonal',
    targetMarket: 'UK',
    audience: 'Consumer',
    slug: 'kents-gardens-bloom-for-summer-festival',
    status: 'Sent',
    createdAt: new Date('2024-07-15'),
    sends: 1250,
    opens: 450,
    clicks: 75,
  },
  {
    id: 'rel-004',
    orgId: 'visit-kent',
    headline: 'New Culinary Trail Launches in Canterbury',
    campaignType: 'Product Launch',
    targetMarket: 'International',
    audience: 'Travel Trade',
    slug: 'new-culinary-trail-launches-in-canterbury',
    status: 'Sent',
    createdAt: new Date('2024-06-20'),
    sends: 800,
    opens: 320,
    clicks: 90,
  },
  {
    id: 'rel-003',
    orgId: 'visit-kent',
    headline: 'Historic Rochester Castle to Host Jousting Tournament',
    campaignType: 'Event',
    targetMarket: 'UK',
    audience: 'Hybrid',
    slug: 'rochester-castle-jousting-tournament',
    status: 'Ready',
    createdAt: new Date('2024-05-30'),
  },
  {
    id: 'rel-002',
    orgId: 'visit-kent',
    headline: 'Visit Kent Partners with Eurostar for Cross-Channel Tourism Drive',
    campaignType: 'Partnership',
    targetMarket: 'France, Belgium',
    audience: 'Travel Trade',
    slug: 'visit-kent-eurostar-partnership',
    status: 'Draft',
    createdAt: new Date('2024-05-10'),
  },
  {
    id: 'rel-001',
    orgId: 'visit-kent',
    headline: 'Discover the White Cliffs of Dover this Spring',
    campaignType: 'Seasonal',
    targetMarket: 'Domestic',
    audience: 'Consumer',
    slug: 'discover-white-cliffs-of-dover-spring',
    status: 'Sent',
    createdAt: new Date('2024-04-01'),
    sends: 2500,
    opens: 900,
    clicks: 120,
  },
];

export const getReleases = (): Release[] => {
  return allReleases;
};

export const getRecentReleases = (count = 5): Release[] => {
  return allReleases
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, count);
};

export const getStats = (): EngagementStats => {
  const sentReleases = allReleases.filter((r) => r.status === 'Sent');
  return {
    releases: allReleases.length,
    sends: sentReleases.reduce((sum, r) => sum + (r.sends || 0), 0),
    opens: sentReleases.reduce((sum, r) => sum + (r.opens || 0), 0),
    clicks: sentReleases.reduce((sum, r) => sum + (r.clicks || 0), 0),
    pageViews: 12345, // Hardcoded for now
  };
};
