import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildOpportunityDraftSeed,
  keywordsOf,
  rankMembersForOpportunity,
  type OpportunityLike,
} from '../opportunity-draft-core';

const NOW = Date.UTC(2026, 8, 20);
const DAY = 24 * 60 * 60 * 1000;

const opp: OpportunityLike = {
  id: 'o1',
  title: 'English sparkling wine tourism grows on the coast',
  suggestedAction: 'build_case_study',
  topicTags: ['Food & drink', 'Tourism & travel'],
  geographyTags: ['Kent'],
  matchedTopics: ['Food & drink'],
};

test('the app copy of opportunity-draft-core is byte-identical to the functions copy', () => {
  const a = fs.readFileSync(path.join(process.cwd(), 'src/opportunity-draft-core.ts'), 'utf8');
  const b = fs.readFileSync(path.join(process.cwd(), '../src/lib/opportunity-draft-core.ts'), 'utf8');
  assert.equal(a, b);
});

test('the seed is a working title and bracketed prompts, with holding text flagged', () => {
  const seed = buildOpportunityDraftSeed(opp);
  assert.match(seed.headline, /^Working title: /);
  assert.equal(seed.hasHoldingText, true);
  assert.ok(seed.bodyCopy.split('\n\n').every((l) => l.startsWith('[') && l.endsWith(']')));
  assert.match(seed.bodyCopy, /member/i);
});

test('members are named as a prompt, never written into a quote', () => {
  const seed = buildOpportunityDraftSeed(opp, [{ memberName: 'Chapel Down' }]);
  assert.match(seed.bodyCopy, /local face: Chapel Down\. Ask before naming them/);
  assert.doesNotMatch(seed.bodyCopy, /"Chapel Down/);
});

test('the action shapes the scaffold', () => {
  const comment = buildOpportunityDraftSeed({ ...opp, suggestedAction: 'prepare_comment' });
  assert.match(comment.bodyCopy, /spokesperson/);
  assert.notEqual(comment.bodyCopy, buildOpportunityDraftSeed(opp).bodyCopy);
});

test('keywords drop short and stop words', () => {
  assert.deepEqual(keywordsOf('The new wine trail and the coast'), ['wine', 'trail', 'coast']);
});

test('category, story themes, geography and keywords all score, with reasons', () => {
  const ranked = rankMembersForOpportunity({
    opportunity: opp,
    nowMs: NOW,
    members: [
      { id: 'm1', name: 'Chapel Down', businessCategories: ['Food & drink'], businessDescription: 'Winery in Kent making sparkling wine' },
      { id: 'm2', name: 'Canterbury Museum', businessCategories: ['Heritage'], businessDescription: 'Museum' },
      { id: 'm3', name: 'Coastal Cafe', businessCategories: [], businessDescription: 'Cafe on the coast' },
    ],
    stories: [
      { id: 's1', partnerId: 'm1', title: 'Harvest opens', aiThemes: ['Food & drink'], createdAtMs: NOW - 10 * DAY },
    ],
  });
  assert.deepEqual(ranked.map((r) => r.memberId), ['m1', 'm3']);
  const top = ranked[0];
  assert.ok(top.reasons.some((r) => r.startsWith('Profile category')));
  assert.ok(top.reasons.some((r) => r.includes('recent story')));
  assert.ok(top.reasons.some((r) => r.includes('Kent')));
  assert.deepEqual(top.storyIds, ['s1']);
});

test('old and archived stories do not count', () => {
  const ranked = rankMembersForOpportunity({
    opportunity: { ...opp, title: 'x', geographyTags: [] },
    nowMs: NOW,
    members: [{ id: 'm1', name: 'A' }],
    stories: [
      { id: 's1', partnerId: 'm1', title: 'x', aiThemes: ['Food & drink'], createdAtMs: NOW - 400 * DAY },
      { id: 's2', partnerId: 'm1', title: 'x', aiThemes: ['Food & drink'], status: 'archived', createdAtMs: NOW },
    ],
  });
  assert.equal(ranked.length, 0);
});

test('the list is capped and stable on ties', () => {
  const members = Array.from({ length: 8 }, (_, i) => ({
    id: `m${i}`,
    name: `Member ${String.fromCharCode(72 - i)}`,
    businessCategories: ['Food & drink'],
  }));
  const ranked = rankMembersForOpportunity({ opportunity: opp, members, nowMs: NOW });
  assert.equal(ranked.length, 5);
  const names = ranked.map((r) => r.memberName);
  assert.deepEqual(names, [...names].sort());
});
