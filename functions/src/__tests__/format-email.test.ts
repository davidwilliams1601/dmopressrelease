/**
 * Snapshot-style tests for the journalist email.
 *
 * Run with `npm test` in functions/ (compiles to .test-build/ via tsconfig.test.json,
 * then node --test). No Firebase emulator or network needed: email-template.ts has
 * no firebase-admin/functions imports.
 *
 * What these pin down:
 *  1. A release with no notes and an org with no contact renders NO new sections —
 *     the "existing customers see zero change" contract (spec AC1/AC3).
 *  2. Section order: body → video → ENDS → Notes → About → Media contact.
 *  3. Blank-string contact (child-org default) renders nothing.
 *  4. Escaping and linkify apply to notes exactly as they do to the body.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEmailHtml, formatEmailText } from '../email-template';

const recipient = { name: 'Jo Reporter', email: 'jo@example.com', outlet: 'The Kent Times' };

const baseOrg = {
  name: 'Visit Kent',
  boilerplate: 'Visit Kent is the destination management organisation for Kent.',
  branding: {},
  tier: 'starter',
};

const baseRelease = {
  id: 'r1',
  headline: 'Kent named top UK coastal destination',
  bodyCopy: 'First paragraph.\n\nSecond paragraph with a link https://visitkent.co.uk/news?a=1&b=2',
};

function indexOfAll(html: string, needles: string[]): number[] {
  return needles.map((n) => {
    const i = html.indexOf(n);
    assert.notEqual(i, -1, `expected to find "${n}" in output`);
    return i;
  });
}

function assertAscending(nums: number[], label: string) {
  for (let i = 1; i < nums.length; i++) {
    assert.ok(nums[i] > nums[i - 1], `${label}: section ${i} appears before section ${i - 1}`);
  }
}

test('release with no notes and org without contact renders no ENDS, Notes or Media contact', () => {
  const html = formatEmailHtml(baseRelease, recipient, baseOrg);
  assert.equal(html.includes('>ENDS<'), false);
  assert.equal(html.includes('Notes to editors'), false);
  assert.equal(html.includes('Media contact'), false);
  // Boilerplate still present exactly as before.
  assert.ok(html.includes('About Visit Kent:'));

  const text = formatEmailText(baseRelease, baseOrg);
  assert.equal(text.includes('ENDS'), false);
  assert.equal(text.includes('Notes to editors'), false);
  assert.equal(text.includes('Media contact'), false);
});

test('org boilerplate alone does NOT trigger ENDS', () => {
  const html = formatEmailHtml({ ...baseRelease, notesToEditors: '' }, recipient, baseOrg);
  assert.equal(html.includes('>ENDS<'), false);
});

test('blank-string pressContact (child-org default) renders no Media contact block', () => {
  const org = { ...baseOrg, pressContact: { name: '', email: '', phone: '   ' } };
  const html = formatEmailHtml(baseRelease, recipient, org);
  assert.equal(html.includes('Media contact'), false);
  assert.equal(formatEmailText(baseRelease, org).includes('Media contact'), false);
});

test('full release renders sections in the fixed order', () => {
  const org = {
    ...baseOrg,
    pressContact: { name: 'Sophie Hewitt', email: 'press@visitkent.co.uk', phone: '07947 820420' },
  };
  const release = {
    ...baseRelease,
    videoUrl: 'https://storage.example.com/video.mp4',
    videoMetadata: { durationSeconds: 42, size: 12 * 1024 * 1024 },
    notesToEditors: 'About MASANAS: see https://example.org/about?x=1&y=2\n\nInterviews available on request.',
  };

  const html = formatEmailHtml(release, recipient, org);
  const positions = indexOfAll(html, [
    'First paragraph.',
    'Download the video',
    '>ENDS<',
    'Notes to editors',
    'About Visit Kent:',
    'Media contact',
    'This email was sent to',
  ]);
  assertAscending(positions, 'html');

  // Contact lines, with mailto/tel hrefs and the display value preserved.
  assert.ok(html.includes('Sophie Hewitt'));
  assert.ok(html.includes('href="mailto:press@visitkent.co.uk"'));
  assert.ok(html.includes('href="tel:07947820420"'));
  assert.ok(html.includes('>07947 820420<'));

  // Notes get the same escape + linkify treatment as the body (he encodes as hex entities).
  assert.ok(html.includes('<a href="https://example.org/about?x=1&#x26;y=2"'));
  assert.equal(html.includes('&y=2"'), false, 'raw ampersand must be escaped');

  const text = formatEmailText(release, org);
  assertAscending(
    indexOfAll(text, ['First paragraph.', 'ENDS', 'Notes to editors', 'About Visit Kent', 'Media contact', '07947 820420']),
    'text'
  );
});

test('notes to editors escapes HTML', () => {
  const release = { ...baseRelease, notesToEditors: '<script>alert(1)</script> & co' };
  const html = formatEmailHtml(release, recipient, baseOrg);
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&#x3C;script&#x3E;'));
});

test('contact with only a phone number renders just the phone', () => {
  const org = { ...baseOrg, pressContact: { name: '', email: '', phone: '+44 20 7946 0000' } };
  const html = formatEmailHtml(baseRelease, recipient, org);
  assert.ok(html.includes('Media contact'));
  assert.ok(html.includes('href="tel:+442079460000"'));
  assert.equal(html.includes('mailto:'), false);
});
