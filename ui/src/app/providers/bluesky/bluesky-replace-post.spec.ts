import { describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { BlueskyApi } from './bluesky-api';
import { BskyPostView } from './bluesky-types';
import { replaceBlueskyPost } from './bluesky-replace-post';

const post = {
  indexedAt: '2026-01-01T00:00:00Z',
  uri: 'at://did:plc:me/app.bsky.feed.post/old',
  cid: 'old-cid',
  author: { did: 'did:plc:me', handle: 'me.test' },
  record: {
    $type: 'app.bsky.feed.post',
    text: 'old',
    createdAt: '2026-01-01T00:00:00Z',
    langs: ['de'],
    labels: { values: [{ val: 'sexual' }] },
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{ image: { ref: { $link: 'blob' } }, alt: 'Alt text' }],
    },
    reply: { root: { uri: 'root', cid: 'root-cid' }, parent: { uri: 'parent', cid: 'parent-cid' } },
  },
} as BskyPostView;

describe('Bluesky post replacement', () => {
  it('preserves metadata and replaces the post in one transaction with stable retry identity', async () => {
    const request = vi.fn().mockReturnValue(of({}));
    const api = { request } as unknown as BlueskyApi;
    await replaceBlueskyPost(api, post, 'new #tag', 'operation');
    await replaceBlueskyPost(api, post, 'new #tag', 'operation');
    const [method, body] = request.mock.calls[0];
    expect(method).toBe('com.atproto.repo.applyWrites');
    expect(body.repo).toBe('did:plc:me');
    expect(body.writes).toHaveLength(2);
    expect(body.writes[0].value).toMatchObject({
      ...post.record,
      text: 'new #tag',
      createdAt: expect.any(String),
      facets: expect.any(Array),
    });
    expect(body.writes[0].value.facets).toHaveLength(1);
    expect(body.writes[0].rkey).not.toBe('old');
    expect(body.writes[0].rkey).toBe(request.mock.calls[1][1].writes[0].rkey);
    expect(body.writes[1]).toEqual({
      $type: 'com.atproto.repo.applyWrites#delete',
      collection: 'app.bsky.feed.post',
      rkey: 'old',
    });
  });

  it('rejects oversized text before writing', async () => {
    const request = vi.fn();
    await expect(
      replaceBlueskyPost({ request } as unknown as BlueskyApi, post, 'x'.repeat(301), 'op'),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('propagates transaction failure without a separate destructive delete', async () => {
    const request = vi.fn().mockReturnValue(throwError(() => new Error('offline')));
    await expect(
      replaceBlueskyPost({ request } as unknown as BlueskyApi, post, 'new', 'op'),
    ).rejects.toThrow('offline');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('com.atproto.repo.applyWrites');
  });
});
