import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vetStatus } from './vet.mjs';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const pack = { languages: ['en'], maxAgeDays: 14, now: NOW };
const post = (extra = {}, account = {}) => ({
  id: '1',
  visibility: 'public',
  created_at: '2026-11-25T12:00:00Z',
  language: 'en',
  media_attachments: [],
  account: {
    id: 'a',
    discoverable: true,
    created_at: '2025-01-01T00:00:00Z',
    note: '',
    fields: [],
    ...account,
  },
  ...extra,
});

test('a public, recent post by a discoverable person is pre-vetted', () => {
  assert.deepEqual(vetStatus(post(), pack), { verdict: 'feature', reasons: [] });
});

test('skips people who opted out, and posts not made public', () => {
  assert.equal(vetStatus(post({}, { discoverable: false }), pack).verdict, 'skip');
  assert.equal(vetStatus(post({}, { indexable: false }), pack).verdict, 'skip');
  assert.equal(vetStatus(post({}, { note: '<p>Hi #NoBot</p>' }), pack).verdict, 'skip');
  assert.equal(vetStatus(post({ visibility: 'unlisted' }), pack).verdict, 'skip');
});

test('skips replies to others and old posts', () => {
  assert.equal(vetStatus(post({ in_reply_to_account_id: 'b' }), pack).verdict, 'skip');
  assert.equal(vetStatus(post({ in_reply_to_account_id: 'a' }), pack).verdict, 'feature');
  assert.equal(vetStatus(post({ created_at: '2026-10-01T00:00:00Z' }), pack).verdict, 'skip');
});

test('flags content warnings, missing alt text, bots, new accounts and other languages', () => {
  assert.equal(vetStatus(post({ spoiler_text: 'cw' }), pack).verdict, 'review');
  assert.equal(
    vetStatus(post({ media_attachments: [{ description: null }] }), pack).verdict,
    'review',
  );
  assert.equal(vetStatus(post({}, { bot: true }), pack).verdict, 'review');
  assert.equal(vetStatus(post({}, { created_at: '2026-11-24T00:00:00Z' }), pack).verdict, 'review');
  assert.equal(vetStatus(post({ language: 'de' }), pack).verdict, 'review');
});

test('vets the boosted post, not the booster', () => {
  const boost = post({ reblog: post({}, { discoverable: false }) });
  assert.equal(vetStatus(boost, pack).verdict, 'skip');
});
