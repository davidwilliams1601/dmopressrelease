import type { SeedSource } from '../media-opportunity-config';

/**
 * Jersey source pack, for Visit Jersey. Channel Islands press is self-contained, so a brief
 * can honestly say whether the island's tourism story ran with or without Visit Jersey.
 * Bailiwick Express covers Jersey and Guernsey; the Guernsey items are a small minority and
 * still regional context.
 *
 * Every feed checked 2 October 2026 with the declared USER_AGENT and returned a current,
 * parseable document. Rejected: guernseypress.com/feed/ (404), itv.com/news/channel/rss (timed
 * out), gov.je news RSS (404).
 */
export const JERSEY_SOURCES: SeedSource[] = [
  {
    id: 'jersey-evening-post',
    name: 'Jersey Evening Post',
    feedUrl: 'https://jerseyeveningpost.com/feed/',
    siteUrl: 'https://jerseyeveningpost.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Jersey',
  },
  {
    id: 'bbc-jersey',
    name: 'BBC News — Jersey',
    feedUrl: 'https://feeds.bbci.co.uk/news/world/europe/jersey/rss.xml',
    siteUrl: 'https://www.bbc.co.uk/news/world/europe/jersey',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Jersey',
  },
  {
    id: 'bailiwick-express',
    name: 'Bailiwick Express',
    feedUrl: 'https://www.bailiwickexpress.com/feed/',
    siteUrl: 'https://www.bailiwickexpress.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Jersey',
  },
];
