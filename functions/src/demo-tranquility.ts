/**
 * Fictional destination demo dataset: "Tranquility".
 *
 * Every tourism demo org used to be seeded from a Cornwall dataset built on real
 * businesses, real outlets and real email addresses. That made demos look like we work
 * with a destination we don't, and put real inboxes one mis-click away from a send.
 *
 * Everything here is invented: the destination, its businesses, outlets, journalists
 * and coverage. All email addresses and links use the reserved `.example` TLD
 * (RFC 2606), which can never resolve or receive mail.
 *
 * Kept free of firebase imports so it can be unit-tested. Dates are relative to the
 * moment of seeding (`nowMs`), so a reset always produces a fresh-looking account.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEMO_DESTINATION = {
  name: 'Tranquility',
  orgName: 'Visit Tranquility',
  domain: 'visittranquility.example',
  spokesperson: 'Eleanor Hart',
  spokespersonTitle: 'Head of Destination Marketing at Visit Tranquility',
};

/** Fictional, anonymised Press Pilot network contacts shown in Smart Distribution
 *  recommendations for demo orgs, in place of the real shared media network. */
export type DemoNetworkContact = {
  id: string;
  networkStatus: 'active';
  editorialFocus: string[];
  geographies: string[];
  topics: string[];
  outlet: { type: string; location: string };
  recentCoverage: Array<{ themes: string[]; publishedAt: Date }>;
  contactHealth: { suppressionStatus: 'none'; verificationStatus: 'valid' };
};

export type TranquilityDataset = ReturnType<typeof buildTranquilityDataset>;

export function buildTranquilityDataset(nowMs: number = Date.now()) {
  const ago = (days: number, hours = 0) => new Date(nowMs - days * DAY_MS - hours * 60 * 60 * 1000);
  const msAgo = (days: number) => nowMs - days * DAY_MS;
  const D = DEMO_DESTINATION;

  const boilerplate = `About Visit Tranquility
Visit Tranquility is the official destination marketing organisation for Tranquility, a coastal and countryside region of harbour towns, chalk downs and the Stillwater Valley. It works with more than 400 member businesses to grow year-round visitor demand. For media enquiries contact press@${D.domain}.`;

  // ---------------------------------------------------------------------------
  // Member businesses (stored as users with role Partner)
  // ---------------------------------------------------------------------------
  const partners = [
    { id: 'demo-partner-1', name: 'The Harbourmaster Hotel', email: 'stay@harbourmasterhotel.example', category: 'Accommodation' },
    { id: 'demo-partner-2', name: 'Tranquility Bay Sea Kayaks', email: 'paddle@tbseakayaks.example', category: 'Activity & Adventure' },
    { id: 'demo-partner-3', name: 'Saltwork Kitchen', email: 'hello@saltworkkitchen.example', category: 'Food & Drink' },
    { id: 'demo-partner-4', name: 'Mistral Point Lighthouse Gallery', email: 'gallery@mistralpoint.example', category: 'Arts & Culture' },
    { id: 'demo-partner-5', name: 'Stillwater Gardens', email: 'visit@stillwatergardens.example', category: 'Attraction' },
    { id: 'demo-partner-6', name: 'Larkspur Downs Ranger Walks', email: 'walks@larkspurdowns.example', category: 'Nature & Outdoor' },
    { id: 'demo-partner-7', name: 'Tranquility Lantern Festival', email: 'team@lanternfestival.example', category: 'Events & Festivals' },
    { id: 'demo-partner-8', name: 'Old Ropeworks Cottages', email: 'bookings@oldropeworks.example', category: 'Accommodation' },
    { id: 'demo-partner-9', name: 'Stillwater Cider Press', email: 'cellar@stillwatercider.example', category: 'Food & Drink' },
    { id: 'demo-partner-10', name: 'Tidewater Spa', email: 'relax@tidewaterspa.example', category: 'Spa & Wellness' },
    { id: 'demo-partner-11', name: 'Valley Line Heritage Railway', email: 'tickets@valleyline.example', category: 'Attraction' },
    { id: 'demo-partner-12', name: 'Two Rivers Cycle Hire', email: 'ride@tworiverscycles.example', category: 'Activity & Adventure' },
  ];

  // ---------------------------------------------------------------------------
  // The org's own media lists. Tagged with the controlled taxonomy so Smart
  // Distribution recommendations have something real to score against.
  // ---------------------------------------------------------------------------
  const outletLists = [
    {
      id: 'demo-list-national',
      name: 'National Travel Press',
      description: 'National travel desks, consumer travel magazines and lifestyle editors.',
      recipients: [
        { id: 'demo-r-1', name: 'Hannah Okafor', email: 'hannah.okafor@weekendtraveller.example', outlet: 'The Weekend Traveller', position: 'Travel Editor', outletType: 'national-news', editorialFocus: ['Tourism & destinations'], geography: ['National (UK)'], topics: ['Tourism & travel'], relationshipStatus: 'published' },
        { id: 'demo-r-2', name: 'Callum Reid', email: 'c.reid@slowtraveljournal.example', outlet: 'Slow Travel Journal', position: 'Features Editor', outletType: 'trade', editorialFocus: ['Tourism & destinations', 'Sustainability & environment'], geography: ['National (UK)'], topics: ['Tourism & travel', 'Sustainability'], relationshipStatus: 'responded' },
        { id: 'demo-r-3', name: 'Priya Natarajan', email: 'priya@coastlinemagazine.example', outlet: 'Coastline Magazine', position: 'Deputy Editor', outletType: 'national-news', editorialFocus: ['Tourism & destinations', 'Health & wellbeing'], geography: ['National (UK)'], topics: ['Tourism & travel', 'Health & wellbeing'], relationshipStatus: 'pitched' },
        { id: 'demo-r-4', name: 'Oliver Grant', email: 'o.grant@dailycourier.example', outlet: 'The Daily Courier', position: 'Travel Correspondent', outletType: 'national-news', editorialFocus: ['Tourism & destinations'], geography: ['National (UK)'], topics: ['Tourism & travel'], relationshipStatus: 'known' },
        { id: 'demo-r-5', name: 'Freya Lindqvist', email: 'freya@tableandtrail.example', outlet: 'Table & Trail', position: 'Food Travel Writer', outletType: 'national-news', editorialFocus: ['Food & drink', 'Tourism & destinations'], geography: ['National (UK)'], topics: ['Food & drink', 'Tourism & travel'], relationshipStatus: 'published' },
        { id: 'demo-r-6', name: 'Marcus Bell', email: 'marcus@wanderlist.example', outlet: 'Wanderlist', position: 'Commissioning Editor', outletType: 'creator', editorialFocus: ['Tourism & destinations'], geography: ['National (UK)', 'International'], topics: ['Tourism & travel'], relationshipStatus: 'unknown' },
        { id: 'demo-r-7', name: 'Aisha Rahman', email: 'aisha@greenjourneys.example', outlet: 'Green Journeys', position: 'Editor', outletType: 'newsletter', editorialFocus: ['Sustainability & environment', 'Tourism & destinations'], geography: ['National (UK)'], topics: ['Sustainability', 'Tourism & travel'], relationshipStatus: 'responded' },
        { id: 'demo-r-8', name: 'Tom Ashworth', email: 'tom@traveltradebulletin.example', outlet: 'Travel Trade Bulletin', position: 'News Editor', outletType: 'trade', editorialFocus: ['Tourism & destinations', 'Independent business & retail'], geography: ['National (UK)'], topics: ['Tourism & travel', 'Business & investment', 'Tourism policy'], relationshipStatus: 'known' },
      ],
    },
    {
      id: 'demo-list-regional',
      name: 'Regional Media',
      description: 'Tranquility and Stillwater Valley press, radio and digital outlets.',
      recipients: [
        { id: 'demo-r-9', name: 'Bethan Morgan', email: 'b.morgan@tranquilitygazette.example', outlet: 'The Tranquility Gazette', position: 'News Editor', outletType: 'local-news', editorialFocus: ['Tourism & destinations', 'Community & charity'], geography: ['Regional', 'Local'], topics: ['Tourism & travel', 'Community & charity'], relationshipStatus: 'published' },
        { id: 'demo-r-10', name: 'Sam Whitfield', email: 'sam.whitfield@coastandvalley.example', outlet: 'Coast & Valley Radio', position: 'Senior Reporter', outletType: 'broadcast', editorialFocus: ['Events & culture', 'Tourism & destinations'], geography: ['Regional'], topics: ['Arts & culture', 'Tourism & travel'], relationshipStatus: 'responded' },
        { id: 'demo-r-11', name: 'Lily Chen', email: 'lily@stillwaterpost.example', outlet: 'Stillwater Valley Post', position: 'Features Writer', outletType: 'local-news', editorialFocus: ['Food & drink', 'Independent business & retail'], geography: ['Local', 'Regional'], topics: ['Food & drink', 'Business & investment'], relationshipStatus: 'published' },
        { id: 'demo-r-12', name: 'Gareth Pryce', email: 'g.pryce@regionalbusiness.example', outlet: 'Tranquility Business Review', position: 'Business Editor', outletType: 'trade', editorialFocus: ['Independent business & retail'], geography: ['Regional'], topics: ['Business & investment', 'Tourism policy'], relationshipStatus: 'known' },
        { id: 'demo-r-13', name: 'Nina Kowalski', email: 'nina@tranquilitytoday.example', outlet: 'Tranquility Today', position: 'Editor', outletType: 'local-news', editorialFocus: ['Tourism & destinations', 'Events & culture'], geography: ['Regional', 'Local'], topics: ['Tourism & travel', 'Arts & culture'], relationshipStatus: 'pitched' },
        { id: 'demo-r-14', name: 'Rhys Daniels', email: 'rhys@shorelinepodcast.example', outlet: 'The Shoreline Podcast', position: 'Host', outletType: 'podcast', editorialFocus: ['Sustainability & environment', 'Sport & physical activity'], geography: ['Regional'], topics: ['Sustainability', 'Sport'], relationshipStatus: 'unknown' },
      ],
    },
  ];

  // ---------------------------------------------------------------------------
  // Releases: one draft, two ready (approved), two sent.
  // ---------------------------------------------------------------------------
  const releases: Array<Record<string, unknown>> = [
    {
      id: 'demo-release-1',
      headline: 'Tranquility Bay Hotels Report Strongest Autumn Bookings in Five Years',
      slug: 'tranquility-bay-strongest-autumn-bookings',
      campaignType: 'Seasonal',
      targetMarket: 'UK',
      audience: 'Travel Trade',
      status: 'Draft',
      sends: 0, opens: 0, clicks: 0,
      createdAt: ago(2),
      updatedAt: ago(1),
      smartDistribution: { editorialFocus: ['Tourism & destinations'], geographies: ['National (UK)', 'Regional'], topics: ['Tourism & travel', 'Business & investment'] },
      bodyCopy: `Hotels and self-catering businesses around Tranquility Bay are reporting their strongest autumn in five years, with October occupancy up 14% on last year and midweek stays showing the sharpest growth.

The Harbourmaster Hotel says advance bookings for October and November are a quarter ahead of last year, while Old Ropeworks Cottages has extended its season into December for the first time.

"Visitors are discovering that Tranquility is at its best when it's quiet," said ${D.spokesperson}, ${D.spokespersonTitle}. "Clear autumn light, empty beaches and a food scene that doesn't close for winter. Our members have built an offer that works all year, and visitors are responding."

The growth follows two years of joint shoulder-season marketing by Visit Tranquility and its members, including the Stillwater Valley Food Trail and the expanded Lantern Festival.

${boilerplate}`,
    },
    {
      id: 'demo-release-2',
      headline: 'Stillwater Valley Food Trail Launches With 32 Independent Producers',
      slug: 'stillwater-valley-food-trail-launch',
      campaignType: 'Product Launch',
      targetMarket: 'UK',
      audience: 'Consumer',
      status: 'Ready',
      approvalStatus: 'approved',
      sends: 0, opens: 0, clicks: 0,
      createdAt: ago(8),
      updatedAt: ago(3),
      smartDistribution: { editorialFocus: ['Food & drink', 'Tourism & destinations'], geographies: ['National (UK)', 'Regional'], topics: ['Food & drink', 'Tourism & travel'] },
      bodyCopy: `A new self-guided food trail links 32 independent producers, restaurants and farm shops along the Stillwater Valley, from the harbour at Tranquility Bay to the orchards of Larkspur Downs.

The Stillwater Valley Food Trail has been developed with member businesses including Saltwork Kitchen, Stillwater Cider Press and a dozen family farms. Visitors can follow the route by car, by bike from Two Rivers Cycle Hire, or on the Valley Line Heritage Railway, which stops at five trail villages.

"The valley has always fed the coast, and now visitors can follow that story from field to plate," said ${D.spokesperson}, ${D.spokespersonTitle}. "Every stop on the trail is independently owned, so every visit keeps money in the valley."

A trail passport collects stamps at each stop and unlocks offers from participating businesses. The trail is open year-round, with a harvest weekend each September.

${boilerplate}`,
    },
    {
      id: 'demo-release-5',
      headline: 'Car-Free Coast Pass Makes Tranquility the Easiest Slow-Travel Break From London',
      slug: 'car-free-coast-pass-slow-travel',
      campaignType: 'Product Launch',
      targetMarket: 'UK',
      audience: 'Consumer',
      status: 'Ready',
      approvalStatus: 'approved',
      sends: 0, opens: 0, clicks: 0,
      createdAt: ago(12),
      updatedAt: ago(6),
      smartDistribution: { editorialFocus: ['Sustainability & environment', 'Tourism & destinations'], geographies: ['National (UK)'], topics: ['Sustainability', 'Tourism & travel'] },
      bodyCopy: `Visitors arriving in Tranquility by train can now explore the whole coast and valley without a car, thanks to the new Coast Pass: unlimited travel on the coastal bus, the Valley Line Heritage Railway and the Tranquility Bay water taxi.

The three-day pass also includes discounted bike hire from Two Rivers Cycle Hire and luggage transfers between 20 member hotels and cottages, so visitors can walk the 40-mile Tranquility Coast Path one section at a time.

"More of our visitors are asking how to visit without a car, and now we have a simple answer," said ${D.spokesperson}, ${D.spokespersonTitle}. "The Coast Pass turns the journey into part of the holiday."

The pass is on sale now through participating accommodation and at the Tranquility Bay visitor centre.

${boilerplate}`,
    },
    {
      id: 'demo-release-3',
      headline: 'Tranquility Lantern Festival Returns Bigger, With a New Floating Lantern Trail',
      slug: 'lantern-festival-floating-trail',
      campaignType: 'Event',
      targetMarket: 'UK',
      audience: 'Consumer',
      status: 'Sent',
      sends: 412, opens: 186, clicks: 61,
      createdAt: ago(34),
      updatedAt: ago(28),
      sentAt: ago(28),
      smartDistribution: { editorialFocus: ['Events & culture', 'Tourism & destinations'], geographies: ['Regional', 'National (UK)'], topics: ['Arts & culture', 'Tourism & travel'] },
      bodyCopy: `The Tranquility Lantern Festival returns for its eighth year with a new floating lantern trail across the harbour, designed by artists from the Mistral Point Lighthouse Gallery.

Over three evenings, more than 2,000 handmade lanterns will light the harbour walls, the old ropeworks and the coast path to Mistral Point. The new floating trail, made from biodegradable materials, will carry lanterns made by local schools across the water.

"The festival started as a small community evening and now draws visitors from across the country," said ${D.spokesperson}, ${D.spokespersonTitle}. "It's the moment the whole town comes together, and the best possible introduction to Tranquility out of season."

Entry is free, with ticketed lantern-making workshops and late-night dining from harbourside restaurants.

${boilerplate}`,
    },
    {
      id: 'demo-release-4',
      headline: 'Tranquility Named One of the UK’s Top Slow-Travel Destinations',
      slug: 'tranquility-top-slow-travel-destination',
      campaignType: 'Award',
      targetMarket: 'UK & International',
      audience: 'Hybrid',
      status: 'Sent',
      sends: 640, opens: 297, clicks: 104,
      createdAt: ago(58),
      updatedAt: ago(51),
      sentAt: ago(51),
      smartDistribution: { editorialFocus: ['Tourism & destinations', 'Sustainability & environment'], geographies: ['National (UK)', 'International'], topics: ['Tourism & travel', 'Sustainability'] },
      bodyCopy: `Tranquility has been named one of the UK's top ten slow-travel destinations in the annual Slow Travel Journal readers' awards, recognised for its car-free coast path, independent food scene and year-round events.

Judges singled out the Stillwater Valley's network of walking and cycling routes and the number of independently owned businesses, which make up more than 80% of Visit Tranquility's membership.

"This recognition belongs to our members, who have built a destination people want to take their time over," said ${D.spokesperson}, ${D.spokespersonTitle}.

${boilerplate}`,
    },
  ];

  // ---------------------------------------------------------------------------
  // Member submissions across every status.
  // ---------------------------------------------------------------------------
  const sub = (p: (typeof partners)[number]) => ({ partnerId: p.id, partnerName: p.name, partnerEmail: p.email });
  const submissions: Array<Record<string, unknown>> = [
    {
      id: 'demo-sub-1',
      ...sub(partners[9]),
      title: 'Winter Sea-Swim and Sauna Mornings Launch at Tidewater Spa',
      bodyCopy: `Tidewater Spa is launching guided winter sea-swim mornings from November, finishing in our new clifftop wood-fired sauna.

Sessions run at sunrise on weekends, are led by qualified open-water coaches and include a hot breakfast. Packages with an overnight stay start from £185 per person.

We'd love to be part of any winter wellness or slow-travel story. High-res images and press visits are available.`,
      tagIds: [], imageUrls: [], imageStoragePaths: [], imageMetadata: [],
      status: 'submitted',
      createdAt: ago(1, 5),
    },
    {
      id: 'demo-sub-2',
      ...sub(partners[8]),
      title: 'Stillwater Cider Press Opens Its First Cellar Door and Tasting Room',
      bodyCopy: `After three generations of pressing apples in the valley, Stillwater Cider Press is opening its first cellar door, with orchard tours, tastings and a small kitchen serving food from fellow trail producers.

The tasting room is a stop on the Stillwater Valley Food Trail and is a ten-minute walk from Larkspur station on the Valley Line.`,
      tagIds: [], imageUrls: [], imageStoragePaths: [], imageMetadata: [],
      status: 'reviewed',
      reviewNotes: 'Strong fit for the food trail release. Ask for orchard photography.',
      createdAt: ago(6),
      updatedAt: ago(4),
    },
    {
      id: 'demo-sub-3',
      ...sub(partners[6]),
      title: 'Lantern Festival 2026: Floating Lantern Trail and Schools Programme',
      bodyCopy: `This year's festival adds a floating lantern trail across the harbour and a lantern-making programme with nine local primary schools. Lanterns are made from biodegradable materials and collected the morning after each evening.`,
      tagIds: [], imageUrls: [], imageStoragePaths: [], imageMetadata: [],
      status: 'used',
      usedInReleaseIds: ['demo-release-3'],
      createdAt: ago(40),
      updatedAt: ago(34),
    },
    {
      id: 'demo-sub-4',
      ...sub(partners[1]),
      title: 'Bioluminescence Night Paddles Return to Tranquility Bay',
      bodyCopy: `Our guided night kayak trips to see the bay's bioluminescent plankton return from late summer, with small groups of up to eight and all kit provided. Last season sold out within a week of opening.`,
      tagIds: [], imageUrls: [], imageStoragePaths: [], imageMetadata: [],
      status: 'submitted',
      createdAt: ago(3, 2),
    },
    {
      id: 'demo-sub-5',
      ...sub(partners[10]),
      title: 'Valley Line Heritage Railway Adds Evening Supper Trains',
      bodyCopy: `From spring the Valley Line will run Friday evening supper trains through the Stillwater Valley, serving a three-course menu from Saltwork Kitchen.`,
      tagIds: [], imageUrls: [], imageStoragePaths: [], imageMetadata: [],
      status: 'reviewed',
      reviewNotes: 'Hold for the spring food release.',
      createdAt: ago(15),
      updatedAt: ago(12),
    },
  ];

  // ---------------------------------------------------------------------------
  // Earned coverage, spread across the last ~90 days so the dashboard, coverage
  // page and shareable report all have a story to tell.
  // ---------------------------------------------------------------------------
  const p = (i: number) => partners[i - 1];
  const coverage: Array<Record<string, unknown>> = [
    { id: 'demo-cov-1', headline: 'Ten of the best UK breaks you can do without a car', outletName: 'The Weekend Traveller', url: 'https://weekendtraveller.example/travel/uk-car-free-breaks', days: 47, mediaType: 'online', outletType: 'national', tone: 'positive', releaseId: 'demo-release-4', partnerIds: [p(12).id, p(11).id], themes: ['slow travel', 'sustainability'], fromPressPilotSend: true, reportedAudience: 1200000 },
    { id: 'demo-cov-2', headline: 'Slow Travel Journal awards: the destinations worth taking your time over', outletName: 'Slow Travel Journal', url: 'https://slowtraveljournal.example/awards/top-ten', days: 50, mediaType: 'print', outletType: 'trade', tone: 'positive', releaseId: 'demo-release-4', partnerIds: [], themes: ['slow travel', 'awards'], fromPressPilotSend: true, reportedAudience: 85000 },
    { id: 'demo-cov-3', headline: 'Tranquility named among UK’s top slow-travel spots', outletName: 'The Tranquility Gazette', url: 'https://tranquilitygazette.example/news/slow-travel-award', days: 50, mediaType: 'online', outletType: 'regional', tone: 'positive', releaseId: 'demo-release-4', partnerIds: [], themes: ['awards'], fromPressPilotSend: true, reportedAudience: 64000 },
    { id: 'demo-cov-4', headline: 'Harbour to glow as Lantern Festival adds floating trail', outletName: 'Coast & Valley Radio', url: 'https://coastandvalley.example/news/lantern-festival-floating-trail', days: 27, mediaType: 'broadcast', outletType: 'regional', tone: 'positive', releaseId: 'demo-release-3', partnerIds: [p(7).id, p(4).id], themes: ['events', 'arts & culture'], fromPressPilotSend: true, reportedAudience: 140000 },
    { id: 'demo-cov-5', headline: 'Autumn festivals worth travelling for', outletName: 'The Daily Courier', url: 'https://dailycourier.example/travel/autumn-festivals', days: 22, mediaType: 'print', outletType: 'national', tone: 'positive', releaseId: 'demo-release-3', partnerIds: [p(7).id], themes: ['events'], fromPressPilotSend: true, reportedAudience: 410000 },
    { id: 'demo-cov-6', headline: 'Lantern makers: the schools lighting up Tranquility harbour', outletName: 'Tranquility Today', url: 'https://tranquilitytoday.example/community/lantern-schools', days: 25, mediaType: 'online', outletType: 'local', tone: 'positive', releaseId: 'demo-release-3', partnerIds: [p(7).id], themes: ['community', 'events'], fromPressPilotSend: true, reportedAudience: 22000 },
    { id: 'demo-cov-7', headline: 'The best seafood on the south coast? Inside Saltwork Kitchen', outletName: 'Table & Trail', url: 'https://tableandtrail.example/eat/saltwork-kitchen', days: 16, mediaType: 'online', outletType: 'national', tone: 'positive', releaseId: null, partnerIds: [p(3).id], themes: ['food & drink'], fromPressPilotSend: false, reportedAudience: 310000 },
    { id: 'demo-cov-8', headline: 'Winter wild swimming: five coastal saunas to try this year', outletName: 'Coastline Magazine', url: 'https://coastlinemagazine.example/wellness/coastal-saunas', days: 9, mediaType: 'online', outletType: 'national', tone: 'positive', releaseId: null, partnerIds: [p(10).id], themes: ['wellness'], fromPressPilotSend: false, reportedAudience: 260000 },
    { id: 'demo-cov-9', headline: 'Visitor parking pressure at Mistral Point raised at council meeting', outletName: 'Stillwater Valley Post', url: 'https://stillwaterpost.example/news/mistral-point-parking', days: 12, mediaType: 'online', outletType: 'local', tone: 'sensitive', releaseId: null, partnerIds: [], themes: ['visitor management'], fromPressPilotSend: false, reportedAudience: 18000 },
    { id: 'demo-cov-10', headline: 'How a regional DMO grew its autumn season', outletName: 'Travel Trade Bulletin', url: 'https://traveltradebulletin.example/destinations/tranquility-autumn', days: 5, mediaType: 'newsletter', outletType: 'trade', tone: 'neutral', releaseId: null, partnerIds: [p(1).id, p(8).id], themes: ['shoulder season', 'business'], fromPressPilotSend: false, reportedAudience: 42000 },
    { id: 'demo-cov-11', headline: 'Bioluminescent bays: where to see the sea glow in Britain', outletName: 'Wanderlist', url: 'https://wanderlist.example/nature/glowing-bays', days: 74, mediaType: 'social', outletType: 'national', tone: 'positive', releaseId: null, partnerIds: [p(2).id], themes: ['nature', 'adventure'], fromPressPilotSend: false, reportedAudience: 95000 },
    { id: 'demo-cov-12', headline: 'Green Journeys weekly: the Tranquility Coast Path, one section at a time', outletName: 'Green Journeys', url: 'https://greenjourneys.example/newsletter/coast-path', days: 3, mediaType: 'newsletter', outletType: 'national', tone: 'positive', releaseId: null, partnerIds: [p(6).id], themes: ['slow travel', 'sustainability'], fromPressPilotSend: false, reportedAudience: 36000 },
  ].map(({ days, ...c }) => {
    const rel = releases.find((r) => r.id === c.releaseId);
    return {
      ...c,
      publishedAtMs: msAgo(days as number),
      releaseHeadline: rel ? (rel.headline as string) : null,
      submissionIds: [],
      partnerNames: (c.partnerIds as string[]).map((id) => partners.find((pp) => pp.id === id)?.name || 'Member'),
      reportedAudienceSource: 'Publisher media pack',
      notes: '',
      createdAt: ago((days as number) - 1 < 0 ? 0 : (days as number) - 1),
    };
  });

  // ---------------------------------------------------------------------------
  // Media opportunities. Hand-written stand-ins for what the live engine produces,
  // with fictional evidence, so the demo never shows real news from other regions.
  // ---------------------------------------------------------------------------
  const ev = (id: string, sourceName: string, title: string, url: string, days: number) => ({
    mediaItemId: `demo-item-${id}`, sourceName, title, url, publishedAt: ago(days),
  });
  const opportunities: Array<Record<string, unknown>> = [
    {
      id: 'demo-opp-1',
      status: 'new',
      title: 'Car-free breaks are a developing theme on national travel desks',
      summary: 'Four national and trade outlets have run car-free or train-first UK break features in the past fortnight. Your approved Coast Pass release answers the exact question these pieces are asking.',
      rationale: [
        'Matches your priority topics: Sustainability, Tourism & travel.',
        'You have an approved story ready to go: "Car-Free Coast Pass Makes Tranquility the Easiest Slow-Travel Break From London".',
        'Slow Travel Journal and The Weekend Traveller have covered you before.',
      ],
      suggestedAction: 'targeted_pitch',
      urgency: 'this_week',
      confidence: 'high',
      momentum: 'developing_theme',
      itemCount: 4, distinctSourceCount: 4, windowDays: 14,
      topicTags: ['Sustainability', 'Tourism & travel'],
      geographyTags: ['National (UK)'],
      matchedTopics: ['Sustainability', 'Tourism & travel'],
      evidence: [
        ev('1a', 'The Daily Courier', 'Leave the car at home: Britain’s best train-and-walk weekends', 'https://dailycourier.example/travel/train-and-walk', 3),
        ev('1b', 'Green Journeys', 'Readers ask: which coasts can you really do without a car?', 'https://greenjourneys.example/ask/car-free-coasts', 6),
        ev('1c', 'Travel Trade Bulletin', 'Rail-first packages lift domestic shoulder-season sales', 'https://traveltradebulletin.example/news/rail-first-packages', 9),
        ev('1d', 'The Weekend Traveller', 'The no-car holiday: a beginner’s guide', 'https://weekendtraveller.example/travel/no-car-holiday', 11),
      ],
      matchedReleaseIds: ['demo-release-5'],
      matchedReleaseHeadlines: ['Car-Free Coast Pass Makes Tranquility the Easiest Slow-Travel Break From London'],
      caveat: 'Shows that the theme is running, not that any outlet is looking for a Tranquility story.',
      dedupeKey: 'demo:car-free-breaks',
      generatedAt: ago(0, 3),
      expiresAt: new Date(nowMs + 10 * DAY_MS),
      generatorVersion: 'demo-seed-1',
    },
    {
      id: 'demo-opp-2',
      status: 'new',
      title: 'Food trails and producer routes are an emerging opportunity',
      summary: 'Food and lifestyle outlets are picking up independent producer routes as an autumn and winter angle. Your Stillwater Valley Food Trail release is approved and unsent.',
      rationale: [
        'Matches your priority topic: Food & drink.',
        'Approved story ready: "Stillwater Valley Food Trail Launches With 32 Independent Producers".',
        'Saltwork Kitchen was featured by Table & Trail last month, so there is a warm angle.',
      ],
      suggestedAction: 'create_release',
      urgency: 'this_week',
      confidence: 'medium',
      momentum: 'emerging_opportunity',
      itemCount: 3, distinctSourceCount: 3, windowDays: 14,
      topicTags: ['Food & drink', 'Tourism & travel'],
      geographyTags: ['National (UK)', 'Regional'],
      matchedTopics: ['Food & drink'],
      evidence: [
        ev('2a', 'Table & Trail', 'Eat your way along a valley: five UK producer trails', 'https://tableandtrail.example/eat/producer-trails', 4),
        ev('2b', 'The Weekend Traveller', 'Cider country: autumn orchard breaks', 'https://weekendtraveller.example/travel/orchard-breaks', 8),
        ev('2c', 'Stillwater Valley Post', 'Valley farm shops report busiest harvest weekend yet', 'https://stillwaterpost.example/business/harvest-weekend', 10),
      ],
      matchedReleaseIds: ['demo-release-2'],
      matchedReleaseHeadlines: ['Stillwater Valley Food Trail Launches With 32 Independent Producers'],
      caveat: 'Based on three items. Worth watching, not yet a clear trend.',
      dedupeKey: 'demo:food-trails',
      generatedAt: ago(0, 5),
      expiresAt: new Date(nowMs + 12 * DAY_MS),
      generatorVersion: 'demo-seed-1',
    },
    {
      id: 'demo-opp-3',
      status: 'new',
      title: 'Visitor levy debate: a chance to put a calm, member-led view on record',
      summary: 'Regional business and trade press are covering proposals for an overnight visitor levy. A short comment from Visit Tranquility would put members’ views in the story before positions harden.',
      rationale: [
        'Matches your priority topic: Tourism policy.',
        'Tranquility Business Review and Travel Trade Bulletin are already on your media lists.',
      ],
      suggestedAction: 'prepare_comment',
      urgency: 'today',
      confidence: 'medium',
      momentum: 'developing_theme',
      itemCount: 3, distinctSourceCount: 2, windowDays: 7,
      topicTags: ['Tourism policy', 'Business & investment'],
      geographyTags: ['Regional'],
      matchedTopics: ['Tourism policy'],
      evidence: [
        ev('3a', 'Tranquility Business Review', 'Council to consult on overnight visitor levy', 'https://regionalbusiness.example/policy/visitor-levy-consultation', 1),
        ev('3b', 'Tranquility Business Review', 'Hoteliers split on how levy money should be spent', 'https://regionalbusiness.example/policy/levy-hoteliers', 2),
        ev('3c', 'Travel Trade Bulletin', 'Visitor levies: what destinations are learning', 'https://traveltradebulletin.example/analysis/visitor-levies', 5),
      ],
      matchedReleaseIds: [],
      matchedReleaseHeadlines: [],
      caveat: 'A policy story. Agree a position with members before commenting.',
      dedupeKey: 'demo:visitor-levy',
      generatedAt: ago(0, 2),
      expiresAt: new Date(nowMs + 5 * DAY_MS),
      generatorVersion: 'demo-seed-1',
    },
    {
      id: 'demo-opp-4',
      status: 'saved',
      title: 'Winter wellness on the coast: build a member case study',
      summary: 'Coastal saunas and cold-water swimming keep turning up in national lifestyle coverage. Tidewater Spa has just submitted a winter sea-swim story that would make a strong case study.',
      rationale: [
        'Matches your priority topic: Health & wellbeing.',
        'A new member submission from Tidewater Spa fits this theme.',
        'Coastline Magazine featured Tidewater Spa nine days ago.',
      ],
      suggestedAction: 'build_case_study',
      urgency: 'plan_ahead',
      confidence: 'high',
      momentum: 'developing_theme',
      itemCount: 5, distinctSourceCount: 4, windowDays: 21,
      topicTags: ['Health & wellbeing', 'Tourism & travel'],
      geographyTags: ['National (UK)'],
      matchedTopics: ['Health & wellbeing'],
      evidence: [
        ev('4a', 'Coastline Magazine', 'Winter wild swimming: five coastal saunas to try this year', 'https://coastlinemagazine.example/wellness/coastal-saunas', 9),
        ev('4b', 'The Daily Courier', 'Why cold water is the new spa break', 'https://dailycourier.example/lifestyle/cold-water-spa', 13),
        ev('4c', 'Wanderlist', 'Sunrise swims worth setting an alarm for', 'https://wanderlist.example/wellness/sunrise-swims', 15),
        ev('4d', 'The Shoreline Podcast', 'Episode 42: the winter swimming boom', 'https://shorelinepodcast.example/episodes/42', 18),
      ],
      matchedReleaseIds: [],
      matchedReleaseHeadlines: [],
      caveat: 'National interest is clear. The local angle depends on member availability for press visits.',
      dedupeKey: 'demo:winter-wellness',
      generatedAt: ago(4),
      expiresAt: new Date(nowMs + 20 * DAY_MS),
      generatorVersion: 'demo-seed-1',
    },
  ];

  const opportunitySettings = {
    enabled: true,
    priorityTopics: ['Tourism & travel', 'Food & drink', 'Sustainability', 'Health & wellbeing', 'Tourism policy'],
    priorityGeographies: ['Regional', 'National (UK)'],
    watchlistTerms: ['Tranquility', 'Stillwater Valley', 'Lantern Festival', 'Mistral Point'],
    mutedTopics: [],
  };

  // ---------------------------------------------------------------------------
  // Fictional, anonymised network contacts for Smart Distribution recommendations.
  // ---------------------------------------------------------------------------
  const nc = (
    id: string,
    editorialFocus: string[],
    geographies: string[],
    topics: string[],
    outletType: string,
    location: string,
    covered: Array<[string[], number]>
  ): DemoNetworkContact => ({
    id: `demo-network-${id}`,
    networkStatus: 'active',
    editorialFocus,
    geographies,
    topics,
    outlet: { type: outletType, location },
    recentCoverage: covered.map(([themes, days]) => ({ themes, publishedAt: ago(days) })),
    contactHealth: { suppressionStatus: 'none', verificationStatus: 'valid' },
  });
  const networkContacts: DemoNetworkContact[] = [
    nc('1', ['Food & drink', 'Tourism & destinations'], ['National (UK)'], ['Food & drink', 'Tourism & travel'], 'national-news', 'UK national desk', [[['Food & drink'], 12]]),
    nc('2', ['Tourism & destinations', 'Sustainability & environment'], ['National (UK)'], ['Tourism & travel', 'Sustainability'], 'national-news', 'UK national desk', [[['Sustainability', 'Tourism & travel'], 20]]),
    nc('3', ['Food & drink'], ['National (UK)', 'Regional'], ['Food & drink'], 'creator', 'Food creator, UK', [[['Food & drink'], 6]]),
    nc('4', ['Tourism & destinations'], ['International'], ['Tourism & travel'], 'trade', 'European travel trade', [[['Tourism & travel'], 40]]),
    nc('5', ['Sustainability & environment'], ['National (UK)'], ['Sustainability'], 'podcast', 'UK podcast', [[['Sustainability'], 25]]),
    nc('6', ['Events & culture', 'Tourism & destinations'], ['National (UK)'], ['Arts & culture', 'Tourism & travel'], 'newsletter', 'UK what’s-on newsletter', [[['Arts & culture'], 14]]),
    nc('7', ['Health & wellbeing', 'Tourism & destinations'], ['National (UK)'], ['Health & wellbeing', 'Tourism & travel'], 'national-news', 'UK lifestyle desk', [[['Health & wellbeing'], 9]]),
    nc('8', ['Independent business & retail', 'Food & drink'], ['Regional'], ['Business & investment', 'Food & drink'], 'trade', 'Regional business press', [[['Business & investment'], 30]]),
    nc('9', ['Tourism & destinations'], ['National (UK)', 'International'], ['Tourism & travel'], 'broadcast', 'UK travel broadcaster', [[['Tourism & travel'], 50]]),
  ];

  return {
    boilerplate,
    pressContact: { name: D.spokesperson, email: `press@${D.domain}`, phone: '' },
    editorialPriorities:
      'Year-round and shoulder-season visits, slow and car-free travel, independent food and drink, the Lantern Festival, and keeping members visible in national coverage.',
    partners,
    outletLists,
    releases,
    submissions,
    coverage,
    opportunities,
    opportunitySettings,
    networkContacts,
    creditBalance: 250,
  };
}

/** Network contacts for recommendations, generated fresh so recency scoring stays realistic. */
export function demoNetworkContacts(nowMs: number = Date.now()): DemoNetworkContact[] {
  return buildTranquilityDataset(nowMs).networkContacts;
}

/** Peer coverage benchmark shown to demo orgs instead of counts from real customers. */
export function demoPeerBenchmark(own: number) {
  const median = 6;
  const lowerQuartile = 3;
  const upperQuartile = 9;
  return {
    available: true as const,
    peerCount: 14,
    minPeers: 5,
    median,
    lowerQuartile,
    upperQuartile,
    own,
    position: (own > upperQuartile ? 'above' : own < lowerQuartile ? 'below' : 'within') as 'above' | 'below' | 'within',
  };
}
