import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARE_LINK_DEFAULT_TTL_DAYS,
  SHARE_LINK_MAX_TRACKED_VIEWERS,
  buildSharedBriefPayload,
  isNewViewer,
  resolveExpiry,
  shareLinkState,
  trackViewer,
} from '../brief-sharing-core';

const NOW = Date.UTC(2026, 8, 15, 9, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

// --- Link state -----------------------------------------------------------

test('a live link within its window is openable', () => {
  assert.deepEqual(shareLinkState({ revoked: false, expiresAtMs: NOW + DAY_MS }, NOW), {
    openable: true,
  });
});

test('a revoked link reports as revoked even after it has also expired', () => {
  // The reason matters: "withdrawn" is a decision David made and should be what he sees, not
  // an incidental expiry that happened later.
  const state = shareLinkState({ revoked: true, expiresAtMs: NOW - DAY_MS }, NOW);
  assert.deepEqual(state, { openable: false, reason: 'revoked' });
});

test('a link is closed on the instant it expires, not a day later', () => {
  assert.deepEqual(shareLinkState({ expiresAtMs: NOW }, NOW), {
    openable: false,
    reason: 'expired',
  });
  assert.deepEqual(shareLinkState({ expiresAtMs: NOW + 1 }, NOW), { openable: true });
});

test('a link with no expiry recorded stays openable rather than failing closed', () => {
  // Defensive: only reachable for a doc written by an older version of the function. A brief
  // already shared should not silently stop opening because a field is missing.
  assert.deepEqual(shareLinkState({}, NOW), { openable: true });
});

test('expiry defaults to the trade-show follow-up window and is clamped', () => {
  assert.equal(resolveExpiry(NOW), NOW + SHARE_LINK_DEFAULT_TTL_DAYS * DAY_MS);
  assert.equal(resolveExpiry(NOW, 7), NOW + 7 * DAY_MS);
  assert.equal(resolveExpiry(NOW, 0), NOW + DAY_MS); // below the floor
  assert.equal(resolveExpiry(NOW, 10_000), NOW + 365 * DAY_MS); // above the ceiling
  assert.equal(resolveExpiry(NOW, NaN), NOW + SHARE_LINK_DEFAULT_TTL_DAYS * DAY_MS);
});

// --- What a link holder may see ------------------------------------------

test('the internal sending gate never reaches the public payload', () => {
  // The single most important assertion in this file. sendability is our judgement about
  // whether the brief was worth their time; a prospect reading it would be reading our sales
  // notes, not a finding about their coverage.
  const payload = buildSharedBriefPayload({
    prospectName: 'Visit West',
    status: 'final',
    content: {
      windowDays: 30,
      totals: { themesFound: 4 },
      themes: [],
      gaps: ['One gap'],
      sendability: { sendable: false, failures: ['The window is filled'], checks: [] },
    },
  });

  assert.equal((payload.content as any).sendability, undefined);
  assert.equal(JSON.stringify(payload).includes('sendability'), false);
  assert.equal(JSON.stringify(payload).includes('The window is filled'), false);
});

test('a field added to a brief later is private by default', () => {
  // The payload is built by allow-list, so the next internal field someone hangs off a brief
  // record does not get published by the act of adding it.
  const payload = buildSharedBriefPayload({
    prospectName: 'Visit West',
    internalNotes: 'Emma is the budget holder; £900 replacement offer',
    dealValue: 900,
    content: { windowDays: 30, secretScore: 11 },
  });

  const serialised = JSON.stringify(payload);
  assert.equal(serialised.includes('Emma'), false);
  assert.equal(serialised.includes('dealValue'), false);
  assert.equal(serialised.includes('secretScore'), false);
});

test('the payload carries everything the document needs to render', () => {
  const payload = buildSharedBriefPayload({
    prospectName: 'Visit West',
    headline: 'Three themes moved without you',
    openingNote: 'Prepared ahead of WTM.',
    closingNote: 'Happy to run this weekly.',
    watchTermsUsed: ['Visit West', 'Visit Bristol'],
    generatedAt: { toMillis: () => NOW },
    content: {
      windowDays: 30,
      dataStartMs: NOW - 28 * DAY_MS,
      dataEndMs: NOW,
      dataSpanDays: 28,
      windowUnderfilled: false,
      totals: { themesFound: 3, themesWithoutMention: 2, sourcesRepresented: 5 },
      themes: [{ key: 'topic:Food & drink' }],
      appearances: [{ mediaItemId: 'x' }],
      gaps: ['Print-only coverage is not included.'],
      sourcesUsed: [{ id: 'bbc-bristol', name: 'BBC Bristol' }],
      generatorVersion: 'brief-1',
    },
  });

  assert.equal(payload.prospectName, 'Visit West');
  assert.equal(payload.headline, 'Three themes moved without you');
  assert.equal(payload.generatedAtMs, NOW);
  assert.deepEqual(payload.watchTermsUsed, ['Visit West', 'Visit Bristol']);
  const c = payload.content as any;
  assert.equal(c.dataSpanDays, 28);
  assert.equal(c.themes.length, 1);
  assert.equal(c.gaps.length, 1); // the limits travel with the document
  assert.equal(c.sourcesUsed.length, 1);
});

test('missing framing becomes empty strings rather than the word undefined', () => {
  const payload = buildSharedBriefPayload({ prospectName: 'Visit West', content: {} });
  assert.equal(payload.headline, '');
  assert.equal(payload.openingNote, '');
  assert.equal(payload.closingNote, '');
  assert.deepEqual(payload.watchTermsUsed, []);
  assert.equal(payload.generatedAtMs, null);
});

// --- Counting readers ----------------------------------------------------

test('the same browser reopening a link is not a second reader', () => {
  assert.equal(isNewViewer(['a1'], 'a1'), false);
  assert.equal(isNewViewer(['a1'], 'b2'), true);
});

test('an open with no viewer id counts as a distinct reader', () => {
  // Private browsing or storage disabled. Undercounting forwards is the worse error here:
  // the number exists to tell David the brief travelled.
  assert.equal(isNewViewer(['a1'], null), true);
  assert.equal(isNewViewer(['a1'], ''), true);
});

test('viewer ids are deduplicated, newest last, and capped', () => {
  assert.deepEqual(trackViewer(['a', 'b'], 'a'), ['b', 'a']);
  assert.deepEqual(trackViewer(['a'], null), ['a']);

  const many = Array.from({ length: SHARE_LINK_MAX_TRACKED_VIEWERS }, (_, i) => `v${i}`);
  const next = trackViewer(many, 'newest');
  assert.equal(next.length, SHARE_LINK_MAX_TRACKED_VIEWERS);
  assert.equal(next[next.length - 1], 'newest');
  assert.equal(next.includes('v0'), false); // oldest dropped
});
