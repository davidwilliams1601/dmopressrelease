import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  if (!context.auth.token?.superAdmin) throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
}

/** Delete all documents in a collection reference (in batches of 400). */
async function deleteCollectionDocs(collRef: admin.firestore.CollectionReference) {
  const snap = await collRef.get();
  if (snap.empty) return;
  const batches: Promise<any>[] = [];
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    batches.push(batch.commit());
  }
  await Promise.all(batches);
}

/** Returns a Firestore Timestamp for N days ago. */
function daysAgo(n: number): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// Demo seed data
// ---------------------------------------------------------------------------
//
// Demo data is vertical-aware: writeDemoData() looks up the org's `vertical`
// field and picks the matching dataset below. Verticals without a bespoke
// dataset (charity, trade-body, publisher) fall back to the original DMO/
// tourism dataset for now, matching pre-existing behaviour — only 'education'
// has a tailored dataset so far, since that's the vertical currently being
// added. Add a new entry to DEMO_DATASETS to give another vertical its own
// realistic content.

const DEMO_PARTNERS_DMO = [
  { id: 'demo-partner-1', name: 'The Harbour Hotel', email: 'enquiries@harbourhotel.co.uk', category: 'Accommodation' },
  { id: 'demo-partner-2', name: 'St Ives Surf School', email: 'hello@stivessurfschool.co.uk', category: 'Activity & Adventure' },
  { id: 'demo-partner-3', name: 'The Seafood Restaurant', email: 'reservations@rickstein.com', category: 'Food & Drink' },
  { id: 'demo-partner-4', name: 'Tate St Ives', email: 'press@tate.org.uk', category: 'Arts & Culture' },
  { id: 'demo-partner-5', name: 'Eden Project', email: 'media@edenproject.com', category: 'Attraction' },
  { id: 'demo-partner-6', name: 'Trebah Garden', email: 'info@trebahgarden.co.uk', category: 'Nature & Outdoor' },
  { id: 'demo-partner-7', name: 'Falmouth Oyster Festival', email: 'hello@falmouthoysterfestival.co.uk', category: 'Events & Festivals' },
  { id: 'demo-partner-8', name: 'The Old Custom House', email: 'stay@oldcustomhouse.co.uk', category: 'Accommodation' },
  { id: 'demo-partner-9', name: 'Mylor Sailing School', email: 'sail@mylorsailing.co.uk', category: 'Activity & Adventure' },
  { id: 'demo-partner-10', name: 'Porthminster Beach Café', email: 'bookings@porthminstercafe.co.uk', category: 'Food & Drink' },
  { id: 'demo-partner-11', name: 'Newlyn Art Gallery', email: 'info@newlynartgallery.co.uk', category: 'Arts & Culture' },
  { id: 'demo-partner-12', name: 'Flambards Theme Park', email: 'media@flambards.co.uk', category: 'Attraction' },
  { id: 'demo-partner-13', name: 'The Bedruthan Hotel & Spa', email: 'stay@bedruthan.com', category: 'Spa & Wellness' },
  { id: 'demo-partner-14', name: 'Kernow Cycling', email: 'ride@kernowcycling.co.uk', category: 'Activity & Adventure' },
  { id: 'demo-partner-15', name: 'Fifteen Cornwall', email: 'info@fifteencornwall.co.uk', category: 'Food & Drink' },
];

const DEMO_OUTLET_LISTS_DMO = [
  {
    id: 'demo-list-national',
    name: 'National Travel Press',
    description: 'National travel editors, consumer travel magazines and broadsheet travel desks.',
    recipients: [
      { id: 'demo-r-1', name: 'Sarah Thompson', email: 'sarah@travelweekly.co.uk', outlet: 'Travel Weekly', position: 'Deputy Editor' },
      { id: 'demo-r-2', name: 'James Morrison', email: 'j.morrison@theguardian.co.uk', outlet: 'The Guardian', position: 'Travel Correspondent' },
      { id: 'demo-r-3', name: 'Emma Clarke', email: 'emma@cntraveller.com', outlet: 'Condé Nast Traveller', position: 'Features Editor' },
      { id: 'demo-r-4', name: 'David Patel', email: 'd.patel@independent.co.uk', outlet: 'The Independent', position: 'Travel Editor' },
      { id: 'demo-r-5', name: 'Rachel Green', email: 'rgreen@which.co.uk', outlet: 'Which? Travel', position: 'Senior Writer' },
      { id: 'demo-r-6', name: 'Mark Williams', email: 'm.williams@telegraph.co.uk', outlet: 'The Telegraph', position: 'Travel Editor' },
      { id: 'demo-r-7', name: 'Anna Foster', email: 'a.foster@bbcgoodfood.com', outlet: 'BBC Good Food', position: 'Travel & Lifestyle Editor' },
      { id: 'demo-r-8', name: 'Tom Hughes', email: 't.hughes@timeout.com', outlet: 'Time Out', position: 'UK Travel Editor' },
    ],
  },
  {
    id: 'demo-list-regional',
    name: 'Regional Media',
    description: 'Cornwall and South West regional press, broadcast, and digital outlets.',
    recipients: [
      { id: 'demo-r-9', name: 'Lucy Barker', email: 'l.barker@cornwalllive.co.uk', outlet: 'Cornwall Live', position: 'News Editor' },
      { id: 'demo-r-10', name: 'Ben Matthews', email: 'b.matthews@westernmorningnews.co.uk', outlet: 'Western Morning News', position: 'Business Reporter' },
      { id: 'demo-r-11', name: 'Claire Davies', email: 'c.davies@cornishguardian.co.uk', outlet: 'Cornish Guardian', position: 'Features Writer' },
      { id: 'demo-r-12', name: 'Peter Jones', email: 'p.jones@bbc.co.uk', outlet: 'BBC Cornwall', position: 'Senior Reporter' },
      { id: 'demo-r-13', name: 'Sophie Williams', email: 's.williams@falmouthpacket.co.uk', outlet: 'Falmouth Packet', position: 'Editor' },
      { id: 'demo-r-14', name: 'Mike Taylor', email: 'm.taylor@cornwalltoday.co.uk', outlet: 'Cornwall Today', position: 'Tourism Correspondent' },
    ],
  },
];

const DEMO_RELEASES_DMO = [
  {
    id: 'demo-release-1',
    headline: "Cornwall's Coastal Hotels See Record Summer Bookings",
    slug: 'cornwalls-coastal-hotels-record-summer-bookings',
    campaignType: 'Seasonal',
    targetMarket: 'UK',
    audience: 'Travel Trade',
    status: 'Draft',
    sends: 0, opens: 0, clicks: 0,
    createdAt: daysAgo(2),
    bodyCopy: `Cornwall's hotels and holiday accommodation providers are reporting record summer bookings, with occupancy rates up 18% year-on-year across the region, as domestic visitor demand continues to grow strongly.

The surge in bookings is being felt across all accommodation types, from boutique coastal hotels to self-catering cottages, with many properties fully committed through August and well into September. The Harbour Hotel in Falmouth reports a 25% increase in advance reservations compared to the same period last year, while Bedruthan Hotel & Spa on the north coast has seen exceptional demand for its wellness and family packages.

"We're seeing extraordinary interest from visitors who want to experience Cornwall's natural beauty and world-class hospitality in depth," said Sarah Mitchell, Head of Tourism at Visit Cornish Riviera. "The quality of our accommodation offer has never been stronger, and visitors are booking earlier and staying for longer."

The rise in bookings coincides with significant investment in the county's accommodation sector, with several properties completing major refurbishments over the past 12 months. The trend reflects Cornwall's growing reputation as a compelling year-round destination, with shoulder season bookings also showing strong growth.

About Visit Cornish Riviera:
Visit Cornish Riviera is the official Destination Marketing Organisation for the Cornish Riviera. For media enquiries contact press@visitcornishriviera.co.uk.`,
  },
  {
    id: 'demo-release-2',
    headline: "New Culinary Trail Celebrates Cornwall's World-Class Food Scene",
    slug: 'cornwall-culinary-trail-food-scene',
    campaignType: 'Product Launch',
    targetMarket: 'UK',
    audience: 'Consumer',
    status: 'Ready',
    approvalStatus: 'approved',
    sends: 0, opens: 0, clicks: 0,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(3),
    bodyCopy: `A new self-guided culinary trail is set to showcase Cornwall's exceptional food and drink scene, connecting visitors with over 40 of the region's finest restaurants, producers, and artisan food businesses across the county.

The Cornwall Culinary Trail, launching this spring, has been developed in partnership with leading food businesses including The Seafood Restaurant in Padstow, Fifteen Cornwall in Newquay, and Porthminster Beach Café in St Ives. The trail spans the entire county, taking in freshly landed fish at working harbours, award-winning cheese dairies, craft breweries, and farm shops.

"Cornwall's food scene is genuinely world-class and we want every visitor to experience it fully," said Sarah Mitchell of Visit Cornish Riviera. "This trail makes it easy to explore the depth and quality of our local produce and the talented people behind it."

The trail is supported by a dedicated digital platform and printed guide available from tourist information centres and participating businesses. Trail passports allow visitors to collect stamps and unlock exclusive offers.

The initiative forms part of Cornwall's wider food tourism strategy, which aims to position the county as the UK's premier food destination by 2026.`,
  },
  {
    id: 'demo-release-3',
    headline: "Tate St Ives and Eden Project Launch Joint 'Art in Nature' Season",
    slug: 'tate-eden-art-in-nature-season',
    campaignType: 'Partnership',
    targetMarket: 'UK & International',
    audience: 'Consumer',
    status: 'Sent',
    sends: 847, opens: 312, clicks: 89,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(22),
    bodyCopy: `Tate St Ives and the Eden Project have announced a landmark collaboration bringing art and nature together across Cornwall in a major season of exhibitions, outdoor installations, and events running from May through October.

'Art in Nature' will feature work by over 30 artists responding to Cornwall's extraordinary landscapes, coastline, and biodiversity. The season opens with a major new commission by internationally acclaimed artist Olafur Eliasson installed within the Eden Project's outdoor biomes, alongside a parallel programme of marine-themed work at Tate St Ives.

"Cornwall has always been a place where art and nature are deeply intertwined," said the programme director at Tate St Ives. "This collaboration gives us the opportunity to explore that relationship on an unprecedented scale, bringing new voices and perspectives to some of our most iconic landscapes."

Visitors to the Eden Project will encounter a series of large-scale outdoor sculptures and land art installations throughout the season, while Tate St Ives will host a programme of talks, workshops, and guided coastal walks connecting the gallery's collection with the surrounding environment.

The 'Art in Nature' season is expected to attract over 150,000 additional visitors to Cornwall and has been designated a key cultural moment in the region's 2024 arts calendar.`,
  },
  {
    id: 'demo-release-4',
    headline: "Cornwall Named UK's Top Coastal Destination for Third Consecutive Year",
    slug: 'cornwall-top-coastal-destination-third-year',
    campaignType: 'Award',
    targetMarket: 'UK & International',
    audience: 'Hybrid',
    status: 'Sent',
    sends: 1203, opens: 521, clicks: 178,
    createdAt: daysAgo(52),
    updatedAt: daysAgo(45),
    bodyCopy: `Cornwall has been named the UK's top coastal destination for the third consecutive year, according to the annual Which? Travel reader survey, with the region receiving outstanding marks for its beaches, food scene, accommodation quality, and overall visitor experience.

The award, voted for by over 12,000 Which? Travel readers, saw Cornwall score top marks across all key categories, with beaches achieving near-perfect scores and the food and drink offer receiving particular praise. The county topped the rankings ahead of the Jurassic Coast, Norfolk Broads, and the Scottish Highlands.

"This is a remarkable recognition of the quality of experience that Cornwall offers visitors, and reflects the tremendous work of our partners across the county," said Sarah Mitchell, Head of Tourism at Visit Cornish Riviera. "Three consecutive years as the UK's top coastal destination is testament to the passion and commitment of everyone in Cornwall's visitor economy."

The award follows a record year for Cornwall tourism, with the region welcoming over 5 million visitors and generating £2.2 billion for the local economy. Visit Cornish Riviera will use the recognition to promote the region in key international markets including the US, Germany, and the Netherlands.`,
  },
];

const DEMO_SUBMISSIONS_DMO = [
  {
    id: 'demo-sub-1',
    partnerId: 'demo-partner-1',
    partnerName: 'The Harbour Hotel',
    partnerEmail: 'enquiries@harbourhotel.co.uk',
    title: 'Summer Wellness Retreat Programme Launches at The Harbour Hotel',
    bodyCopy: `The Harbour Hotel Falmouth is launching a brand new wellness retreat programme this summer, offering guests a range of immersive wellbeing experiences alongside our award-winning spa facilities.

The programme, available from June through September, includes yoga at sunrise on our private harbour-view terrace, guided coastal mindfulness walks with a qualified therapist, and bespoke nutrition menus developed by our in-house chef using locally sourced ingredients.

Packages start from £295 per person per night and include accommodation, daily yoga sessions, one spa treatment, and all meals. Early booking discount of 15% available for reservations made before 31 March.

We'd love to be included in any upcoming wellness or summer lifestyle press releases. Happy to provide high-res images and arrange press visits.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'submitted',
    createdAt: daysAgo(3),
  },
  {
    id: 'demo-sub-2',
    partnerId: 'demo-partner-2',
    partnerName: 'St Ives Surf School',
    partnerEmail: 'hello@stivessurfschool.co.uk',
    title: 'St Ives Surf School Launches New Beginner Packages for 2024',
    bodyCopy: `St Ives Surf School is excited to announce our expanded beginner surf programme for 2024, making Cornwall's incredible surf accessible to first-time surfers of all ages and abilities.

New for this year: family surf days (2 adults + 2 children from £180), women-only beginner mornings every Tuesday, and a new 'Try Surfing' taster session for complete beginners at just £45 per person including all equipment.

We've also partnered with local eco brand Fistral to offer all participants complimentary organic sunscreen and a reusable water bottle as part of our commitment to keeping Cornwall's beaches clean.

Our RNLI-qualified instructors have over 20 years' experience teaching on St Ives Bay. Suitable for ages 8 and up.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'reviewed',
    reviewNotes: 'Great content — good fit for spring/summer consumer release.',
    createdAt: daysAgo(5),
    updatedAt: daysAgo(2),
  },
  {
    id: 'demo-sub-3',
    partnerId: 'demo-partner-7',
    partnerName: 'Falmouth Oyster Festival',
    partnerEmail: 'hello@falmouthoysterfestival.co.uk',
    title: 'Falmouth Oyster Festival 2024: Bigger Than Ever with New Chefs and Events',
    bodyCopy: `The Falmouth Oyster Festival returns this October for its 27th year, and we're delighted to announce our biggest and most ambitious programme yet.

This year's festival (10–13 October) will feature over 60 food and drink stalls, live music across four stages, and an expanded chef demonstration programme featuring three Michelin-starred chefs for the first time in the festival's history.

New for 2024: a dedicated children's cookery zone, a zero-waste pledge across all catering, and a new 'Provenance Trail' connecting festival visitors with the fishing boats and oyster beds that make Falmouth's seafood scene world-class.

The festival attracts over 40,000 visitors across the four days and contributes an estimated £3.2 million to the local economy. Media accreditation available — please contact us directly.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'submitted',
    createdAt: daysAgo(1),
  },
  {
    id: 'demo-sub-4',
    partnerId: 'demo-partner-15',
    partnerName: 'Fifteen Cornwall',
    partnerEmail: 'info@fifteencornwall.co.uk',
    title: "Fifteen Cornwall Celebrates 20 Years of Changing Young Lives Through Food",
    bodyCopy: `Fifteen Cornwall is proud to be celebrating its 20th anniversary this year, marking two decades of training disadvantaged young people and producing some of Cornwall's most exciting culinary talent.

Since opening in 2006, Fifteen Cornwall has trained over 200 young people from difficult backgrounds, equipping them with professional culinary skills and life-changing career opportunities. Many of our alumni now hold senior positions in restaurants across the UK and internationally.

To mark the anniversary, we're hosting a special 20th anniversary dinner series throughout the summer, with tickets available to the public for the first time. Each dinner will feature a different alumni chef returning to cook alongside our current apprentices, celebrating the continuing legacy of our programme.

We're also launching a community cookbook featuring recipes from past and present apprentices, with all proceeds supporting the next generation of Fifteen Cornwall trainees.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'used',
    usedInReleaseIds: ['demo-release-3'],
    createdAt: daysAgo(35),
    updatedAt: daysAgo(28),
  },
];

// ---------------------------------------------------------------------------
// Education demo data (schools submitting success stories to their
// education provider / multi-academy trust). Pupils are referred to by year
// group rather than named individually, consistent with the safeguarding-
// aware tone the education vertical's AI persona uses.
// ---------------------------------------------------------------------------

const DEMO_PARTNERS_EDUCATION = [
  { id: 'demo-edu-partner-1', name: 'Riverside Primary School', email: 'office@riversideprimary.sch.uk', category: 'Primary School' },
  { id: 'demo-edu-partner-2', name: 'Oakfield Secondary Academy', email: 'comms@oakfieldacademy.sch.uk', category: 'Secondary School' },
  { id: 'demo-edu-partner-3', name: 'Greenwood Sixth Form College', email: 'press@greenwoodsfc.ac.uk', category: 'Sixth Form / FE College' },
  { id: 'demo-edu-partner-4', name: 'Meadow View Special School', email: 'admin@meadowview.sch.uk', category: 'Special School' },
  { id: 'demo-edu-partner-5', name: 'Thameside Multi-Academy Trust', email: 'comms@thamesidemat.org.uk', category: 'Multi-Academy Trust' },
  { id: 'demo-edu-partner-6', name: "St Augustine's Independent School", email: 'office@staugustines.sch.uk', category: 'Independent School' },
  { id: 'demo-edu-partner-7', name: 'Little Explorers Nursery', email: 'hello@littleexplorersnursery.co.uk', category: 'Early Years / Nursery' },
  { id: 'demo-edu-partner-8', name: 'Northgate Community College', email: 'press@northgatecc.sch.uk', category: 'Secondary School' },
];

const DEMO_OUTLET_LISTS_EDUCATION = [
  {
    id: 'demo-edu-list-trade',
    name: 'Education Trade Press',
    description: 'National education trade titles covering schools, MATs and the wider sector.',
    recipients: [
      { id: 'demo-edu-r-1', name: 'Sam Fletcher', email: 's.fletcher@schoolsweek.co.uk', outlet: 'Schools Week', position: 'News Editor' },
      { id: 'demo-edu-r-2', name: 'Priya Anand', email: 'p.anand@tes.com', outlet: 'TES (Times Educational Supplement)', position: 'Reporter' },
      { id: 'demo-edu-r-3', name: 'Callum Ross', email: 'c.ross@feweek.co.uk', outlet: 'FE Week', position: 'Senior Reporter' },
      { id: 'demo-edu-r-4', name: 'Nina Okafor', email: 'n.okafor@sec-ed.co.uk', outlet: 'SecEd', position: 'Editor' },
    ],
  },
  {
    id: 'demo-edu-list-regional',
    name: 'Local & Regional Press',
    description: 'Regional newspapers and broadcast desks with dedicated education reporters.',
    recipients: [
      { id: 'demo-edu-r-5', name: 'Holly Bennett', email: 'h.bennett@localgazette.co.uk', outlet: 'Local Gazette', position: 'Education Reporter' },
      { id: 'demo-edu-r-6', name: 'Aaron Shaw', email: 'a.shaw@regionalecho.co.uk', outlet: 'Regional Echo', position: 'News Editor' },
      { id: 'demo-edu-r-7', name: 'Grace Lin', email: 'g.lin@bbc.co.uk', outlet: 'BBC Regional News', position: 'Reporter' },
    ],
  },
];

const DEMO_RELEASES_EDUCATION = [
  {
    id: 'demo-edu-release-1',
    headline: 'Thameside Trust Schools Celebrate Record GCSE Results',
    slug: 'thameside-trust-record-gcse-results',
    campaignType: 'Seasonal',
    targetMarket: 'UK',
    audience: 'Local Press',
    status: 'Sent',
    sends: 412, opens: 201, clicks: 58,
    createdAt: daysAgo(18),
    updatedAt: daysAgo(15),
    bodyCopy: `Schools across the Thameside Multi-Academy Trust are celebrating their best-ever set of GCSE results this summer, with the proportion of pupils achieving grade 4 and above in English and maths rising for the third consecutive year.

Oakfield Secondary Academy and Northgate Community College both reported significant gains, with Oakfield seeing 92% of Year 11 pupils achieve grade 4+ in English and maths — up from 84% last year. Staff credit a renewed focus on targeted small-group support and a trust-wide reading intervention programme rolled out over the past two academic years.

"These results reflect the hard work of our pupils and the dedication of every member of staff across our schools," said the Trust's Director of Education. "We are especially proud of the progress made by pupils who joined us below expected standards and have gone on to exceed them."

The Trust says it will use the results to inform its improvement plans for the coming year, with a particular focus on widening access to STEM subjects at GCSE and A Level.

About Thameside Multi-Academy Trust:
Thameside Multi-Academy Trust supports eight schools across the region. For media enquiries contact comms@thamesidemat.org.uk.`,
  },
  {
    id: 'demo-edu-release-2',
    headline: 'Riverside Primary Launches Reading Recovery Programme Backed by Local Businesses',
    slug: 'riverside-primary-reading-recovery-programme',
    campaignType: 'Product Launch',
    targetMarket: 'UK',
    audience: 'Parents & Families',
    status: 'Ready',
    approvalStatus: 'approved',
    sends: 0, opens: 0, clicks: 0,
    createdAt: daysAgo(6),
    updatedAt: daysAgo(2),
    bodyCopy: `Riverside Primary School has launched a new Reading Recovery programme aimed at supporting pupils who fell behind in early literacy, funded through a partnership with three local businesses.

The programme pairs specially trained teaching assistants with small groups of pupils for daily 20-minute sessions, using a structured phonics approach shown to accelerate reading progress. Early results from a pilot group of Year 2 pupils show an average of eight months' reading age gained over a single term.

"Every child deserves to leave primary school as a confident reader," said the school's headteacher. "This partnership means we can give extra support to the pupils who need it most, without taking resources away from the rest of the class."

The scheme is being funded for its first two years by local sponsors, with the school hoping to secure further funding to extend it trust-wide.`,
  },
  {
    id: 'demo-edu-release-3',
    headline: 'Meadow View Special School Rated Outstanding by Ofsted',
    slug: 'meadow-view-special-school-ofsted-outstanding',
    campaignType: 'Award',
    targetMarket: 'UK',
    audience: 'Education Sector',
    status: 'Sent',
    sends: 289, opens: 134, clicks: 41,
    createdAt: daysAgo(40),
    updatedAt: daysAgo(33),
    bodyCopy: `Meadow View Special School has been rated 'Outstanding' in every category by Ofsted following its latest inspection, with inspectors singling out the school's approach to pupil wellbeing and personalised learning plans for particular praise.

Inspectors noted that pupils "make exceptional progress from their starting points" and praised the school's close working relationships with families and outside specialists. The report also highlighted staff training and a calm, consistent approach to behaviour support as key strengths.

"This is a wonderful recognition of the whole school community's commitment to our pupils," said the headteacher. "Every judgement reflects the exceptional care and skill our staff bring to work every day."

The full inspection report is available on the Ofsted website.`,
  },
];

const DEMO_SUBMISSIONS_EDUCATION = [
  {
    id: 'demo-edu-sub-1',
    partnerId: 'demo-edu-partner-1',
    partnerName: 'Riverside Primary School',
    partnerEmail: 'office@riversideprimary.sch.uk',
    title: 'Riverside Pupils Raise £2,400 for Local Foodbank in Sponsored Winter Walk',
    bodyCopy: `Pupils across Riverside Primary School took part in a sponsored winter walk last week, raising an incredible £2,400 for the local foodbank.

Every class walked a mile around the school field in the cold, with many pupils and families choosing to dress up in festive jumpers for the occasion. The event was organised by the School Council, who wanted to do something to help local families over the winter months.

"We're so proud of how much the whole school got behind this," said the School Council's Year 6 representatives. "Knowing we've helped families in our own community feels really special."

The school will be presenting the donation to the foodbank in person next week. We'd love this to be included in any local community or fundraising coverage — happy to provide photos with parental consent already confirmed.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'submitted',
    subjectConsentConfirmed: true,
    subjectConsentText: 'I confirm that written parental/guardian consent has been obtained for every pupil named or pictured in this submission, in line with the school\u2019s safeguarding and data protection policy, and that this consent is held on file at the school.',
    createdAt: daysAgo(4),
  },
  {
    id: 'demo-edu-sub-2',
    partnerId: 'demo-edu-partner-2',
    partnerName: 'Oakfield Secondary Academy',
    partnerEmail: 'comms@oakfieldacademy.sch.uk',
    title: 'Year 11 Students Achieve Best-Ever GCSE Results',
    bodyCopy: `Oakfield Secondary Academy is celebrating its best-ever set of GCSE results, with 92% of Year 11 students achieving grade 4 or above in both English and maths.

The cohort's progress has been particularly strong among students who joined the academy below expected standards in Year 7, with the school's targeted small-group intervention programme credited as a key factor.

"This group of students have worked incredibly hard, and it's brilliant to see that reflected in their results," said the Head of Year 11. "We're really proud of every one of them."

Happy to share more detail on the intervention programme for any feature on school improvement or attainment.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'reviewed',
    reviewNotes: 'Strong attainment story — good fit for the trust-wide GCSE results release.',
    subjectConsentConfirmed: true,
    subjectConsentText: 'I confirm that written parental/guardian consent has been obtained for every pupil named or pictured in this submission, in line with the school\u2019s safeguarding and data protection policy, and that this consent is held on file at the school.',
    createdAt: daysAgo(9),
    updatedAt: daysAgo(7),
  },
  {
    id: 'demo-edu-sub-3',
    partnerId: 'demo-edu-partner-3',
    partnerName: 'Greenwood Sixth Form College',
    partnerEmail: 'press@greenwoodsfc.ac.uk',
    title: 'Greenwood Students Secure Record Number of Russell Group University Offers',
    bodyCopy: `Greenwood Sixth Form College has recorded its highest-ever number of Russell Group university offers this year, with students securing places to study subjects ranging from medicine to law and engineering.

The college's dedicated careers and higher education team has expanded its one-to-one support over the past two years, including mock interviews with local professionals and additional support for students applying to competitive courses.

"Seeing our students achieve offers at this level is a testament to their ambition and the support they've had from staff throughout their time here," said the college's Head of Careers.

Happy to arrange interviews with students and staff for any feature on higher education access or careers guidance.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'submitted',
    subjectConsentConfirmed: true,
    subjectConsentText: 'I confirm that written parental/guardian consent has been obtained for every pupil named or pictured in this submission, in line with the school\u2019s safeguarding and data protection policy, and that this consent is held on file at the school.',
    createdAt: daysAgo(2),
  },
  {
    id: 'demo-edu-sub-4',
    partnerId: 'demo-edu-partner-4',
    partnerName: 'Meadow View Special School',
    partnerEmail: 'admin@meadowview.sch.uk',
    title: 'Meadow View Pupils Shine at Regional Inclusive Sports Festival',
    bodyCopy: `Pupils from Meadow View Special School took part in the regional Inclusive Sports Festival last month, with the school's team bringing home medals in swimming, boccia and athletics.

The festival, which brings together special schools from across the region, gives pupils the chance to compete and take part in adapted sports events tailored to a range of needs and abilities. Staff say the event is one of the highlights of the school year.

"Watching our pupils take part with such enthusiasm and confidence is incredibly rewarding," said the school's PE lead. "Events like this are so important for building self-esteem alongside physical skills."

This story ties in well with our recent Ofsted 'Outstanding' rating and would be a nice addition to any inclusive education or SEND feature.`,
    tagIds: [],
    imageUrls: [],
    imageStoragePaths: [],
    imageMetadata: [],
    status: 'used',
    usedInReleaseIds: ['demo-edu-release-3'],
    subjectConsentConfirmed: true,
    subjectConsentText: 'I confirm that written parental/guardian consent has been obtained for every pupil named or pictured in this submission, in line with the school\u2019s safeguarding and data protection policy, and that this consent is held on file at the school.',
    createdAt: daysAgo(30),
    updatedAt: daysAgo(25),
  },
];

type DemoDataset = {
  partners: typeof DEMO_PARTNERS_DMO;
  outletLists: typeof DEMO_OUTLET_LISTS_DMO;
  releases: typeof DEMO_RELEASES_DMO;
  submissions: Array<Record<string, unknown>>;
};

/**
 * Vertical-aware demo datasets. Verticals not listed here fall back to 'dmo'
 * (pre-existing behaviour, unchanged) — see writeDemoData().
 */
const DEMO_DATASETS: Record<string, DemoDataset> = {
  dmo: {
    partners: DEMO_PARTNERS_DMO,
    outletLists: DEMO_OUTLET_LISTS_DMO,
    releases: DEMO_RELEASES_DMO,
    submissions: DEMO_SUBMISSIONS_DMO,
  },
  education: {
    partners: DEMO_PARTNERS_EDUCATION,
    outletLists: DEMO_OUTLET_LISTS_EDUCATION,
    releases: DEMO_RELEASES_EDUCATION,
    submissions: DEMO_SUBMISSIONS_EDUCATION,
  },
};

function getDemoDataset(vertical: string | undefined): DemoDataset {
  return DEMO_DATASETS[vertical ?? 'dmo'] ?? DEMO_DATASETS.dmo;
}

// ---------------------------------------------------------------------------
// Cloud Functions
// ---------------------------------------------------------------------------

/**
 * Seed an organisation with realistic demo data.
 * Super-admin only. Safe to call on a freshly provisioned org.
 *
 * Input: { orgId: string }
 */
export const seedDemoData = functions
  .runWith({ timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);

    const { orgId } = data;
    if (!orgId) throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');

    const orgRef = db.collection('orgs').doc(orgId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) throw new functions.https.HttpsError('not-found', `Organisation ${orgId} not found.`);

    await writeDemoData(orgId);

    console.log(`[seedDemoData] Demo data seeded for org ${orgId} by ${context.auth!.uid}`);
    return { success: true };
  });

/**
 * Reset a demo organisation back to its pristine seeded state.
 * Deletes all releases, outletLists (+ recipients), submissions, sendJobs, and events,
 * then re-seeds with demo data. Users are preserved.
 *
 * Super-admin only.
 *
 * Input: { orgId: string }
 */
export const resetDemoOrg = functions
  .runWith({ timeoutSeconds: 180 })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);

    const { orgId } = data;
    if (!orgId) throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');

    const orgRef = db.collection('orgs').doc(orgId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) throw new functions.https.HttpsError('not-found', `Organisation ${orgId} not found.`);

    // 1. Delete content subcollections (preserve users)
    const collectionsToWipe = ['releases', 'submissions', 'sendJobs', 'events', 'content'];
    await Promise.all(collectionsToWipe.map((c) => deleteCollectionDocs(orgRef.collection(c))));

    // outletLists: delete recipients subcollection for each list first, then the list docs
    const listsSnap = await orgRef.collection('outletLists').get();
    await Promise.all(
      listsSnap.docs.map(async (listDoc) => {
        await deleteCollectionDocs(listDoc.ref.collection('recipients'));
        await listDoc.ref.delete();
      })
    );

    // 2. Re-seed
    await writeDemoData(orgId);

    console.log(`[resetDemoOrg] Org ${orgId} reset by ${context.auth!.uid}`);
    return { success: true };
  });

/** Write all demo data into an org, using the dataset matching its vertical. */
async function writeDemoData(orgId: string) {
  const orgRef = db.collection('orgs').doc(orgId);

  const orgDoc = await orgRef.get();
  const vertical = orgDoc.data()?.vertical as string | undefined;
  const dataset = getDemoDataset(vertical);

  // Partners (as user documents with role Partner)
  const partnerBatch = db.batch();
  for (const p of dataset.partners) {
    const initials = p.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    partnerBatch.set(orgRef.collection('users').doc(p.id), {
      id: p.id,
      orgId,
      email: p.email,
      name: p.name,
      initials,
      role: 'Partner',
      businessCategories: [p.category],
      createdAt: daysAgo(60),
    });
  }
  await partnerBatch.commit();

  // Releases
  const releaseBatch = db.batch();
  for (const r of dataset.releases) {
    releaseBatch.set(orgRef.collection('releases').doc(r.id), { ...r, orgId });
  }
  await releaseBatch.commit();

  // Outlet lists + recipients
  for (const list of dataset.outletLists) {
    const { recipients, ...listMeta } = list;
    await orgRef.collection('outletLists').doc(list.id).set({
      ...listMeta,
      orgId,
      recipientCount: recipients.length,
      createdAt: daysAgo(90),
    });
    const recipBatch = db.batch();
    for (const r of recipients) {
      recipBatch.set(
        orgRef.collection('outletLists').doc(list.id).collection('recipients').doc(r.id),
        { ...r, orgId, outletListId: list.id, createdAt: daysAgo(90) }
      );
    }
    await recipBatch.commit();
  }

  // Submissions
  const subBatch = db.batch();
  for (const s of dataset.submissions) {
    subBatch.set(orgRef.collection('submissions').doc(s.id as string), { ...s, orgId });
  }
  await subBatch.commit();
}
