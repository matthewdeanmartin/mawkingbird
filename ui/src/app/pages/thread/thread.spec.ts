import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Account, Context, Status } from '../../models';
import { Thread } from './thread';
import { anonymousStatusRouteRef } from '../../providers/anonymous/anonymous-route-ref';
import { settleRssCache } from '../../testing/settle-rss-cache';
import { TwitterApi } from '../../providers/twitter/twitter-api';
import { TwitterFeed } from '../../providers/twitter/twitter-feed';

interface ThreadInternals {
  status: WritableSignal<Status | null>;
  ancestors: WritableSignal<Status[]>;
  descendants: WritableSignal<Status[]>;
  loading: WritableSignal<boolean>;
}

function internals(fixture: ComponentFixture<Thread>): ThreadInternals {
  return fixture.componentInstance as unknown as ThreadInternals;
}

function makeStatus(id: string): Status {
  return {
    id,
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content: `<p>${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: '1', username: 'user', acct: 'user', display_name: 'User' } as never,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
  };
}

/** A status authored by a specific account (id + acct), for chat-partner tests. */
function makeStatusBy(id: string, authorId: string, acct: string): Status {
  const s = makeStatus(id);
  s.account = { id: authorId, username: acct, acct, display_name: acct } as never;
  return s;
}

function makeBskyStatus(id = 'bsky:at://did:plc:x/app.bsky.feed.post/1'): Status {
  return {
    ...makeStatus(id),
    provider: 'bluesky',
    providerRef: {
      uri: 'at://did:plc:x/app.bsky.feed.post/1',
      cid: 'cid-1',
      indexedAt: '2026-01-01T00:00:00Z',
      replyRoot: { uri: 'at://did:plc:x/app.bsky.feed.post/1', cid: 'cid-1' },
      replyParentUri: null,
      externalUri: null,
    },
  };
}

function makeContext(ancestors: Status[] = [], descendants: Status[] = []): Context {
  return { ancestors, descendants };
}

let httpMock: HttpTestingController;

function setUpWithId(
  statusId: string,
  queryParams: Record<string, string> = {},
): ComponentFixture<Thread> {
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: {
      paramMap: of(convertToParamMap({ id: statusId })),
      queryParamMap: of(convertToParamMap(queryParams)),
    },
  });
  httpMock = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(Thread);
  fixture.detectChanges();
  return fixture;
}

/**
 * Set up the page and capture what it asks the router to do.
 *
 * The spy has to be installed *after* `setUpWithId` — `TestBed.inject` before
 * `overrideProvider` instantiates the module and makes the override throw — but
 * the redirect fires during `detectChanges()` inside setUp. So the route is
 * overridden first, the component created without an initial change detection
 * pass, the spy installed, and only then is the component started.
 */
function setUpWatchingRouter(
  statusId: string,
  queryParams: Record<string, string> = {},
): { fixture: ComponentFixture<Thread>; navigate: ReturnType<typeof vi.fn> } {
  TestBed.overrideProvider(ActivatedRoute, {
    useValue: {
      paramMap: of(convertToParamMap({ id: statusId })),
      queryParamMap: of(convertToParamMap(queryParams)),
    },
  });
  httpMock = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(Thread);
  const navigate = vi.fn().mockResolvedValue(true);
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate);
  fixture.detectChanges();
  return { fixture, navigate };
}

describe('Thread', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ---------------------------------------------------------------- initial load

  it('fetches the status and its context on init', () => {
    const fixture = setUpWithId('100');

    httpMock.expectOne('/api/v1/statuses/100').flush(makeStatus('100'));
    httpMock
      .expectOne('/api/v1/statuses/100/context')
      .flush(makeContext([makeStatus('parent')], [makeStatus('child1'), makeStatus('child2')]));

    expect(internals(fixture).status()?.id).toBe('100');
    expect(
      internals(fixture)
        .ancestors()
        .map((s) => s.id),
    ).toEqual(['parent']);
    expect(
      internals(fixture)
        .descendants()
        .map((s) => s.id),
    ).toEqual(['child1', 'child2']);
    expect(internals(fixture).loading()).toBe(false);
  });

  it('loads an anonymous public thread from the source instance', () => {
    const id = anonymousStatusRouteRef({
      server: 'https://social.example',
      id: '100',
      originalUrl: 'https://social.example/@user/100',
    });
    const fixture = setUpWithId(id);

    const raw = makeStatus('100');
    raw.url = 'https://social.example/@user/100';
    raw.account.acct = 'user';
    httpMock.expectOne('https://social.example/api/v1/statuses/100').flush(raw);
    httpMock
      .expectOne('https://social.example/api/v1/statuses/100/context')
      .flush(makeContext([makeStatus('99')], [makeStatus('101')]));
    fixture.detectChanges();

    expect(internals(fixture).status()?.id).toBe('anonymous-mastodon:social.example:100');
    expect(internals(fixture).ancestors()[0].id).toBe('anonymous-mastodon:social.example:99');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-compose')).toBeNull();
    httpMock.expectNone((request) => request.url.startsWith('/api/'));
  });

  it('keeps an anonymous public post readable when its context endpoint rejects anonymous access', () => {
    const id = anonymousStatusRouteRef({ server: 'https://social.example', id: '100' });
    const fixture = setUpWithId(id);
    const raw = makeStatus('100');
    raw.account.acct = 'user';

    httpMock.expectOne('https://social.example/api/v1/statuses/100').flush(raw);
    httpMock
      .expectOne('https://social.example/api/v1/statuses/100/context')
      .flush('nope', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(internals(fixture).status()).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'did not make the surrounding conversation available anonymously',
    );
  });

  it('starts in loading state', () => {
    const fixture = setUpWithId('50');
    expect(internals(fixture).loading()).toBe(true);

    httpMock.expectOne('/api/v1/statuses/50').flush(makeStatus('50'));
    httpMock.expectOne('/api/v1/statuses/50/context').flush(makeContext());
  });

  // ---------------------------------------------------------------- onReply

  it('onReply: appends a new reply to descendants', () => {
    const fixture = setUpWithId('10');
    httpMock.expectOne('/api/v1/statuses/10').flush(makeStatus('10'));
    httpMock.expectOne('/api/v1/statuses/10/context').flush(makeContext([], [makeStatus('d1')]));

    fixture.componentInstance.onReply(makeStatus('new-reply'));

    expect(
      internals(fixture)
        .descendants()
        .map((s) => s.id),
    ).toEqual(['d1', 'new-reply']);
  });

  // ---------------------------------------------------------------- onChanged

  it('onChanged: updates the focused status', () => {
    const fixture = setUpWithId('10');
    httpMock.expectOne('/api/v1/statuses/10').flush(makeStatus('10'));
    httpMock.expectOne('/api/v1/statuses/10/context').flush(makeContext());

    const updated = { ...makeStatus('10'), favourited: true };
    fixture.componentInstance.onChanged(updated);

    expect(internals(fixture).status()?.favourited).toBe(true);
  });

  // ---------------------------------------------------------------- onContextChanged

  it('onContextChanged: patches a matching status in both ancestors and descendants', () => {
    const fixture = setUpWithId('5');
    httpMock.expectOne('/api/v1/statuses/5').flush(makeStatus('5'));
    httpMock
      .expectOne('/api/v1/statuses/5/context')
      .flush(makeContext([makeStatus('a1'), makeStatus('a2')], [makeStatus('d1')]));

    const updatedA2 = { ...makeStatus('a2'), bookmarked: true };
    fixture.componentInstance.onContextChanged(updatedA2);

    expect(internals(fixture).ancestors()[1].bookmarked).toBe(true);
    expect(internals(fixture).ancestors()[0].bookmarked).toBe(false); // untouched
  });

  // ---------------------------------------------------------------- onContextDeleted

  it('onContextDeleted: removes the status from both ancestors and descendants', () => {
    const fixture = setUpWithId('5');
    httpMock.expectOne('/api/v1/statuses/5').flush(makeStatus('5'));
    httpMock
      .expectOne('/api/v1/statuses/5/context')
      .flush(makeContext([makeStatus('a1')], [makeStatus('d1'), makeStatus('d2')]));

    fixture.componentInstance.onContextDeleted(makeStatus('d1'));

    expect(
      internals(fixture)
        .ancestors()
        .map((s) => s.id),
    ).toEqual(['a1']);
    expect(
      internals(fixture)
        .descendants()
        .map((s) => s.id),
    ).toEqual(['d2']);
  });

  // ---------------------------------------------------------------- onFocusedDeleted

  it('onFocusedDeleted: navigates to /home', () => {
    const fixture = setUpWithId('99');
    httpMock.expectOne('/api/v1/statuses/99').flush(makeStatus('99'));
    httpMock.expectOne('/api/v1/statuses/99/context').flush(makeContext());

    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigateByUrl');

    fixture.componentInstance.onFocusedDeleted();

    expect(spy).toHaveBeenCalledWith('/home');
  });

  // ------------------------------------------------------ hand-off to the reader
  //
  // Reader mode used to be a signal on this component. It is a page now
  // (`/read/:id`), so what this page owes the reader is a correct hand-off: the
  // link, and the redirect for anyone arriving on an old `?reader=1` URL. How
  // the document then *renders* is tested against the reader, not here — see
  // `pages/read/`.

  function selfReply(id: string, inReplyToId: string): Status {
    return { ...makeStatus(id), in_reply_to_id: inReplyToId };
  }

  it('offers a Reader link on a loaded thread, counting the author chain', () => {
    const fixture = setUpWithId('1');
    httpMock.expectOne('/api/v1/statuses/1').flush(makeStatus('1'));
    httpMock
      .expectOne('/api/v1/statuses/1/context')
      .flush(makeContext([], [selfReply('2', '1'), selfReply('3', '2')]));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const link = [...el.querySelectorAll<HTMLAnchorElement>('a.btn')].find((a) =>
      a.textContent?.includes('Thread reader'),
    );
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toContain('/statuses/1?reader=thread');
    expect(
      [...el.querySelectorAll<HTMLAnchorElement>('a.btn')]
        .find((a) => a.textContent?.includes('Long text reader'))
        ?.getAttribute('href'),
    ).toContain('/read/1');
    // The count is what tells someone the thing in front of them was written
    // as one piece rather than as three separate posts.
    expect(link!.textContent).toContain('3');
  });

  it('?reader=1 redirects to the reader page, replacing the history entry', () => {
    const { navigate } = setUpWatchingRouter('1', { reader: '1' });

    // `replaceUrl` is the part that matters: without it the thread URL stays on
    // the stack, so Back from the reader bounces straight forward again and the
    // reader is trapped.
    expect(navigate).toHaveBeenCalledWith(['/read', '1'], { replaceUrl: true });
  });

  it('keeps the classic thread reader separate, with the author chain and comments', () => {
    const { fixture, navigate } = setUpWatchingRouter('1', { reader: 'thread' });
    httpMock.expectOne('/api/v1/statuses/1').flush(makeStatus('1'));
    const comment = { ...makeStatusBy('comment', 'other', 'other'), in_reply_to_id: '1' };
    httpMock
      .expectOne('/api/v1/statuses/1/context')
      .flush(makeContext([], [selfReply('2', '1'), selfReply('3', '2'), comment]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelectorAll('.classic-thread-reader .reader-post')).toHaveLength(3);
    expect(element.querySelectorAll('app-status-card')).toHaveLength(1);
    expect(element.querySelector('app-status-card')?.textContent).toContain('comment');
    expect(element.querySelector('app-reader-core')).toBeNull();
  });

  it('redirects only once, though two route streams both ask', () => {
    // `applyReaderMode` runs from paramMap *and* queryParamMap. An unguarded
    // navigate re-enters through the second while the first is still settling.
    const { navigate } = setUpWatchingRouter('1', { reader: '1' });

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('does not redirect an ordinary thread view', () => {
    const { fixture, navigate } = setUpWatchingRouter('1');
    httpMock.expectOne('/api/v1/statuses/1').flush(makeStatus('1'));
    httpMock.expectOne('/api/v1/statuses/1/context').flush(makeContext());
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
  });

  function internalsWithChat(fixture: ComponentFixture<Thread>): { chatPartner: () => unknown } {
    return fixture.componentInstance as unknown as { chatPartner: () => unknown };
  }

  it('does not offer "open in chat" for an account that exists only on Twitter', async () => {
    const post: Status = {
      ...makeStatus('twitter:2083317461269598348'),
      provider: 'twitter',
      url: 'https://x.com/NASA/status/2083317461269598348',
    };
    TestBed.overrideProvider(TwitterFeed, {
      useValue: { hydrated: Promise.resolve(), findCached: () => post },
    });
    TestBed.overrideProvider(TwitterApi, {
      useValue: {
        getReplies: () => of({ statuses: [], cursor: null, hasMore: false, skipped: 0 }),
      },
    });
    const fixture = setUpWithId('twitter:2083317461269598348');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(internalsWithChat(fixture).chatPartner()).toBeNull();
  });

  it('uses the Bluesky reply composer beneath a Bluesky thread', () => {
    const fixture = setUpWithId('1');
    httpMock.expectOne('/api/v1/statuses/1').flush(makeStatus('1'));
    httpMock.expectOne('/api/v1/statuses/1/context').flush(makeContext());

    internals(fixture).status.set(makeBskyStatus());
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-bsky-reply')).not.toBeNull();
    expect(el.querySelector('app-compose')).toBeNull();
  });

  // ---------------------------------------------------------------------- RSS

  const RSS_FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:wfw="http://wellformedweb.org/CommentAPI/">
  <channel>
    <title>Test Blog</title>
    <link>https://blog.example.com</link>
    <item>
      <title>Hello world</title>
      <link>https://blog.example.com/hello</link>
      <guid>g1</guid>
      <description>&lt;p&gt;The article body&lt;/p&gt;</description>
      <wfw:commentRss>https://blog.example.com/hello/comments</wfw:commentRss>
    </item>
  </channel>
</rss>`;

  const COMMENT_FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Comments on Hello world</title>
    <item>
      <title>Comment by Dana</title>
      <guid>c1</guid>
      <dc:creator>Dana</dc:creator>
      <description>&lt;p&gt;Great post!&lt;/p&gt;</description>
    </item>
  </channel>
</rss>`;

  it('redirects an RSS item to the reader, which is what a feed item is', () => {
    // RSS items are articles, so they open in the reader unless the link says
    // ?reader=0. That used to mean "flip a signal"; it now means "go there".
    const id = 'rss:https://blog.example.com/feed.xml::g1';
    const { navigate } = setUpWatchingRouter(id);

    expect(navigate).toHaveBeenCalledWith(['/read', id], { replaceUrl: true });
  });

  it('?reader=0 keeps an RSS item on the thread view', async () => {
    const { fixture, navigate } = setUpWatchingRouter('rss:https://blog.example.com/feed.xml::g1', {
      reader: '0',
    });

    // The feed cache is consulted before the network, so the request is issued
    // on a microtask rather than synchronously during setUp.
    await settleRssCache();
    httpMock.expectOne('https://blog.example.com/feed.xml').flush(RSS_FEED);
    await settleRssCache();
    httpMock.expectOne('https://blog.example.com/hello/comments').flush(COMMENT_FEED);
    await settleRssCache();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(internals(fixture).status()?.id).toBe('rss:https://blog.example.com/feed.xml::g1');
  });

  it('loads a declared comment feed as replies', async () => {
    const fixture = setUpWithId('rss:https://blog.example.com/feed.xml::g1', { reader: '0' });

    await settleRssCache();
    httpMock.expectOne('https://blog.example.com/feed.xml').flush(RSS_FEED);
    await settleRssCache();
    httpMock.expectOne('https://blog.example.com/hello/comments').flush(COMMENT_FEED);
    await settleRssCache();
    fixture.detectChanges();

    // The comment became a descendant reply attributed to its author.
    const parentId = 'rss:https://blog.example.com/feed.xml::g1';
    const descendants = internals(fixture).descendants();
    expect(descendants).toHaveLength(1);
    expect(descendants[0].in_reply_to_id).toBe(parentId);
    expect(descendants[0].account.display_name).toBe('Dana');
  });

  it('offers a way back to the RSS reader, pointing at the feed it came from', async () => {
    // Leaving an article used to strand the reader on a page that looks like a
    // timeline, with no route back to /rss.
    const fixture = setUpWithId('rss:https://blog.example.com/feed.xml::g1', { reader: '0' });

    await settleRssCache();
    httpMock.expectOne('https://blog.example.com/feed.xml').flush(RSS_FEED);
    await settleRssCache();
    httpMock.expectOne('https://blog.example.com/hello/comments').flush(COMMENT_FEED);
    await settleRssCache();
    fixture.detectChanges();

    const back = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a.btn'),
    ).find((a) => a.textContent?.includes('Return to RSS reader'));

    expect(back).toBeTruthy();
    // The specific feed, not the pane's default, so the reader keeps their place.
    expect(back!.getAttribute('href')).toContain('/rss');
    expect(decodeURIComponent(back!.getAttribute('href')!)).toContain(
      'feed=https://blog.example.com/feed.xml',
    );
  });

  it('records that a feed declared no comment feed', async () => {
    const feedNoComments = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>B</title>
  <item><title>Post</title><link>https://b.example/p</link><guid>g9</guid>
  <description>&lt;p&gt;Body&lt;/p&gt;</description></item>
</channel></rss>`;
    const fixture = setUpWithId('rss:https://b.example/feed::g9', { reader: '0' });

    await settleRssCache();
    httpMock.expectOne('https://b.example/feed').flush(feedNoComments);
    await settleRssCache();
    fixture.detectChanges();

    expect(internals(fixture).descendants()).toHaveLength(0);
    expect(fixture.componentInstance['rssHasCommentFeed']()).toBe(false);
  });

  // ---------------------------------------------------------------- open in chat

  interface ChatInternals {
    chatKey: () => string | null;
    chatPartner: () => Account | null;
    chatQueryParams: () => Record<string, string> | null;
  }

  function chatInternals(fixture: ComponentFixture<Thread>): ChatInternals {
    return fixture.componentInstance as unknown as ChatInternals;
  }

  const ME: Account = { id: 'me', username: 'me', acct: 'me', display_name: 'Me' } as Account;

  it('offers "open in chat" for a two-person thread (me + one other)', () => {
    const fixture = setUpWithId('1');
    TestBed.inject(Auth).account.set(ME);
    // Focused post by the other person; my reply is a descendant.
    httpMock.expectOne('/api/v1/statuses/1').flush(makeStatusBy('1', 'them', 'them'));
    httpMock
      .expectOne('/api/v1/statuses/1/context')
      .flush(makeContext([], [makeStatusBy('2', 'me', 'me')]));
    fixture.detectChanges();

    expect(chatInternals(fixture).chatPartner()?.acct).toBe('them');
    expect(chatInternals(fixture).chatKey()).toBe('pub:them');
    expect(chatInternals(fixture).chatQueryParams()).toEqual({
      open: 'pub:them',
      with: 'them',
      context: '1',
    });
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      'a.btn[href*="/conversations"]',
    );
    expect(link?.textContent).toContain('Open in chat');
  });

  it('disables "open in chat" once a third voice joins the thread', () => {
    const fixture = setUpWithId('1');
    TestBed.inject(Auth).account.set(ME);
    httpMock.expectOne('/api/v1/statuses/1').flush(makeStatusBy('1', 'them', 'them'));
    httpMock
      .expectOne('/api/v1/statuses/1/context')
      .flush(makeContext([], [makeStatusBy('2', 'me', 'me'), makeStatusBy('3', 'other', 'other')]));
    fixture.detectChanges();

    expect(chatInternals(fixture).chatKey()).toBeNull();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a.btn[href*="/conversations"]')).toBeNull();
    expect(el.querySelector('button[disabled][title*="two-person"]')).not.toBeNull();
  });

  it('disables "open in chat" for a solo thread (only me)', () => {
    const fixture = setUpWithId('1');
    TestBed.inject(Auth).account.set(ME);
    httpMock.expectOne('/api/v1/statuses/1').flush(makeStatusBy('1', 'me', 'me'));
    httpMock.expectOne('/api/v1/statuses/1/context').flush(makeContext());
    fixture.detectChanges();

    expect(chatInternals(fixture).chatKey()).toBeNull();
  });

  it('hides "open in chat" entirely for a read-only RSS thread, rather than showing it disabled', async () => {
    // ?reader=0: without it an RSS id hands off to the reader and this page
    // never renders the toolbar under test.
    const fixture = setUpWithId('rss:https://blog.example.com/feed.xml::g1', { reader: '0' });

    await settleRssCache();
    httpMock.expectOne('https://blog.example.com/feed.xml').flush(RSS_FEED);
    await settleRssCache();
    httpMock.expectOne('https://blog.example.com/hello/comments').flush(COMMENT_FEED);
    await settleRssCache();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a.btn[href*="/conversations"]')).toBeNull();
    // The disabled variant must be gone too, not just the enabled one — a
    // permanently-inert control on every RSS view is noise, not information.
    expect(el.querySelector('button[disabled][title*="two-person"]')).toBeNull();
  });

  it('does not offer chat for a Bluesky thread', () => {
    // Load a plain Mastodon thread, then swap the focused post for a bsky one:
    // a bsky post routes to a different DM system and must disqualify.
    const fixture = setUpWithId('1');
    TestBed.inject(Auth).account.set(ME);
    httpMock.expectOne('/api/v1/statuses/1').flush(makeStatusBy('1', 'them', 'them'));
    httpMock.expectOne('/api/v1/statuses/1/context').flush(makeContext());

    internals(fixture).status.set(makeBskyStatus());
    fixture.detectChanges();
    expect(chatInternals(fixture).chatKey()).toBeNull();
  });
});

/**
 * Post ids are per-server, and unlike an account a post has no portable
 * identifier to re-resolve it by. So the 404 here is a dead end — but it must
 * be an explained one, not a spinner that never stops (the load previously had
 * no error handler at all).
 */
describe('Thread cross-server dead end', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  afterEach(() => httpMock.verify());

  it('stops loading and explains a 404 rather than spinning forever', () => {
    const fixture = setUpWithId('999');
    httpMock
      .expectOne('/api/v1/statuses/999')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    httpMock
      .match((r) => r.url === '/api/v1/statuses/999/context')
      .forEach((r) => r.flush({ ancestors: [], descendants: [] }));
    fixture.detectChanges();

    const view = fixture.componentInstance as unknown as { loadError: () => string | null };
    expect(internals(fixture).loading()).toBe(false);
    expect(view.loadError()).toContain('isn’t on the server');

    // And it offers the way out the reader can actually take.
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.thread-error-actions a[href="/home"]')).toBeTruthy();
  });
});
