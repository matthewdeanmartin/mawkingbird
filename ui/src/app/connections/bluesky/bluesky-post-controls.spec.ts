import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { BlueskyPostControls } from './bluesky-post-controls';

const POST = 'at://did:plc:me/app.bsky.feed.post/3abc';
const GATE = 'app.bsky.feed.threadgate';
const POSTGATE = 'app.bsky.feed.postgate';

/**
 * Bluesky keeps reply and quote limits in records beside the post. Every write
 * reads first and keeps what it is not editing, so settings made on bsky.app
 * (list rules, hidden replies, detached quotes) survive a change made here.
 */
describe('BlueskyPostControls', () => {
  let stored: Record<string, unknown>;
  let request: ReturnType<typeof vi.fn>;
  let deleteRecord: ReturnType<typeof vi.fn>;
  let controls: BlueskyPostControls;

  beforeEach(() => {
    stored = {};
    request = vi.fn(() => of({}));
    deleteRecord = vi.fn(() => of({}));
    const get = vi.fn((_nsid: string, params: HttpParams) => {
      const value = stored[params.get('collection')!];
      return value
        ? of({ value })
        : throwError(
            () => new HttpErrorResponse({ status: 400, error: { error: 'RecordNotFound' } }),
          );
    });
    TestBed.configureTestingModule({
      providers: [{ provide: BlueskyApi, useValue: { get, request, deleteRecord } }],
    });
    controls = TestBed.inject(BlueskyPostControls);
  });

  function written(collection: string): Record<string, unknown> | undefined {
    const call = request.mock.calls.find(
      ([, body]) => (body as { collection: string }).collection === collection,
    );
    return call ? (call[1] as { record: Record<string, unknown> }).record : undefined;
  }

  it('reads no records as everyone may reply and quote', async () => {
    await expect(controls.read(POST)).resolves.toEqual({
      replies: 'everyone',
      quotes: true,
      lists: 0,
    });
  });

  it('writes nobody-may-reply and quotes off beside the post, at its record key', async () => {
    await controls.write(POST, { replies: 'nobody', quotes: false });

    const put = request.mock.calls.map(([nsid, body]) => [nsid, body]);
    expect(put.every(([nsid]) => nsid === 'com.atproto.repo.putRecord')).toBe(true);
    expect(request.mock.calls[0][1]).toMatchObject({ repo: 'did:plc:me', rkey: '3abc' });
    expect(written(GATE)).toMatchObject({ $type: GATE, post: POST, allow: [] });
    expect(written(POSTGATE)).toMatchObject({
      $type: POSTGATE,
      post: POST,
      embeddingRules: [{ $type: `${POSTGATE}#disableRule` }],
    });
  });

  it('writes reply rules and reads them back', async () => {
    await controls.write(POST, { replies: ['mention', 'following'], quotes: true });

    expect(written(GATE)?.['allow']).toEqual([
      { $type: `${GATE}#mentionRule` },
      { $type: `${GATE}#followingRule` },
    ]);
    // Quotes on with nothing detached is the default: no postgate is written.
    expect(written(POSTGATE)).toBeUndefined();

    stored[GATE] = written(GATE);
    await expect(controls.read(POST)).resolves.toMatchObject({
      replies: ['mention', 'following'],
    });
  });

  it('keeps hidden replies and list rules made elsewhere', async () => {
    stored[GATE] = {
      $type: GATE,
      post: POST,
      createdAt: '2026-01-01T00:00:00Z',
      allow: [{ $type: `${GATE}#listRule`, list: 'at://did:plc:me/app.bsky.graph.list/l' }],
      hiddenReplies: ['at://did:plc:x/app.bsky.feed.post/r'],
    };
    await expect(controls.read(POST)).resolves.toEqual({ replies: [], quotes: true, lists: 1 });

    await controls.write(POST, { replies: ['follower'], quotes: true });

    expect(written(GATE)).toEqual({
      $type: GATE,
      post: POST,
      createdAt: '2026-01-01T00:00:00Z',
      allow: [
        { $type: `${GATE}#followerRule` },
        { $type: `${GATE}#listRule`, list: 'at://did:plc:me/app.bsky.graph.list/l' },
      ],
      hiddenReplies: ['at://did:plc:x/app.bsky.feed.post/r'],
    });
  });

  it('deletes a gate that would only restate the defaults', async () => {
    stored[GATE] = { $type: GATE, post: POST, createdAt: 'x', allow: [] };
    stored[POSTGATE] = {
      $type: POSTGATE,
      post: POST,
      createdAt: 'x',
      embeddingRules: [{ $type: `${POSTGATE}#disableRule` }],
    };

    await controls.write(POST, { replies: 'everyone', quotes: true });

    expect(request).not.toHaveBeenCalled();
    expect(deleteRecord).toHaveBeenCalledWith(`at://did:plc:me/${GATE}/3abc`);
    expect(deleteRecord).toHaveBeenCalledWith(`at://did:plc:me/${POSTGATE}/3abc`);
  });

  it('hides and shows a reply in the thread, keeping the reply rules', async () => {
    stored[GATE] = { $type: GATE, post: POST, createdAt: 'x', allow: [] };
    const reply = 'at://did:plc:x/app.bsky.feed.post/r';

    await controls.setReplyHidden(POST, reply, true);
    expect(written(GATE)).toMatchObject({ allow: [], hiddenReplies: [reply] });
  });

  it('detaches the post from a quote without changing whether it may be quoted', async () => {
    const quote = 'at://did:plc:x/app.bsky.feed.post/q';

    await controls.setQuoteDetached(POST, quote, true);

    expect(written(POSTGATE)).toMatchObject({
      $type: POSTGATE,
      post: POST,
      detachedEmbeddingUris: [quote],
    });
    expect(written(POSTGATE)?.['embeddingRules']).toBeUndefined();
  });
});
