import type { RegionId } from '@/lib/types';

/**
 * Curated UK region/nation list — the controlled vocabulary for `Organization.region`.
 *
 * The field itself stays typed as `string` on Organization (not `RegionId`) so any
 * pre-existing free-text value written before this list existed still round-trips
 * without breaking type-checking. All UI surfaces that SET the field (org settings,
 * the super-admin Provision Org dialog) should offer only this list, though — the
 * point of the field is aggregation for regional trend/benchmarking products, which
 * only works if values are consistent (e.g. always "South West", never a mix of
 * "South West", "South West England", and "Cornwall" for the same geography).
 *
 * Ordered roughly north-to-south for England, followed by the other UK nations,
 * followed by the UK-wide option for national-remit orgs (e.g. Auris Tech, Visit
 * England-shaped network roots).
 */
export const REGIONS: { id: RegionId; label: string }[] = [
  { id: 'north-east', label: 'North East' },
  { id: 'north-west', label: 'North West' },
  { id: 'yorkshire-humber', label: 'Yorkshire and the Humber' },
  { id: 'east-midlands', label: 'East Midlands' },
  { id: 'west-midlands', label: 'West Midlands' },
  { id: 'east-of-england', label: 'East of England' },
  { id: 'london', label: 'London' },
  { id: 'south-east', label: 'South East' },
  { id: 'south-west', label: 'South West' },
  { id: 'scotland', label: 'Scotland' },
  { id: 'wales', label: 'Wales' },
  { id: 'northern-ireland', label: 'Northern Ireland' },
  { id: 'uk-wide', label: 'UK-wide / National' },
];

const REGION_LABELS: Record<string, string> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r.label])
);

/** Display label for a region id. Falls back to the raw stored value (handles legacy free text) or 'Not set'. */
export function getRegionLabel(region?: string | null): string {
  if (!region) return 'Not set';
  return REGION_LABELS[region] ?? region;
}
