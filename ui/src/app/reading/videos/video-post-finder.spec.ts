import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { postsAboutVideo, VideoPostFinder } from './video-post-finder';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { Status } from '../../platform/api/models';

const id = 'abcdefghijk';
const post = (key: string, url: string, at: string): Status =>
  ({
    id: key,
    url: `https://social.test/@a/${key}`,
    created_at: at,
    content: `<p><a href="${url}">${url}</a></p>`,
    media_attachments: [],
    account: { id: 'a', acct: 'a' },
  }) as unknown as Status;

describe('postsAboutVideo', () => {
  it('keeps posts whose video is this one, once each, newest first', () => {
    const a = post('1', `https://youtu.be/${id}`, '2026-11-01T00:00:00Z');
    const b = post('2', `https://www.youtube.com/watch?v=${id}&t=30`, '2026-11-02T00:00:00Z');
    const other = post('3', 'https://youtu.be/zzzzzzzzzzz', '2026-11-03T00:00:00Z');
    const boost = { ...post('4', '', '2026-11-04T00:00:00Z'), reblog: b } as Status;
    expect(
      postsAboutVideo(
        [
          [a, other],
          [b, boost],
        ],
        id,
      ).map((s) => s.id),
    ).toEqual(['2', '1']);
  });
});

describe('VideoPostFinder', () => {
  function setUp(kind: string, isAnonymous: boolean, api: Partial<Api>) {
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: Auth, useValue: { kind: () => kind, isAnonymous } },
      ],
    });
    return TestBed.inject(VideoPostFinder);
  }

  it('asks the link timeline and search, surviving a failing source', async () => {
    const hit = post('1', `https://youtu.be/${id}`, '2026-11-01T00:00:00Z');
    const api = {
      linkTimeline: vi.fn((url: string) =>
        url.includes('youtu.be') ? throwError(() => new Error('404')) : of([hit]),
      ),
      search: vi.fn(() => of({ statuses: [hit], accounts: [], hashtags: [] })),
    };
    const finder = setUp('mastodon', false, api as unknown as Api);
    expect((await firstValueFrom(finder.find(id))).map((s) => s.id)).toEqual(['1']);
    expect(api.linkTimeline).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${id}`);
  });

  it('is unavailable without a Mastodon account, and asks nothing', async () => {
    const api = { linkTimeline: vi.fn(), search: vi.fn() };
    const finder = setUp('mastodon', true, api as unknown as Api);
    expect(finder.available()).toBe(false);
    expect(await firstValueFrom(finder.find(id))).toEqual([]);
    expect(api.linkTimeline).not.toHaveBeenCalled();
  });
});
