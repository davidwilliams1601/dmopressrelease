import type { SeedSource } from '../media-opportunity-config';

/**
 * Portugal source pack, for Visit Portugal / Turismo de Portugal, and usable for Visit Madeira
 * or a regional Portuguese board. English-language press only: the expat titles cover tourism,
 * property and Algarve news heavily, which suits a tourism brief.
 *
 * Every feed checked 2 October 2026 with the declared USER_AGENT and returned a current,
 * parseable document. Rejected: madeiraislandnews.com (403/404); algarvedailynews.com/feed
 * (404, Joomla feed URL used instead).
 */
export const PORTUGAL_SOURCES: SeedSource[] = [
  {
    id: 'portugal-resident',
    name: 'Portugal Resident',
    feedUrl: 'https://www.portugalresident.com/feed/',
    siteUrl: 'https://www.portugalresident.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Portugal',
  },
  {
    id: 'the-portugal-news',
    name: 'The Portugal News',
    feedUrl: 'https://www.theportugalnews.com/rss',
    siteUrl: 'https://www.theportugalnews.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Portugal',
  },
  {
    id: 'algarve-daily-news',
    name: 'Algarve Daily News',
    feedUrl: 'https://algarvedailynews.com/news?format=feed&type=rss',
    siteUrl: 'https://algarvedailynews.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Local'],
    region: 'Portugal',
  },
  {
    id: 'portugal-com',
    name: 'Portugal.com',
    feedUrl: 'https://www.portugal.com/feed/',
    siteUrl: 'https://www.portugal.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional'],
    region: 'Portugal',
  },
];
