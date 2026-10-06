/**
 * Regional source packs, one file per region, so each prospect's media library is added and
 * reviewed in its own PR without every PR editing the same lines of media-opportunity-config.
 * Every source in a pack must carry `region`, and that region must be in SOURCE_REGIONS.
 */
import type { SeedSource } from '../media-opportunity-config';
import { JERSEY_SOURCES } from './jersey';
import { MALTA_SOURCES } from './malta';
import { PORTUGAL_SOURCES } from './portugal';
import { LASVEGAS_SOURCES } from './las-vegas';
import { UAE_SOURCES } from './uae';
import { UKIRELAND_SOURCES } from './uk-ireland';

export const REGIONAL_SOURCE_PACKS: SeedSource[] = [
  ...JERSEY_SOURCES,
  ...MALTA_SOURCES,
  ...PORTUGAL_SOURCES,
  ...LASVEGAS_SOURCES,
  ...UAE_SOURCES,
  ...UKIRELAND_SOURCES,
];
