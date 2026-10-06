import type { SeedSource } from '../media-opportunity-config';

/**
 * Las Vegas source pack, for Las Vegas Convention and Visitors Authority. Six outlets so the
 * two-distinct-source momentum bar is easy to clear honestly. General news titles carry a lot
 * of crime and court reporting, which SENSITIVE_TERMS excludes.
 *
 * Every feed checked 2 October 2026 with the declared USER_AGENT and returned a current,
 * parseable document. Rejected: news3lv.com/rss (404); ktnv.com/index.rss (1 item only).
 */
export const LASVEGAS_SOURCES: SeedSource[] = [
  {
    id: 'las-vegas-review-journal',
    name: 'Las Vegas Review-Journal',
    feedUrl: 'https://www.reviewjournal.com/feed/',
    siteUrl: 'https://www.reviewjournal.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Las Vegas',
  },
  {
    id: 'las-vegas-sun',
    name: 'Las Vegas Sun',
    feedUrl: 'https://lasvegassun.com/feeds/headlines/all/',
    siteUrl: 'https://lasvegassun.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Las Vegas',
  },
  {
    id: 'klas-8newsnow',
    name: '8 News Now (KLAS)',
    feedUrl: 'https://www.8newsnow.com/feed/',
    siteUrl: 'https://www.8newsnow.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Las Vegas',
  },
  {
    id: 'fox5-vegas',
    name: 'FOX5 Vegas',
    feedUrl: 'https://www.fox5vegas.com/arc/outboundfeeds/rss/?outputType=xml',
    siteUrl: 'https://www.fox5vegas.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Las Vegas',
  },
  {
    id: 'eater-vegas',
    name: 'Eater Vegas',
    feedUrl: 'https://vegas.eater.com/rss/index.xml',
    siteUrl: 'https://vegas.eater.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Local'],
    region: 'Las Vegas',
  },
  {
    id: 'vital-vegas',
    name: 'Vital Vegas',
    feedUrl: 'https://vitalvegas.com/feed/',
    siteUrl: 'https://vitalvegas.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Local'],
    region: 'Las Vegas',
  },
];
