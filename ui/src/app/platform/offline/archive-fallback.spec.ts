import { describe, expect, it, vi } from 'vitest';
import { Status } from '../api/models';
import { NativeProfilesApi } from '../session/native-profile-types';
import { archiveRequestFor, matches, olderThan, readArchive } from './archive-fallback';

function post(id: string, extra: Partial<Status> = {}): Status {
  return { id, in_reply_to_id: null, reblog: null, media_attachments: [], ...extra } as Status;
}

describe('archive fallback', () => {
  it('answers profile posts pages, but not pinned or newer-than pages', () => {
    expect(archiveRequestFor('/api/v1/accounts/42/statuses?max_id=100&limit=10')).toMatchObject({
      accountId: '42',
      maxId: '100',
      limit: 10,
    });
    expect(archiveRequestFor('/api/v1/accounts/42/statuses?pinned=true')).toBeNull();
    expect(archiveRequestFor('/api/v1/accounts/42/statuses?min_id=5')).toBeNull();
    expect(archiveRequestFor('/api/v1/accounts/@a@b/statuses')).toBeNull();
    expect(archiveRequestFor('/api/v1/timelines/home')).toBeNull();
  });

  it('compares Mastodon ids as numbers', () => {
    expect(olderThan('99', '100')).toBe(true);
    expect(olderThan('100', '99')).toBe(false);
    expect(olderThan('110', '111')).toBe(true);
  });

  it('honours the profile filters', () => {
    const request = archiveRequestFor(
      '/api/v1/accounts/42/statuses?exclude_replies=true&exclude_reblogs=true&only_media=true',
    )!;
    expect(matches(post('1', { in_reply_to_id: '9' }), request)).toBe(false);
    expect(matches(post('1', { reblog: post('2') }), request)).toBe(false);
    expect(matches(post('1'), request)).toBe(false);
    expect(matches(post('1', { media_attachments: [{}] as never }), request)).toBe(true);
  });

  it('pages through the archive until the answer is full', async () => {
    const all = Array.from({ length: 60 }, (_, i) => post(String(200 - i)));
    const accountPosts = vi.fn(async (_handle: string, _id: string, offset: number) =>
      all.slice(offset, offset + 40).map((status, i) => ({ localId: i, status, isRead: false })),
    );
    const profiles = { accountPosts } as unknown as NativeProfilesApi;
    const request = archiveRequestFor('/api/v1/accounts/42/statuses?max_id=170&limit=20')!;
    const found = await readArchive(profiles, 'native-mastodon:me', request);
    expect(found.map((s) => s.id)).toEqual(Array.from({ length: 20 }, (_, i) => String(169 - i)));
    expect(accountPosts).toHaveBeenCalledWith('native-mastodon:me', '42', 0);
    expect(accountPosts).toHaveBeenCalledWith('native-mastodon:me', '42', 40);
  });
});
