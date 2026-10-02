import type { SeedSource } from '../media-opportunity-config';

/**
 * UAE source pack, for Dubai Department of Economy and Tourism (Visit Dubai), and usable for
 * Abu Dhabi or other emirates. UAE national press covers every emirate, so the region is the
 * country, not the city.
 *
 * Every feed checked 2 October 2026 with the declared USER_AGENT and returned a current,
 * parseable document. Rejected: arabianbusiness.com, gulfbusiness.com, timeoutdubai.com,
 * hoteliermiddleeast.com (403); wam.ae/en/rss (0 items); ttnworldwide.com/rss (404).
 */
export const UAE_SOURCES: SeedSource[] = [
  {
    id: 'the-national-uae',
    name: 'The National',
    feedUrl: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml',
    siteUrl: 'https://www.thenationalnews.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'national-news',
    geographies: ['Regional', 'Local'],
    region: 'UAE',
  },
  {
    id: 'gulf-news',
    name: 'Gulf News',
    feedUrl: 'https://gulfnews.com/feed',
    siteUrl: 'https://gulfnews.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'national-news',
    geographies: ['Regional', 'Local'],
    region: 'UAE',
  },
  {
    id: 'khaleej-times',
    name: 'Khaleej Times',
    feedUrl: 'https://www.khaleejtimes.com/stories.rss',
    siteUrl: 'https://www.khaleejtimes.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'national-news',
    geographies: ['Regional', 'Local'],
    region: 'UAE',
  },
  {
    id: 'whats-on-uae',
    name: 'What’s On UAE',
    feedUrl: 'https://whatson.ae/feed/',
    siteUrl: 'https://whatson.ae',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Local'],
    region: 'UAE',
  },
];
