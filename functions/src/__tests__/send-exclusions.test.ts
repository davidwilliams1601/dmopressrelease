import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EXCLUDED_RECIPIENTS,
  applyExclusions,
  parseExcludedRecipientRefs,
  recipientRefPath,
} from '../send-exclusions';

const ORG = 'org1';
const LISTS = ['listA', 'listB'];
const ref = (list: string, id: string) => recipientRefPath(ORG, list, id);

test('no exclusions when the field is absent', () => {
  assert.deepEqual(parseExcludedRecipientRefs(undefined, ORG, LISTS), { ok: true, refs: [] });
  assert.deepEqual(parseExcludedRecipientRefs(null, ORG, LISTS), { ok: true, refs: [] });
});

test('accepts and de-duplicates refs inside the selected lists', () => {
  const result = parseExcludedRecipientRefs(
    [ref('listA', 'r1'), ref('listB', 'r2'), ref('listA', 'r1')],
    ORG,
    LISTS
  );
  assert.deepEqual(result, { ok: true, refs: [ref('listA', 'r1'), ref('listB', 'r2')] });
});

test('rejects refs outside the selected lists or org', () => {
  assert.equal(parseExcludedRecipientRefs([ref('listC', 'r1')], ORG, LISTS).ok, false);
  assert.equal(parseExcludedRecipientRefs([recipientRefPath('otherOrg', 'listA', 'r1')], ORG, LISTS).ok, false);
});

test('rejects malformed input', () => {
  assert.equal(parseExcludedRecipientRefs('not-an-array', ORG, LISTS).ok, false);
  assert.equal(parseExcludedRecipientRefs([''], ORG, LISTS).ok, false);
  assert.equal(parseExcludedRecipientRefs([42], ORG, LISTS).ok, false);
  // A path that points below a recipient document is not a recipient.
  assert.equal(parseExcludedRecipientRefs([ref('listA', 'r1') + '/sub/doc'], ORG, LISTS).ok, false);
  // Prefix-only path with no recipient id.
  assert.equal(parseExcludedRecipientRefs([`orgs/${ORG}/outletLists/listA/recipients/`], ORG, LISTS).ok, false);
});

test('caps the number of exclusions', () => {
  const tooMany = Array.from({ length: MAX_EXCLUDED_RECIPIENTS + 1 }, (_, i) => ref('listA', `r${i}`));
  assert.equal(parseExcludedRecipientRefs(tooMany, ORG, LISTS).ok, false);
});

test('applyExclusions splits kept and excluded by recipientRef', () => {
  const recipients = [
    { recipientRef: ref('listA', 'r1'), email: 'a@example.com' },
    { recipientRef: ref('listA', 'r2'), email: 'b@example.com' },
    { recipientRef: ref('listB', 'r3'), email: 'c@example.com' },
  ];
  const { kept, excluded } = applyExclusions(recipients, [ref('listA', 'r2'), ref('listB', 'missing')]);
  assert.deepEqual(kept.map((r) => r.email), ['a@example.com', 'c@example.com']);
  assert.deepEqual(excluded.map((r) => r.email), ['b@example.com']);
});
