import type { SeedSource } from '../media-opportunity-config';

/**
 * Isle of Man source pack, for Visit Isle of Man. The registry had no Isle of Man feed before
 * this. Island press is self-contained, and the Isle of Man is not part of the UK, so these
 * carry their own region rather than rolling up to 'UK & Ireland'.
 *
 * Both endpoints checked 20 November 2026 (public GET, RSS 2.0, current items). Staged
 * switched off and rights-pending: test Manx.News first, and add Manx Radio only after
 * checking how much it duplicates.
 */
export const ISLE_OF_MAN_SOURCES: SeedSource[] = [
  {
    id: 'manx-news',
    name: 'Manx.News',
    feedUrl: 'https://www.manx.news/feed/',
    siteUrl: 'https://www.manx.news',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'local-news',
    geographies: ['Regional', 'Local'],
    region: 'Isle of Man',
    staging: {
      rightsRef: 'M01',
      note: 'First island source to trial. Also supplies copy to other media: label original reporting and cluster the same story across outlets.',
    },
  },
  {
    id: 'manx-radio-news',
    name: 'Manx Radio — Island News',
    feedUrl: 'https://www.manxradio.com/news/isle-of-man-news/feed.xml',
    siteUrl: 'https://www.manxradio.com/news/isle-of-man-news/',
    format: 'rss',
    verticals: ['dmo', 'charity', 'trade-body', 'education'],
    outletType: 'broadcast',
    geographies: ['Regional', 'Local'],
    region: 'Isle of Man',
    staging: {
      rightsRef: 'M02',
      note: 'Phase 2, after a duplication check against Manx.News. Large payload (200 items): cap it and exclude routine politics. RSS states newsroom copyright.',
    },
  },
];
