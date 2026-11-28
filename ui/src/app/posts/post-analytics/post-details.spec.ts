import { describe, expect, it } from 'vitest';
import { Status } from '../../platform/api/models';
import { postDetails, quoteRule } from './post-details';

const base = {
  id: '9',
  created_at: '2026-11-01T12:00:00Z',
  edited_at: null,
  spoiler_text: '',
  visibility: 'public',
  sensitive: false,
  media_attachments: [],
  quote_approval_policy: null,
  uri: 'https://far.example/users/zoe/statuses/9',
} as unknown as Status;

const row = (status: Status, label: string, homeId = true) =>
  postDetails(status, 'en', null, homeId).find((r) => r.label === label);

describe('postDetails', () => {
  it('says when the app is not shared instead of leaving the row out', () => {
    expect(row(base, 'client')).toEqual({ label: 'client', value: 'clientHidden' });
    expect(
      row({ ...base, application: { name: 'Ivory', website: 'javascript:x' } }, 'client'),
    ).toEqual({ label: 'client', value: 'Ivory', literal: true, href: undefined });
  });

  it('counts described attachments and drops the home id for anonymous reads', () => {
    const media = [
      { id: 'a', type: 'image', url: '', preview_url: '', description: 'A heron' },
      { id: 'b', type: 'image', url: '', preview_url: '', description: ' ' },
    ] as Status['media_attachments'];
    expect(row({ ...base, media_attachments: media }, 'media')?.params).toEqual({
      count: 2,
      described: 1,
    });
    expect(row(base, 'media')).toBeUndefined();
    expect(row(base, 'server')?.value).toBe('far.example');
    expect(row(base, 'id', false)).toBeUndefined();
  });

  it('reads the quote rule from quote_approval first, then the older policy', () => {
    expect(quoteRule({ ...base, quote_approval: { automatic: ['followers'] } })).toBe('followers');
    expect(quoteRule({ ...base, quote_approval: { automatic: [], manual: ['public'] } })).toBe(
      'manual',
    );
    expect(quoteRule({ ...base, quote_approval: { automatic: [] } })).toBe('nobody');
    expect(quoteRule({ ...base, quote_approval_policy: 'public' })).toBe('public');
    expect(quoteRule(base)).toBe('unknown');
  });
});
