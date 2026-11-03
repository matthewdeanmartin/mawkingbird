import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { BlueskyFeeds } from './bluesky-feeds';
import { BlueskyPds } from './bluesky-pds';
import { BskyRef } from './bluesky-types';

const FEED = 'at://did:plc:owner/app.bsky.feed.generator/cats';
const POST = 'at://did:plc:x/app.bsky.feed.post/1';

/**
 * "Show more / less like this" for feeds that ask for it. Feedback goes to the
 * feed's own service, proxied through the account's PDS.
 */
describe('Bluesky feed feedback', () => {
  let request: ReturnType<typeof vi.fn>;
  let feeds: BlueskyFeeds;

  beforeEach(() => {
    request = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BlueskyApi,
          useValue: {
            request,
            getFeed: () =>
              of({
                feed: [
                  {
                    post: {
                      uri: POST,
                      cid: 'c',
                      author: { did: 'did:plc:x', handle: 'x.bsky.social' },
                      record: { $type: 'app.bsky.feed.post', text: 'cat', createdAt: 'x' },
                      indexedAt: 'x',
                    },
                    feedContext: 'ctx-1',
                  },
                ],
              }),
          },
        },
        { provide: BlueskyPds, useValue: { resolve: () => of('https://pds.example') } },
      ],
    });
    feeds = TestBed.inject(BlueskyFeeds);
  });

  it('marks posts from a feed that accepts feedback, with the item’s context', async () => {
    const page = await new Promise<{ statuses: { providerRef?: unknown }[] }>((resolve) =>
      feeds
        .page({ uri: FEED, kind: 'feed', feedbackDid: 'did:web:cats.example' }, null)
        .subscribe(resolve),
    );
    expect((page.statuses[0].providerRef as BskyRef).feedFeedback).toEqual({
      generatorDid: 'did:web:cats.example',
      feedContext: 'ctx-1',
    });

    const plain = await new Promise<{ statuses: { providerRef?: unknown }[] }>((resolve) =>
      feeds.page({ uri: FEED, kind: 'feed' }, null).subscribe(resolve),
    );
    expect((plain.statuses[0].providerRef as BskyRef).feedFeedback).toBeUndefined();
  });

  it('sends the interaction to the feed service through the PDS', async () => {
    await new Promise((resolve) =>
      feeds
        .sendFeedback({ generatorDid: 'did:web:cats.example', feedContext: 'ctx-1' }, POST, false)
        .subscribe(resolve),
    );

    expect(request).toHaveBeenCalledWith(
      'app.bsky.feed.sendInteractions',
      {
        interactions: [
          { item: POST, event: 'app.bsky.feed.defs#requestLess', feedContext: 'ctx-1' },
        ],
      },
      { 'atproto-proxy': 'did:web:cats.example#bsky_fg' },
      'https://pds.example',
    );
  });
});
