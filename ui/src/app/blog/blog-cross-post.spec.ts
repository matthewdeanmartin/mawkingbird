import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../platform/session/auth';
import { MataroaApi } from '../connections/mataroa/mataroa-api';
import { HugoPublish } from '../connections/hugo/hugo-publish';
import { HugoDeployWatch } from '../connections/hugo/hugo-deploy-watch';
import { BlueskyPublication } from '../publishing/write/bluesky-publication';
import { DraftMedia } from '../publishing/drafts';
import {
  availableCrossTargets,
  BlogCrossPost,
  CrossAvailability,
  crossPostText,
} from './blog-cross-post';

const none: CrossAvailability = {
  mastodonToken: true,
  bskyLinked: false,
  mataroaConnected: false,
  hugoConnected: false,
  mataroaEnabled: true,
  hugoEnabled: true,
};

describe('availableCrossTargets', () => {
  it('offers what is connected and switched on, in a fixed order', () => {
    expect(availableCrossTargets(none)).toEqual([]);
    expect(
      availableCrossTargets({
        ...none,
        bskyLinked: true,
        hugoConnected: true,
        mataroaConnected: true,
      }),
    ).toEqual(['mataroa', 'hugo', 'bsky']);
    expect(
      availableCrossTargets({ ...none, mataroaConnected: true, mataroaEnabled: false }),
    ).toEqual([]);
  });

  it('offers nothing without a Mastodon original to copy', () => {
    expect(availableCrossTargets({ ...none, mastodonToken: false, bskyLinked: true })).toEqual([]);
  });
});

describe('crossPostText', () => {
  it('titles from the first line and ends with the link back', () => {
    expect(
      crossPostText(['BLOG: Bees\nThey dance.', ' ', 'They make honey.'], 'https://x/1'),
    ).toEqual({
      title: 'Bees',
      body: 'They dance.\n\nThey make honey.\n\nOriginally posted on Mastodon: https://x/1',
    });
  });

  it('copes with a title-only post', () => {
    expect(crossPostText(['Just a title'], 'L')).toEqual({
      title: 'Just a title',
      body: 'Originally posted on Mastodon: L',
    });
  });
});

describe('BlogCrossPost', () => {
  const mataroa = { createPost: vi.fn() };
  const hugo = { publish: vi.fn() };
  const watch = { watch: vi.fn() };
  const bluesky = { publish: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        BlogCrossPost,
        { provide: MataroaApi, useValue: mataroa },
        { provide: HugoPublish, useValue: hugo },
        { provide: HugoDeployWatch, useValue: watch },
        { provide: BlueskyPublication, useValue: bluesky },
        { provide: Auth, useValue: { account: () => ({ id: '1' }) } },
      ],
    });
  });

  it('tries every target once and reports each, without throwing', async () => {
    mataroa.createPost.mockReturnValue(of({ ok: true }));
    hugo.publish.mockRejectedValue(new Error('token expired'));
    bluesky.publish.mockResolvedValue(undefined);
    const image = { file: new File([''], 'a.png', { type: 'image/png' }) } as DraftMedia;
    const video = { file: new File([''], 'a.mp4', { type: 'video/mp4' }) } as DraftMedia;
    const cross = TestBed.inject(BlogCrossPost);

    const results = await cross.run(['mataroa', 'hugo', 'bsky'], ['T\nbody', 'two'], 'L', [
      image,
      video,
    ]);

    expect(results).toEqual([
      { target: 'mataroa', ok: true },
      { target: 'hugo', ok: false, error: 'token expired' },
      { target: 'bsky', ok: true },
    ]);
    expect(cross.results()).toEqual(results);
    expect(cross.running()).toBe(false);
    expect(mataroa.createPost).toHaveBeenCalledWith(
      'T',
      'body\n\ntwo\n\nOriginally posted on Mastodon: L',
    );
    expect(bluesky.publish).toHaveBeenCalledWith(['T\nbody', 'two'], [image]);
    expect(watch.watch).not.toHaveBeenCalled();
  });

  it('reports a Mataroa failure the same way', async () => {
    mataroa.createPost.mockReturnValue(throwError(() => new Error('401')));
    const results = await TestBed.inject(BlogCrossPost).run(['mataroa'], ['T'], 'L');
    expect(results).toEqual([{ target: 'mataroa', ok: false, error: '401' }]);
  });

  it('does nothing with no targets', async () => {
    expect(await TestBed.inject(BlogCrossPost).run([], ['T'], 'L')).toEqual([]);
    expect(mataroa.createPost).not.toHaveBeenCalled();
  });
});
