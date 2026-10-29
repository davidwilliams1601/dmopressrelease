import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTranquilityDataset, demoPeerBenchmark } from '../demo-tranquility';
import { COVERAGE_MEDIA_TYPES, COVERAGE_OUTLET_TYPES, COVERAGE_TONES } from '../coverage-core';

const NOW = Date.UTC(2026, 10, 2, 9, 0, 0);
const ds = buildTranquilityDataset(NOW);

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object' && !(value instanceof Date)) {
    Object.values(value as Record<string, unknown>).forEach((v) => collectStrings(v, out));
  }
  return out;
}
const allStrings = collectStrings(ds);

test('every email address uses the reserved .example TLD', () => {
  const emails = allStrings.flatMap((s) => (s.match(/[\w.+-]+@[\w.-]+/g) || []).map((e) => e.replace(/\.+$/, "")));
  assert.ok(emails.length > 20);
  for (const e of emails) assert.match(e, /\.example$/, `real-looking email: ${e}`);
});

test('every link uses the reserved .example TLD', () => {
  const urls = allStrings.flatMap((s) => s.match(/https?:\/\/[^\s)]+/g) || []);
  assert.ok(urls.length > 10);
  for (const u of urls) assert.match(new URL(u).hostname, /\.example$/, `real-looking URL: ${u}`);
});

test('no leftovers from the retired Cornwall dataset', () => {
  const banned = /cornw|cornish|st ives|eden project|tate|rick ?stein|falmouth|padstow|newquay|kernow/i;
  for (const s of allStrings) assert.doesNotMatch(s, banned, s.slice(0, 80));
});

test('references between records resolve', () => {
  const partnerIds = new Set(ds.partners.map((p) => p.id));
  const releaseIds = new Set(ds.releases.map((r) => r.id as string));
  for (const s of ds.submissions) assert.ok(partnerIds.has(s.partnerId as string));
  for (const c of ds.coverage) {
    for (const id of c.partnerIds as string[]) assert.ok(partnerIds.has(id), id);
    if (c.releaseId) assert.ok(releaseIds.has(c.releaseId as string));
  }
  for (const o of ds.opportunities) {
    for (const id of o.matchedReleaseIds as string[]) assert.ok(releaseIds.has(id), id);
  }
});

test('coverage records use the controlled vocabulary and sit in the past', () => {
  for (const c of ds.coverage) {
    assert.ok((COVERAGE_MEDIA_TYPES as readonly string[]).includes(c.mediaType as string));
    assert.ok((COVERAGE_OUTLET_TYPES as readonly string[]).includes(c.outletType as string));
    assert.ok((COVERAGE_TONES as readonly string[]).includes(c.tone as string));
    assert.ok((c.publishedAtMs as number) < NOW);
  }
});

test('opportunities carry at least two evidence items each', () => {
  assert.ok(ds.opportunities.length >= 3);
  for (const o of ds.opportunities) assert.ok((o.evidence as unknown[]).length >= 2);
});

test('approved releases are tagged so recommendations can be generated', () => {
  const ready = ds.releases.filter((r) => r.status === 'Ready');
  assert.ok(ready.length >= 1);
  for (const r of ready) {
    const sd = r.smartDistribution as { editorialFocus: string[] };
    assert.ok(sd.editorialFocus.length > 0);
  }
});

test('IDs are unique within each collection', () => {
  const groups = [ds.partners, ds.releases, ds.submissions, ds.coverage, ds.opportunities, ds.networkContacts];
  for (const g of groups) {
    const ids = g.map((x: any) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  const recipientIds = ds.outletLists.flatMap((l) => l.recipients.map((r) => r.id));
  assert.equal(new Set(recipientIds).size, recipientIds.length);
});

test('demo peer benchmark positions the org against fixed figures', () => {
  assert.equal(demoPeerBenchmark(12).position, 'above');
  assert.equal(demoPeerBenchmark(5).position, 'within');
  assert.equal(demoPeerBenchmark(1).position, 'below');
});
