import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildSharedCoverageRecords,
  buildStoryFunnel,
  canonicalCoverageUrl,
  coverageToCsv,
  describeReportedAudience,
  extractCoverageMetadata,
  formatFunnelLine,
  inPeriod,
  isPrivateAddress,
  isPublicHttpUrl,
  normaliseThemes,
  summariseCoverage,
  validateCoverageInput,
  validateReportPeriod,
  type CoverageRecordLike,
} from '../coverage-core';

const NOW = Date.UTC(2026, 8, 23, 9, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function rec(overrides: Partial<CoverageRecordLike> = {}): CoverageRecordLike {
  return {
    id: 'c1',
    url: 'https://example.com/a',
    headline: 'Kent vineyard wins award',
    outletName: 'Kent Live',
    publishedAtMs: NOW - DAY,
    mediaType: 'online',
    outletType: 'regional',
    tone: 'positive',
    releaseId: 'r1',
    releaseHeadline: 'Award release',
    partnerIds: ['p1'],
    partnerNames: ['Chapel Down'],
    themes: ['Wine'],
    fromPressPilotSend: true,
    reportedAudience: null,
    reportedAudienceSource: null,
    ...overrides,
  };
}

// --- The two copies -------------------------------------------------------

test('the app copy of coverage-core is byte-identical to the functions copy', () => {
  const fnCopy = readFileSync(resolve(process.cwd(), 'src/coverage-core.ts'), 'utf8');
  const appCopy = readFileSync(resolve(process.cwd(), '../src/lib/coverage-core.ts'), 'utf8');
  assert.equal(appCopy, fnCopy, 'src/lib/coverage-core.ts has drifted from functions/src/coverage-core.ts');
});

// --- URLs -----------------------------------------------------------------

test('canonical URL drops tracking parameters, fragments, www and trailing slashes', () => {
  assert.equal(
    canonicalCoverageUrl('http://www.Example.com/news/story/?utm_source=x&b=2&a=1&fbclid=z#top'),
    'https://example.com/news/story?a=1&b=2'
  );
});

test('the same article logged via http and https canonicalises to one URL', () => {
  assert.equal(canonicalCoverageUrl('http://example.com/a'), canonicalCoverageUrl('https://example.com/a/'));
});

test('non-http links are not coverage URLs', () => {
  assert.equal(canonicalCoverageUrl('javascript:alert(1)'), null);
  assert.equal(canonicalCoverageUrl('ftp://example.com/x'), null);
  assert.equal(canonicalCoverageUrl('not a url'), null);
  assert.equal(canonicalCoverageUrl(''), null);
});

test('the metadata fetcher refuses private, loopback and odd-port targets', () => {
  assert.equal(isPublicHttpUrl('https://www.bbc.co.uk/news/x'), true);
  for (const bad of [
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://10.0.0.5/x',
    'http://192.168.1.1/x',
    'http://172.20.0.1/x',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/x',
    'http://metadata.google.internal/x',
    'https://example.com:8443/x',
    'https://user:pass@example.com/x',
    'file:///etc/passwd',
    'http://intranet/x',
  ]) {
    assert.equal(isPublicHttpUrl(bad), false, bad);
  }
});

test('private address detection covers IPv4-mapped IPv6', () => {
  assert.equal(isPrivateAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('fd00::1'), true);
});

// --- Metadata -------------------------------------------------------------

test('metadata reads og tags and strips the outlet suffix from the title', () => {
  const html = `<html><head>
    <meta property="og:title" content="Chapel Down named best English sparkling | Kent Live">
    <meta property="og:site_name" content="Kent Live">
    <meta property="article:published_time" content="2026-09-20T08:00:00Z">
    <meta content="/img/a.jpg" property="og:image">
    <link rel="canonical" href="https://www.kentlive.news/news/a?utm_source=rss">
  </head></html>`;
  const m = extractCoverageMetadata(html, 'https://www.kentlive.news/news/a');
  assert.equal(m.headline, 'Chapel Down named best English sparkling');
  assert.equal(m.outletName, 'Kent Live');
  assert.equal(m.publishedAtMs, Date.UTC(2026, 8, 20, 8, 0, 0));
  assert.equal(m.imageUrl, 'https://www.kentlive.news/img/a.jpg');
  assert.equal(m.canonicalUrl, 'https://kentlive.news/news/a');
});

test('metadata falls back to <title>, hostname and JSON-LD datePublished', () => {
  const html = `<title>Story &amp; more</title>
    <script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"NewsArticle","datePublished":"2026-09-01T10:00:00Z"}]}</script>`;
  const m = extractCoverageMetadata(html, 'https://www.example.org/x');
  assert.equal(m.headline, 'Story & more');
  assert.equal(m.outletName, 'example.org');
  assert.equal(m.publishedAtMs, Date.UTC(2026, 8, 1, 10, 0, 0));
});

test('metadata tolerates malformed JSON-LD and missing everything', () => {
  const m = extractCoverageMetadata('<script type="application/ld+json">{not json</script>', 'https://a.example/x');
  assert.equal(m.headline, null);
  assert.equal(m.publishedAtMs, null);
  assert.equal(m.outletName, 'a.example');
});

// --- Validation -----------------------------------------------------------

const valid = {
  url: 'https://example.com/a',
  headline: 'A story',
  outletName: 'Outlet',
  publishedAtMs: NOW - DAY,
  mediaType: 'online',
  outletType: 'regional',
  tone: 'positive',
};

test('a complete record validates', () => {
  assert.deepEqual(validateCoverageInput(valid, NOW), { ok: true, errors: [] });
});

test('print coverage without a URL is still valid', () => {
  assert.equal(validateCoverageInput({ ...valid, url: '', mediaType: 'print' }, NOW).ok, true);
});

test('missing headline, outlet, date and bad enums are each reported', () => {
  const r = validateCoverageInput({ url: 'nope' }, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 7);
});

test('a future published date is rejected, with two days of grace', () => {
  assert.equal(validateCoverageInput({ ...valid, publishedAtMs: NOW + DAY }, NOW).ok, true);
  assert.equal(validateCoverageInput({ ...valid, publishedAtMs: NOW + 3 * DAY }, NOW).ok, false);
});

test('a reported audience needs a named source', () => {
  const r = validateCoverageInput({ ...valid, reportedAudience: 50000 }, NOW);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /where the reported audience/);
  assert.equal(validateCoverageInput({ ...valid, reportedAudience: 50000, reportedAudienceSource: 'Publisher media pack' }, NOW).ok, true);
});

test('themes are trimmed, de-duplicated case-insensitively and capped', () => {
  assert.deepEqual(normaliseThemes(' Wine , wine,Food  tourism,\nHeritage'), ['Wine', 'Food tourism', 'Heritage']);
  assert.equal(normaliseThemes(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 10);
});

// --- Summary --------------------------------------------------------------

test('summary counts placements, distinct outlets, members and releases', () => {
  const s = summariseCoverage([
    rec(),
    rec({ id: 'c2', outletName: 'kent live ', partnerIds: ['p1', 'p2'], partnerNames: ['Chapel Down', 'The Pub'] }),
    rec({ id: 'c3', outletName: 'The Guardian', outletType: 'national', releaseId: 'r2', tone: 'sensitive', fromPressPilotSend: false }),
  ]);
  assert.equal(s.placements, 3);
  assert.equal(s.distinctOutlets, 2);
  assert.equal(s.membersFeatured, 2);
  assert.equal(s.releasesWithCoverage, 2);
  assert.equal(s.fromPressPilotSends, 2);
  assert.equal(s.positive, 2);
  assert.equal(s.sensitive, 1);
  assert.deepEqual(s.byMember[0], { key: 'p1', label: 'Chapel Down', count: 3 });
  assert.equal(s.topOutlets[0].label, 'Kent Live');
  assert.equal(s.byOutletType.find((r) => r.key === 'national')?.label, 'National');
});

test('reported audience is summed only where present and always described with its ratio', () => {
  const s = summariseCoverage([
    rec({ reportedAudience: 1_200_000, reportedAudienceSource: 'ABC' }),
    rec({ id: 'c2' }),
    rec({ id: 'c3' }),
  ]);
  assert.equal(s.reportedAudienceTotal, 1_200_000);
  assert.equal(s.reportedAudienceRecordCount, 1);
  assert.equal(describeReportedAudience(s), '1.2M audience reported by the outlets themselves (1 of 3 placements carry a figure)');
  assert.equal(describeReportedAudience(summariseCoverage([rec()])), null);
});

test('an empty period summarises to zeros rather than failing', () => {
  const s = summariseCoverage([]);
  assert.equal(s.placements, 0);
  assert.deepEqual(s.byTheme, []);
});

test('period filtering is inclusive at both ends', () => {
  const rs = [rec({ publishedAtMs: 100 }), rec({ publishedAtMs: 200 }), rec({ publishedAtMs: 300 })];
  assert.equal(inPeriod(rs, 100, 200).length, 2);
});

test('the funnel line reads as a board would read it', () => {
  const f = buildStoryFunnel({ submitted: 18, issued: 9, releasesPlaced: 6, placements: 14 });
  assert.equal(f.placementRate, 66.7);
  assert.equal(formatFunnelLine(f, { submitted: 'Stories submitted', issued: 'Releases issued' }), '18 stories submitted · 9 releases issued · 6 placed · 14 placements');
  assert.equal(buildStoryFunnel({ submitted: 0, issued: 0, releasesPlaced: 0, placements: 0 }).placementRate, null);
});

// --- CSV ------------------------------------------------------------------

test('CSV escapes quotes and commas and neutralises formula injection', () => {
  const csv = coverageToCsv([rec({ headline: 'Say "hello", Kent', notes: '=HYPERLINK("http://x")' })]);
  const [header, row] = csv.split('\r\n');
  assert.match(header, /^Published,Outlet,Headline/);
  assert.match(row, /"Say ""hello"", Kent"/);
  assert.match(row, /"'=HYPERLINK\(""http:\/\/x""\)"/);
});

test('CSV rows are newest first', () => {
  const csv = coverageToCsv([rec({ id: 'old', publishedAtMs: Date.UTC(2026, 0, 1), headline: 'Old' }), rec({ id: 'new', publishedAtMs: Date.UTC(2026, 5, 1), headline: 'New' })]);
  const lines = csv.split('\r\n');
  assert.match(lines[1], /^2026-06-01/);
  assert.match(lines[2], /^2026-01-01/);
});

// --- Shared payload -------------------------------------------------------

test('shared records are allow-listed: notes and authorship never leave', () => {
  const [out] = buildSharedCoverageRecords(
    [{ ...rec(), notes: 'internal: journalist was grumpy', createdById: 'u1', createdByName: 'David', canonicalUrl: 'x' }],
    { includeSensitive: false }
  );
  assert.equal('notes' in out, false);
  assert.equal('createdById' in out, false);
  assert.equal('createdByName' in out, false);
  assert.equal(out.partnerNames[0], 'Chapel Down');
});

test('sensitive placements are left out of a shared report unless asked for', () => {
  const input = [{ ...rec() }, { ...rec({ id: 'c2', tone: 'sensitive' }) }];
  assert.equal(buildSharedCoverageRecords(input, { includeSensitive: false }).length, 1);
  assert.equal(buildSharedCoverageRecords(input, { includeSensitive: true }).length, 2);
});

test('unknown enum values in stored data are coerced rather than passed through', () => {
  const [out] = buildSharedCoverageRecords([{ ...rec(), mediaType: 'hologram', tone: 'ecstatic' }], { includeSensitive: true });
  assert.equal(out.mediaType, 'other');
  assert.equal(out.tone, 'neutral');
});

test('report periods must be ordered and at most two years', () => {
  assert.equal(validateReportPeriod(NOW - 30 * DAY, NOW).ok, true);
  assert.equal(validateReportPeriod(NOW, NOW - DAY).ok, false);
  assert.equal(validateReportPeriod(NOW - 800 * DAY, NOW).ok, false);
  assert.equal(validateReportPeriod('x', NOW).ok, false);
});
