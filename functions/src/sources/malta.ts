import type { SeedSource } from '../media-opportunity-config';

/**
 * Malta source pack, for Malta Tourism Authority. English-language Maltese outlets only, since
 * matching is English. Times of Malta, Malta Independent and MaltaToday return 403 to a
 * declared reader and are left out rather than worked around, which is a real gap: the brief
 * should say so in its limits.
 *
 * Every feed checked 2 October 2026 with the declared USER_AGENT and returned a current,
 * parseable document. Rejected: timesofmalta.com/rss, independent.com.mt/rss,
 * maltatoday.com.mt/rss (403); tvmnews.mt/en/feed/ (0 items); maltadaily.mt/feed/ (404).
 */
export const MALTA_SOURCES: SeedSource[] = [
  {
    id: 'lovin-malta',
    name: 'Lovin Malta',
    feedUrl: 'https://lovinmalta.com/feed/',
    siteUrl: 'https://lovinmalta.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Malta',
  },
  {
    id: 'newsbook-en',
    name: 'Newsbook (English)',
    feedUrl: 'https://newsbook.com.mt/en/feed/',
    siteUrl: 'https://newsbook.com.mt/en',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Malta',
  },
  {
    id: 'gozo-news',
    name: 'Gozo News',
    feedUrl: 'https://www.gozonews.com/feed/',
    siteUrl: 'https://www.gozonews.com',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Local'],
    region: 'Malta',
  },
  {
    id: 'malta-chamber',
    name: 'The Malta Chamber',
    feedUrl: 'https://www.maltachamber.org.mt/feed/',
    siteUrl: 'https://www.maltachamber.org.mt',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'trade',
    geographies: ['Regional'],
    region: 'Malta',
  },
];
