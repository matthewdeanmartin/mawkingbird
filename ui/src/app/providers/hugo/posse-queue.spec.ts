import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { excerptOf, POSSE_QUEUE_LIMIT, PosseQueue } from './posse-queue';

function status(over: Partial<Status> = {}): Status {
  return {
    id: '1',
    url: 'https://mastodon.social/@alice/1',
    content: '<p>Hello <strong>world</strong></p>',
    account: { acct: 'alice@dmv.community' },
    provider: 'mastodon',
    ...over,
  } as Status;
}

describe('excerptOf', () => {
  it('strips markup and collapses whitespace', () => {
    expect(excerptOf(status({ content: '<p>Hello   <strong>world</strong></p>' }))).toBe(
      'Hello world',
    );
  });

  it('decodes the entities Mastodon actually sends', () => {
    expect(excerptOf(status({ content: '<p>Tom &amp; Jerry &lt;3 &quot;quotes&quot;</p>' }))).toBe(
      'Tom & Jerry <3 "quotes"',
    );
  });

  it('turns line breaks into spaces rather than running words together', () => {
    expect(excerptOf(status({ content: 'one<br>two<br />three' }))).toBe('one two three');
  });

  it('truncates with an ellipsis', () => {
    const excerpt = excerptOf(status({ content: 'x'.repeat(300) }), 20);

    expect(excerpt).toHaveLength(20);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

describe('PosseQueue', () => {
  beforeEach(() => localStorage.clear());

  it('queues an interaction with everything needed to render it later', () => {
    const queue = TestBed.inject(PosseQueue);

    const entry = queue.add('like', status());

    expect(entry).toMatchObject({
      kind: 'like',
      targetUrl: 'https://mastodon.social/@alice/1',
      targetAuthor: 'alice@dmv.community',
      targetExcerpt: 'Hello world',
      provider: 'mastodon',
    });
    expect(queue.count()).toBe(1);
    expect(localStorage.getItem('mockingbird_posse_queue')).toContain('mastodon.social');
  });

  it('refuses a status with no canonical URL rather than inventing one', () => {
    const queue = TestBed.inject(PosseQueue);

    // A record must point at a real, permanent address. There is nothing to
    // point at here, and a made-up URL would be a dead link forever.
    expect(queue.add('like', status({ url: null }))).toBeNull();
    expect(queue.count()).toBe(0);
  });

  it('queues one record however many times you like the same post', () => {
    const queue = TestBed.inject(PosseQueue);

    queue.add('like', status());
    queue.add('like', status());

    expect(queue.count()).toBe(1);
  });

  it('keeps a like and a boost of the same post as separate records', () => {
    const queue = TestBed.inject(PosseQueue);

    queue.add('like', status());
    queue.add('repost', status());

    expect(queue.count()).toBe(2);
  });

  it('removes a still-queued entry when the interaction is undone', () => {
    const queue = TestBed.inject(PosseQueue);
    queue.add('like', status());

    queue.removeMatching('like', 'https://mastodon.social/@alice/1');

    // Liking and immediately un-liking leaves nothing behind.
    expect(queue.count()).toBe(0);
  });

  it('leaves other entries alone when one is undone', () => {
    const queue = TestBed.inject(PosseQueue);
    queue.add('like', status());
    queue.add('repost', status());

    queue.removeMatching('like', 'https://mastodon.social/@alice/1');

    expect(queue.entries().map((e) => e.kind)).toEqual(['repost']);
  });

  it('ignores an undo with no URL', () => {
    const queue = TestBed.inject(PosseQueue);
    queue.add('like', status());

    queue.removeMatching('like', null);

    expect(queue.count()).toBe(1);
  });

  it('clears only what a publish actually committed', () => {
    const queue = TestBed.inject(PosseQueue);
    const first = queue.add('like', status())!;
    queue.add('like', status({ url: 'https://mastodon.social/@bob/2' }));

    queue.clearPublished([first.id]);

    // A partial publish must not silently discard records that were never
    // written.
    expect(queue.count()).toBe(1);
    expect(queue.entries()[0].targetUrl).toBe('https://mastodon.social/@bob/2');
  });

  it('stops accepting entries at the limit rather than growing without bound', () => {
    const queue = TestBed.inject(PosseQueue);
    for (let i = 0; i < POSSE_QUEUE_LIMIT; i++) {
      queue.add('like', status({ url: `https://mastodon.social/@alice/${i}` }));
    }

    expect(
      queue.add('like', status({ url: 'https://mastodon.social/@alice/overflow' })),
    ).toBeNull();
    expect(queue.count()).toBe(POSSE_QUEUE_LIMIT);
  });

  it('reloads what was queued in an earlier session', () => {
    TestBed.inject(PosseQueue).add('like', status());

    // A fresh injector, as after a reload.
    TestBed.resetTestingModule();
    expect(TestBed.inject(PosseQueue).count()).toBe(1);
  });

  it('drops stored entries that could never be published', () => {
    localStorage.setItem(
      'mockingbird_posse_queue',
      JSON.stringify([
        { id: 'a', kind: 'like', targetUrl: 'https://example.com/1' },
        { id: 'b', kind: 'like' },
        { id: 'c', kind: 'nonsense', targetUrl: 'https://example.com/2' },
      ]),
    );

    expect(TestBed.inject(PosseQueue).count()).toBe(1);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('mockingbird_posse_queue', 'not json');

    expect(TestBed.inject(PosseQueue).count()).toBe(0);
  });
});
