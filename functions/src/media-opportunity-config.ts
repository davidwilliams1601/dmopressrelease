/**
 * Configuration for the Media Opportunities intelligence layer: the deterministic
 * keyword map used for tagging, the sensitive-subject exclusion list, the momentum
 * thresholds, and the seed source set.
 *
 * Everything in this file is deliberately readable and editable by a human. The MVP's
 * credibility rests on a comms lead being able to ask "why was this tagged that?" and
 * getting a literal answer — a term from this file, matched in a title or feed summary.
 * Embeddings and learned classifiers come later, on top of this, not instead of it.
 *
 * Topic and geography keys are the controlled-taxonomy labels from
 * src/lib/media-taxonomy.ts DEFAULT_MEDIA_TAXONOMY (`topics` and `geography`), so a
 * tagged item, a Recipient's editorial focus and a Release's smartDistribution tags all
 * share one vocabulary and can be intersected without translation.
 */

/** Bump when tagging, thresholds or matching change, so old cards stay explainable. */
export const GENERATOR_VERSION = 'mo-mvp-2';

// ---------------------------------------------------------------------------
// Momentum thresholds
// ---------------------------------------------------------------------------

/** Lookback for the "developing theme" test. */
export const DEVELOPING_WINDOW_DAYS = 7;
/** Lookback for the "emerging opportunity" test. */
export const EMERGING_WINDOW_HOURS = 72;

/** A theme needs at least this many items in the developing window to be considered. */
export const MIN_ITEMS_DEVELOPING = 2;
/** ...from at least this many distinct sources. One outlet repeating itself is not a theme. */
export const MIN_SOURCES_DEVELOPING = 2;
/** Distinct sources within EMERGING_WINDOW_HOURS to upgrade to "emerging opportunity". */
export const MIN_SOURCES_EMERGING = 3;

/** Hard cap per organisation per generation run. Precision over reach: a queue a comms
 *  lead can read in five minutes is the product; a firehose is the failure mode. */
export const MAX_OPPORTUNITIES_PER_RUN = 5;

/** How long a card stays actionable before it is expired by the next run. */
export const OPPORTUNITY_TTL_DAYS = 14;

/** Items older than this are never used as evidence, even if a feed re-lists them. */
export const MAX_ITEM_AGE_DAYS = 21;

/** A source that fails this many consecutive fetches is quarantined (disabled), not
 *  deleted, so the registry keeps a record of what stopped working and when. */
export const MAX_CONSECUTIVE_FAILURES = 8;

/** Feed fetch budget. A slow publisher must not take the whole run down with it. */
export const FEED_TIMEOUT_MS = 15000;

/** Politeness header on every fetch, with a contact route, as any well-behaved feed
 *  reader should send. We only ever read feeds that are published for syndication. */
export const USER_AGENT =
  'PressPilotFeedReader/1.0 (+https://press-pilot.com; feeds@press-pilot.com)';

// ---------------------------------------------------------------------------
// Deterministic tagging
// ---------------------------------------------------------------------------

/**
 * Topic label -> terms that indicate it. Matched case-insensitively on word boundaries
 * against the item title and the feed-supplied summary. Multi-word terms are matched as
 * phrases. Keys must stay in step with DEFAULT_MEDIA_TAXONOMY.topics.
 */
export const TOPIC_TERMS: Record<string, string[]> = {
  'Tourism & travel': [
    'tourism',
    'tourist',
    'visitor economy',
    'visitor numbers',
    'destination',
    'staycation',
    'short break',
    'day trip',
    'holiday',
    'travel trade',
    'inbound travel',
    'domestic tourism',
    'attraction',
    'hotel',
    'accommodation',
    'occupancy',
    'air route',
    'flight route',
    'cruise',
    'coach tour',
    'itinerary',
    'dmo',
    'tourist board',
  ],
  'Business & investment': [
    'investment',
    'funding',
    'grant',
    'regeneration',
    'levelling up',
    'growth plan',
    'business rates',
    'inward investment',
    'jobs boost',
    'expansion',
    'turnover',
    'trading update',
  ],
  'Retail openings': [
    'opens',
    'opening',
    'launches',
    'new store',
    'new shop',
    'high street',
    'town centre',
    'refurbishment',
    'reopens',
  ],
  'Food & drink': [
    'food and drink',
    'restaurant',
    'pub',
    'brewery',
    'distillery',
    'menu',
    'chef',
    'michelin',
    'farm shop',
    'produce',
    'food festival',
    'hospitality',
  ],
  'Arts & culture': [
    'museum',
    'gallery',
    'exhibition',
    'heritage',
    'theatre',
    'festival',
    'arts council',
    'historic',
    'castle',
    'cathedral',
    'library',
    'cultural',
  ],
  Sustainability: [
    'sustainability',
    'sustainable',
    'net zero',
    'carbon',
    'green tourism',
    'biodiversity',
    'rewilding',
    'coastal erosion',
    'climate',
    'ev charging',
    'active travel',
    'rail travel',
  ],
  'Health & wellbeing': [
    'wellbeing',
    'wellness',
    'mental health',
    'spa',
    'walking route',
    'cycling route',
    'outdoor activity',
    'accessible',
    'accessibility',
    'inclusive',
  ],
  Education: [
    'school',
    'college',
    'university',
    'apprenticeship',
    'skills shortage',
    'training',
    'curriculum',
    'students',
    'work experience',
  ],
  Sport: [
    'stadium',
    'match',
    'tournament',
    'marathon',
    'cycling event',
    'sporting event',
    'championship',
    'golf',
    'sailing',
  ],
  'Community & charity': [
    'volunteer',
    'community group',
    'charity',
    'fundraising',
    'donation',
    'social value',
    'cost of living',
  ],
};

/**
 * Geography label -> terms. Geography is coarse on purpose in the MVP: the controlled
 * taxonomy only has four values, and a source's own declared coverage does most of the
 * work. Per-destination precision comes from an org's watchlist terms instead.
 */
export const GEOGRAPHY_TERMS: Record<string, string[]> = {
  'National (UK)': [
    'uk',
    'britain',
    'british',
    'england',
    'scotland',
    'wales',
    'northern ireland',
    'westminster',
    'government',
    'nationwide',
  ],
  International: [
    'international',
    'global',
    'europe',
    'european',
    'overseas',
    'inbound market',
    'long-haul',
    'usa',
    'united states',
    'canada',
    'australia',
    'china',
    'india',
    'gulf',
    'middle east',
  ],
  Regional: [
    'region',
    'regional',
    'county',
    'countywide',
    'south east',
    'south west',
    'west of england',
    'north west',
    'midlands',
  ],
  Local: ['borough', 'council', 'town', 'village', 'parish', 'high street'],
};

/**
 * Subjects an organisation should not be nudged towards joining. Items matching these
 * are stored (so the registry stays honest about what a feed carried) but flagged
 * `sensitive` and excluded from opportunity generation.
 *
 * This is the single most important list in the feature. The fastest way to destroy a
 * membership body's trust is to suggest it attaches a member's marketing story to a
 * death, a crime or a disaster.
 */
export const SENSITIVE_TERMS: string[] = [
  'died',
  'dies',
  'death',
  'dead',
  'killed',
  'fatal',
  'murder',
  'manslaughter',
  'assault',
  'rape',
  'abuse',
  'paedophile',
  'grooming',
  'trafficking',
  'arrested',
  'charged with',
  'court',
  'sentenced',
  'jailed',
  'inquest',
  'coroner',
  'crash',
  'collision',
  'derailment',
  'drowned',
  'missing person',
  'terror',
  'terrorist',
  'shooting',
  'stabbing',
  'explosion',
  'evacuated',
  'wildfire',
  'earthquake',
  'flooding deaths',
  'outbreak',
  'epidemic',
  'redundancies',
  'administration',
  'insolvency',
  'liquidation',
  'strike action',
  'racism',
  'racist',
  'harassment',
  'lawsuit',
  'sues',
  'fraud',
  'scandal',
  'resigns',
  'sacked',
];

// ---------------------------------------------------------------------------
// Seed source set (tourism / DMO vertical)
// ---------------------------------------------------------------------------

export type SeedSource = {
  id: string;
  name: string;
  feedUrl: string;
  siteUrl?: string;
  format: 'rss' | 'atom';
  verticals: string[];
  outletType?: string;
  geographies?: string[];
  defaultTopics?: string[];
};

/**
 * The initial curated set, installed by the `seedMediaSources` callable. Small on
 * purpose — 20-40 dependable, syndication-friendly feeds beats a thousand brittle ones.
 * Every URL here was confirmed to return a parseable RSS/Atom document; anything that
 * blocked automated readers or had no feed was left out rather than worked around.
 */
export const SEED_SOURCES: SeedSource[] = [
  {
    id: 'ttg-media',
    name: 'TTG Media',
    feedUrl: 'https://www.ttgmedia.com/rss.xml',
    siteUrl: 'https://www.ttgmedia.com',
    format: 'rss',
    verticals: ['dmo', 'trade-body'],
    outletType: 'trade',
    geographies: ['National (UK)'],
    defaultTopics: ['Tourism & travel'],
  },
  {
    id: 'skift',
    name: 'Skift',
    feedUrl: 'https://skift.com/feed/',
    siteUrl: 'https://skift.com',
    format: 'rss',
    verticals: ['dmo', 'trade-body'],
    outletType: 'trade',
    geographies: ['International'],
    defaultTopics: ['Tourism & travel'],
  },
  {
    id: 'hospitality-net',
    name: 'Hospitality Net',
    feedUrl: 'https://www.hospitalitynet.org/rss/news.xml',
    siteUrl: 'https://www.hospitalitynet.org',
    format: 'rss',
    verticals: ['dmo', 'trade-body'],
    outletType: 'trade',
    geographies: ['International'],
    defaultTopics: ['Tourism & travel', 'Food & drink'],
  },
  {
    id: 'guardian-travel',
    name: 'The Guardian — Travel',
    feedUrl: 'https://www.theguardian.com/travel/rss',
    siteUrl: 'https://www.theguardian.com/travel',
    format: 'rss',
    verticals: ['dmo'],
    outletType: 'national-news',
    geographies: ['National (UK)'],
    defaultTopics: ['Tourism & travel'],
  },
  {
    id: 'independent-travel',
    name: 'The Independent — Travel',
    feedUrl: 'https://www.independent.co.uk/travel/rss',
    siteUrl: 'https://www.independent.co.uk/travel',
    format: 'rss',
    verticals: ['dmo'],
    outletType: 'national-news',
    geographies: ['National (UK)'],
    defaultTopics: ['Tourism & travel'],
  },
  {
    id: 'bbc-england',
    name: 'BBC News — England',
    feedUrl: 'https://feeds.bbci.co.uk/news/england/rss.xml',
    siteUrl: 'https://www.bbc.co.uk/news/england',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'national-news',
    geographies: ['Regional', 'National (UK)'],
  },
  {
    id: 'gov-uk-dcms',
    name: 'GOV.UK — DCMS',
    feedUrl:
      'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-for-culture-media-and-sport',
    siteUrl: 'https://www.gov.uk/government/organisations/department-for-culture-media-and-sport',
    format: 'atom',
    verticals: ['dmo', 'charity', 'trade-body'],
    outletType: 'trade',
    geographies: ['National (UK)'],
    defaultTopics: ['Tourism & travel', 'Arts & culture'],
  },
  {
    id: 'gov-uk-visitbritain',
    name: 'GOV.UK — VisitBritain',
    feedUrl: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=visitbritain',
    siteUrl: 'https://www.gov.uk/government/organisations/visitbritain',
    format: 'atom',
    verticals: ['dmo', 'trade-body'],
    outletType: 'trade',
    geographies: ['National (UK)'],
    defaultTopics: ['Tourism & travel'],
  },
  {
    id: 'gov-uk-historic-england',
    name: 'GOV.UK — Historic England',
    feedUrl: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=historic-england',
    siteUrl: 'https://www.gov.uk/government/organisations/historic-england',
    format: 'atom',
    verticals: ['dmo', 'charity', 'trade-body'],
    outletType: 'trade',
    geographies: ['National (UK)'],
    defaultTopics: ['Arts & culture'],
  },
  {
    id: 'blooloop',
    name: 'Blooloop',
    feedUrl: 'https://blooloop.com/feed/',
    siteUrl: 'https://blooloop.com',
    format: 'rss',
    verticals: ['dmo', 'trade-body'],
    outletType: 'trade',
    geographies: ['International'],
    defaultTopics: ['Tourism & travel', 'Arts & culture'],
  },
  {
    id: 'ukinbound',
    name: 'UKinbound',
    feedUrl: 'https://www.ukinbound.org/feed/',
    siteUrl: 'https://www.ukinbound.org',
    format: 'rss',
    verticals: ['dmo', 'trade-body'],
    outletType: 'trade',
    geographies: ['National (UK)'],
    defaultTopics: ['Tourism & travel'],
  },
  {
    id: 'tourism-alliance',
    name: 'Tourism Alliance',
    feedUrl: 'https://www.tourismalliance.com/feed/',
    siteUrl: 'https://www.tourismalliance.com',
    format: 'rss',
    verticals: ['dmo', 'trade-body'],
    outletType: 'trade',
    geographies: ['National (UK)'],
    defaultTopics: ['Tourism & travel', 'Business & investment'],
  },
  {
    id: 'travel-daily-news',
    name: 'TravelDailyNews',
    feedUrl: 'https://www.traveldailynews.com/feed/',
    siteUrl: 'https://www.traveldailynews.com',
    format: 'rss',
    verticals: ['dmo', 'trade-body'],
    outletType: 'trade',
    geographies: ['International'],
    defaultTopics: ['Tourism & travel'],
  },

  // -------------------------------------------------------------------------
  // Regional / local (South East). Added because a destination brief built only from
  // international trade press cannot honestly report whether a DMO was named: none of
  // the trade titles above cover a single English county, so "never named" was a fact
  // about the source set rather than about the organisation. These three are where a
  // Kent DMO, its attractions and its members are actually written about.
  //
  // General regional news carries a high proportion of crime and court reporting, which
  // SENSITIVE_TERMS excludes from generation. That is intended: the yield per feed is
  // lower here than for a trade title, and the items that survive are the visitor-economy
  // ones we want.
  // -------------------------------------------------------------------------
  {
    id: 'bbc-kent',
    name: 'BBC News — Kent',
    feedUrl: 'https://feeds.bbci.co.uk/news/england/kent/rss.xml',
    siteUrl: 'https://www.bbc.co.uk/news/england/kent',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
  },
  {
    id: 'kent-live-news',
    name: 'Kent Live',
    feedUrl: 'https://www.kentlive.news/news/?service=rss',
    siteUrl: 'https://www.kentlive.news',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
  },
  {
    id: 'kent-live-whats-on',
    name: 'Kent Live — What’s On',
    feedUrl: 'https://www.kentlive.news/whats-on/?service=rss',
    siteUrl: 'https://www.kentlive.news/whats-on',
    format: 'rss',
    verticals: ['dmo', 'trade-body'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    defaultTopics: ['Arts & culture'],
  },

  // -------------------------------------------------------------------------
  // Regional / local (West of England). Added for the Visit West destination brief, on the
  // same reasoning as the Kent set: a brief cannot honestly answer "was this organisation
  // named, or did the theme run without it?" unless the source set actually covers the
  // ground the organisation sits on. Visit West covers Bristol, Bath and the wider West of
  // England, so the set pairs each city with at least two independent outlets — the
  // two-distinct-source momentum bar cannot be cleared by one title repeating itself.
  //
  // Visit West's own sites (visitwest.co.uk, visitbristol.co.uk, visitbath.co.uk) are
  // deliberately absent: they return 403 to a declared reader, and a prospect's own
  // channels are not evidence of earned coverage in any case.
  //
  // As with Kent, general local news carries a lot of crime and court reporting that
  // SENSITIVE_TERMS excludes from generation. Lower yield per feed is the expected cost.
  // -------------------------------------------------------------------------
  {
    id: 'bbc-bristol',
    name: 'BBC News — Bristol',
    feedUrl: 'https://feeds.bbci.co.uk/news/england/bristol/rss.xml',
    siteUrl: 'https://www.bbc.co.uk/news/england/bristol',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
  },
  {
    id: 'bbc-somerset',
    name: 'BBC News — Somerset',
    feedUrl: 'https://feeds.bbci.co.uk/news/england/somerset/rss.xml',
    siteUrl: 'https://www.bbc.co.uk/news/england/somerset',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
  },
  {
    id: 'bristol-live-news',
    name: 'BristolLive',
    feedUrl: 'https://www.bristolpost.co.uk/news/?service=rss',
    siteUrl: 'https://www.bristolpost.co.uk',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
  },
  {
    id: 'bristol-live-whats-on',
    name: 'BristolLive — What’s On',
    feedUrl: 'https://www.bristolpost.co.uk/whats-on/?service=rss',
    siteUrl: 'https://www.bristolpost.co.uk/whats-on',
    format: 'rss',
    verticals: ['dmo', 'trade-body'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    defaultTopics: ['Arts & culture'],
  },
  {
    id: 'bristol-247',
    name: 'Bristol24/7',
    feedUrl: 'https://www.bristol247.com/feed/',
    siteUrl: 'https://www.bristol247.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body'],
    outletType: 'local-news',
    geographies: ['Local'],
    defaultTopics: ['Arts & culture'],
  },
  {
    id: 'bristol-cable',
    name: 'The Bristol Cable',
    feedUrl: 'https://www.thebristolcable.org/feed/',
    siteUrl: 'https://www.thebristolcable.org',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body'],
    outletType: 'local-news',
    geographies: ['Local'],
  },
  {
    id: 'somerset-live-news',
    name: 'SomersetLive',
    feedUrl: 'https://www.somersetlive.co.uk/news/?service=rss',
    siteUrl: 'https://www.somersetlive.co.uk',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
  },
  {
    id: 'bath-echo',
    name: 'Bath Echo',
    feedUrl: 'https://www.bathecho.co.uk/feed/',
    siteUrl: 'https://www.bathecho.co.uk',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Local'],
  },
];

/**
 * Feeds checked and deliberately NOT included, kept here so the next person does not
 * spend an afternoon rediscovering it. The rule is: if a publisher does not want to be
 * read by an automated feed reader, we do not work around it.
 *
 *   Travel Weekly UK   — /rss/news returns 404 to a declared bot user-agent
 *   PhocusWire         — bot challenge on /rss
 *   Travel Daily Media — bot challenge on /feed
 *   TravelMole         — /feed serves the HTML site, no feed document
 *   The Caterer        — rate-limits automated readers, no stable feed path
 *   Museums Association— /feed/ is a valid but permanently empty RSS document
 *   VisitBritain corp  — no feed; the GOV.UK VisitBritain Atom feed is used instead
 *
 * Regional / South East candidates checked while adding the Kent feeds:
 *
 *   KentOnline         — /rss/ returns 410 Gone; /feed/ is a valid but empty document
 *   Kent County Council— no feed at /news/rss
 *   Visit Kent         — no feed on visitkent.co.uk (and a prospect's own site would
 *                        not be evidence of earned coverage anyway)
 *   Canterbury Cathedral — no feed at /feed/ or /news/feed/
 *   BBC South East     — no such regional feed; Kent is the closest BBC region
 *   Tourism South East — site has no feed
 *   The Argus          — a working feed, but Sussex rather than Kent; left out to keep
 *                        the Visit Kent brief's source set honest to its geography
 *   ALVA, Tourism Society, Group Leisure, VisitBritain news — no reachable feed
 *
 * West of England candidates checked while adding the Bristol / Bath feeds
 * (all checked 22 September 2026 with the declared USER_AGENT above):
 *
 *   Visit West / Visit Bristol / Visit Bath — 403 to a declared reader, and a prospect's
 *                        own channels are not evidence of earned coverage anyway
 *   Bath Chronicle      — /news/?service=rss serves the HTML site; its reporting appears
 *                        on SomersetLive, which is included instead
 *   West of England CA  — /feed/ is a valid but permanently empty RSS document
 *   Bristol City Council newsroom — no feed at /feed or /rss
 *   Insider Media South West — /rss/south-west serves HTML, no feed document
 *   Bath Newseum        — a working, fresh feed, but only ~5 items; held back to keep the
 *                        set tight. Add it if Bath themes repeatedly fail the
 *                        two-distinct-outlet bar
 *   Gazette Series (South Gloucestershire) — a working feed, but Yate/Thornbury rather
 *                        than the Bristol/Bath core; add only if Visit West's brief needs
 *                        wider West of England reach
 *   Bristol Business News, BusinessLive South West — could not be reached from the check
 *                        environment (DNS), so neither confirmed nor ruled out
 */
