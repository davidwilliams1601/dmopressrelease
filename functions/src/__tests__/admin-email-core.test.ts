import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMergeTags,
  bodyToHtml,
  buildAudience,
  selectOrgs,
  validateComposition,
  AudienceOrg,
  AudienceUser,
} from '../admin-email-core';

const orgs: AudienceOrg[] = [
  { id: 'kent', name: 'Visit Kent', tier: 'starter', vertical: 'dmo' },
  { id: 'auris', name: 'Auris Tech', tier: 'enterprise', vertical: 'education' },
  { id: 'legacy', name: 'Legacy DMO', tier: 'professional' },
  { id: 'demo', name: 'Visit Tranquility', tier: 'professional', vertical: 'dmo', isDemo: true },
];
const users: AudienceUser[] = [
  { id: 'u1', orgId: 'kent', name: 'Jane Smith', email: 'Jane@Kent.example', role: 'Admin' },
  { id: 'u2', orgId: 'kent', name: 'Tom', email: 'tom@kent.example', role: 'User', notificationPrefs: { platformUpdates: false } },
  { id: 'u3', orgId: 'kent', name: 'Partner Pat', email: 'pat@biz.example', role: 'Partner' },
  { id: 'u4', orgId: 'auris', name: 'Ann', email: 'ann@auris.example', role: 'Admin' },
  { id: 'u5', orgId: 'auris', name: 'Jane again', email: 'jane@kent.example', role: 'User' },
  { id: 'u6', orgId: 'legacy', name: 'No Email', email: '', role: 'Admin' },
  { id: 'u7', orgId: 'demo', name: 'Demo Admin', email: 'demo@tranquility.example', role: 'Admin' },
];

test('partners are never recipients', () => {
  const r = buildAudience(orgs, users, { roleScope: 'team' }, 'service');
  assert.ok(!r.recipients.some((x) => x.role === 'Partner'));
});

test('demo orgs are excluded from filtered sends unless asked for', () => {
  assert.ok(!selectOrgs(orgs, { roleScope: 'team' }).some((o) => o.id === 'demo'));
  assert.ok(selectOrgs(orgs, { roleScope: 'team', includeDemo: true }).some((o) => o.id === 'demo'));
  assert.ok(selectOrgs(orgs, { roleScope: 'team', orgIds: ['demo'] }).some((o) => o.id === 'demo'));
});

test('explicit org picks override filters', () => {
  const s = selectOrgs(orgs, { roleScope: 'team', orgIds: ['kent'], tiers: ['enterprise'] });
  assert.deepEqual(s.map((o) => o.id), ['kent']);
});

test('orgs without a vertical count as DMOs', () => {
  const s = selectOrgs(orgs, { roleScope: 'team', verticals: ['dmo'] });
  assert.deepEqual(s.map((o) => o.id).sort(), ['kent', 'legacy']);
});

test('product updates respect opt-out, service notices do not', () => {
  const product = buildAudience(orgs, users, { roleScope: 'team' }, 'product');
  const service = buildAudience(orgs, users, { roleScope: 'team' }, 'service');
  assert.ok(!product.recipients.some((x) => x.email === 'tom@kent.example'));
  assert.equal(product.skipped.optedOut, 1);
  assert.ok(service.recipients.some((x) => x.email === 'tom@kent.example'));
});

test('one email per person, missing addresses skipped', () => {
  const r = buildAudience(orgs, users, { roleScope: 'team' }, 'service');
  assert.equal(r.recipients.filter((x) => x.email === 'jane@kent.example').length, 1);
  assert.equal(r.skipped.duplicate, 1);
  assert.equal(r.skipped.noEmail, 1);
  assert.equal(r.skipped.orgsWithNoRecipients, 1);
});

test('admins-only scope', () => {
  const r = buildAudience(orgs, users, { roleScope: 'admins' }, 'service');
  assert.deepEqual(r.recipients.map((x) => x.email).sort(), ['ann@auris.example', 'jane@kent.example']);
});

test('merge tags personalise and fall back', () => {
  assert.equal(applyMergeTags('Hi {{first_name}} at {{ org_name }}', { name: 'Jane Smith', orgName: 'Visit Kent' }), 'Hi Jane at Visit Kent');
  assert.equal(applyMergeTags('Hi {{first_name}}', { name: '', orgName: 'X' }), 'Hi there');
  assert.equal(applyMergeTags('{{unknown}}', { name: 'a', orgName: 'b' }), '{{unknown}}');
});

test('body HTML escapes input and links URLs', () => {
  const html = bodyToHtml('Hello <b>you</b>\nline two\n\nSee https://press-pilot.com/new', '#123456');
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('<br>'));
  assert.equal((html.match(/<p /g) || []).length, 2);
  assert.ok(html.includes('<a href="https://press-pilot.com/new"'));
});

test('composition validation', () => {
  assert.deepEqual(validateComposition({ subject: 'Hi', body: 'Body', category: 'service', roleScope: 'team' }), []);
  assert.ok(validateComposition({ subject: '', body: '', category: 'x', roleScope: 'y' }).length >= 4);
  assert.ok(validateComposition({ subject: 'a\nb', body: 'x', category: 'service', roleScope: 'team' }).length === 1);
  assert.ok(validateComposition({ subject: 'a', body: 'x', category: 'service', roleScope: 'team', replyTo: 'nope' }).length === 1);
});
