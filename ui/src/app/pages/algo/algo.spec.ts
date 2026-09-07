import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlgoFeed, AlgoPost, AlgoSource } from '../../algo-feed';
import { ClientPrefs } from '../../client-prefs';
import { LocalModeration } from '../../local-moderation';
import { MutedPosts } from '../../muted-posts';
import { Status } from '../../models';
import { Algo } from './algo';

function makeStatus(id: string, content = `<p>${id}</p>`): Status {
  return {
    id,
    created_at: '2026-07-01T00:00:00.000Z',
    edited_at: null,
    content,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: 'a', username: 'a', acct: 'a', display_name: 'A' } as never,
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

function makePost(id: string, source: AlgoSource, friend: boolean, content?: string): AlgoPost {
  return { status: makeStatus(id, content), source, friend, score: 1 };
}

interface FakeFeed {
  posts: ReturnType<typeof signal<AlgoPost[]>>;
  loading: ReturnType<typeof signal<boolean>>;
  error: ReturnType<typeof signal<boolean>>;
  builtAt: ReturnType<typeof signal<number | null>>;
  callsUsed: ReturnType<typeof signal<number>>;
  hashtag: ReturnType<typeof signal<string | null>>;
  ensureBuilt: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  shufflePosts: ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
  removeStatus: ReturnType<typeof vi.fn>;
}

describe('Algo page', () => {
  let feed: FakeFeed;
  let fixture: ComponentFixture<Algo>;

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** The "why you're seeing this" lines currently rendered, one per feed item. */
  function labels(): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('.algo-source')] as HTMLElement[];
  }

  function chip(label: string): HTMLButtonElement {
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    const found = buttons.find((b) => b.textContent?.includes(label));
    if (!found) {
      throw new Error(`no chip labeled ${label}`);
    }
    return found;
  }

  beforeEach(() => {
    localStorage.clear();
    feed = {
      posts: signal<AlgoPost[]>([]),
      loading: signal(false),
      error: signal(false),
      builtAt: signal<number | null>(Date.now()),
      callsUsed: signal(7),
      hashtag: signal<string | null>('cats'),
      ensureBuilt: vi.fn(),
      refresh: vi.fn(),
      shufflePosts: vi.fn(),
      updateStatus: vi.fn(),
      removeStatus: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AlgoFeed, useValue: feed },
      ],
    });
    fixture = TestBed.createComponent(Algo);
  });

  it('asks the feed to build on init and shows the build meta', () => {
    feed.posts.set([makePost('p1', 'mutual', true)]);
    fixture.detectChanges();
    expect(feed.ensureBuilt).toHaveBeenCalled();
    expect(text()).toContain('1 posts from 7 API calls');
    expect(text()).toContain('#cats');
    expect(text()).toContain('Top post from a mutual');
  });

  it('Friends shows only posts authored by follows — no boosts, no hashtag finds', () => {
    feed.posts.set([
      makePost('authored', 'original', true),
      makePost('mutualpost', 'mutual', true),
      makePost('boosted', 'boost', true),
      makePost('tagfind', 'hashtag', false),
    ]);
    fixture.detectChanges();
    expect(text()).toContain('authored');
    expect(text()).toContain('boosted');
    expect(text()).toContain('tagfind');

    chip('Friends').click();
    fixture.detectChanges();
    expect(text()).toContain('authored');
    expect(text()).toContain('mutualpost');
    expect(text()).not.toContain('boosted');
    expect(text()).not.toContain('tagfind');

    chip('All').click();
    fixture.detectChanges();
    expect(text()).toContain('boosted');
    expect(text()).toContain('tagfind');
  });

  it('Tags chip toggles hashtag posts in and out (only offered in All mode)', () => {
    feed.posts.set([makePost('authored', 'original', true), makePost('tagfind', 'hashtag', false)]);
    fixture.detectChanges();
    expect(text()).toContain('tagfind');

    chip('Tags').click(); // toggle off
    fixture.detectChanges();
    expect(text()).toContain('authored');
    expect(text()).not.toContain('tagfind');
    expect(TestBed.inject(ClientPrefs).algoTags()).toBe(false);

    chip('Tags').click(); // back on
    fixture.detectChanges();
    expect(text()).toContain('tagfind');

    // In Friends mode the Tags chip disappears — it has nothing to govern.
    chip('Friends').click();
    fixture.detectChanges();
    expect(() => chip('Tags')).toThrow();
  });

  it('shuffle button re-deals via the service', () => {
    fixture.detectChanges();
    chip('Shuffle').click();
    expect(feed.shufflePosts).toHaveBeenCalled();
  });

  it('Links turns the filtered feed into preview cards with engagement', () => {
    const linked = makePost('linked', 'original', true, '<p>read this</p>');
    linked.status.card = {
      url: 'https://example.com/story',
      title: 'A worthwhile story',
      description: 'The useful summary.',
      type: 'link',
      provider_name: 'Example News',
      image: 'https://example.com/image.jpg',
    };
    linked.status.favourites_count = 12;
    linked.status.reblogs_count = 4;
    feed.posts.set([linked, makePost('plain', 'original', true, '<p>no link here</p>')]);
    fixture.detectChanges();

    chip('Links').click();
    fixture.detectChanges();

    expect(text()).toContain('A worthwhile story');
    expect(text()).toContain('The useful summary.');
    expect(text()).toContain('Example News');
    expect(text()).toContain('♥ 12');
    expect(text()).toContain('↻ 4');
    expect(text()).not.toContain('no link here');
    const anchor = fixture.nativeElement.querySelector('.algo-link-main') as HTMLAnchorElement;
    expect(anchor.href).toBe('https://example.com/story');
    expect(anchor.target).toBe('_blank');
    expect(fixture.nativeElement.querySelector('.algo-link-image')).not.toBeNull();

    chip('Links').click();
    fixture.detectChanges();
    expect(text()).toContain('no link here');
  });

  it('Links follows a boost to the original preview and engagement counts', () => {
    const original = makeStatus('original');
    original.account = {
      id: 'writer',
      username: 'writer',
      acct: 'writer',
      display_name: 'Writer',
    } as never;
    original.card = {
      url: 'https://example.com/boosted-story',
      title: 'Boosted story',
      description: '',
      type: 'link',
      provider_name: '',
      image: null,
    };
    original.favourites_count = 9;
    original.reblogs_count = 3;
    const boost = makePost('boost', 'boost', true);
    boost.status.reblog = original;
    feed.posts.set([boost]);
    fixture.detectChanges();

    chip('Links').click();
    fixture.detectChanges();

    expect(text()).toContain('Boosted story');
    expect(text()).toContain('@writer');
    expect(text()).toContain('♥ 9');
    expect(text()).toContain('↻ 3');
  });

  it('Links has a specific empty state when the Algo posts have no previews', () => {
    feed.posts.set([makePost('plain', 'original', true)]);
    fixture.detectChanges();
    chip('Links').click();
    fixture.detectChanges();

    expect(text()).toContain('No link previews in these posts');
  });

  it('calm mode hides heated posts and reports how many', () => {
    feed.posts.set([
      makePost('nice', 'original', true, '<p>lovely garden update</p>'),
      makePost('angry', 'original', true, '<p>you disgusting corrupt liars!!!</p>'),
    ]);
    fixture.detectChanges();
    expect(text()).toContain('you disgusting');

    chip('Calm').click();
    fixture.detectChanges();
    expect(text()).not.toContain('you disgusting');
    expect(text()).toContain('lovely garden');
    expect(text()).toContain('calm mode hid 1');
    expect(TestBed.inject(ClientPrefs).algoCalm()).toBe(true);
  });

  it('calm mode also hides ratioed posts and quote-dunks', () => {
    // Politely worded, but 40 replies over 2 favs: a pile-on, not a hit.
    const ratioed = makePost('ratioed', 'original', true, '<p>my measured hot take</p>');
    ratioed.status.replies_count = 40;
    ratioed.status.favourites_count = 2;
    // Mildly negative ("dumb" scores 1, below the heated threshold) — but on a
    // quote it's a dunk, so only the dunk rule can be what hides it.
    const dunk = makePost('dunk', 'original', true, '<p>what a dumb take</p>');
    dunk.status.quote = { state: 'accepted', quoted_status: null };
    feed.posts.set([
      makePost('nice', 'original', true, '<p>lovely garden update</p>'),
      ratioed,
      dunk,
    ]);
    TestBed.inject(ClientPrefs).setAlgoCalm(true);
    fixture.detectChanges();

    expect(text()).toContain('lovely garden');
    expect(text()).not.toContain('measured hot take');
    expect(text()).not.toContain('dumb take');
    expect(text()).toContain('calm mode hid 2');
  });

  it('refresh button rebuilds; loading and error states render', () => {
    fixture.detectChanges();
    chip('Refresh').click();
    expect(feed.refresh).toHaveBeenCalled();

    feed.loading.set(true);
    fixture.detectChanges();
    expect(text()).toContain('Gathering the good stuff');

    feed.loading.set(false);
    feed.error.set(true);
    fixture.detectChanges();
    expect(text()).toContain('Couldn’t build your Algo feed');
  });

  it('empty state nudges toward follows and hashtags', () => {
    fixture.detectChanges();
    expect(text()).toContain('follow some people and hashtags');
  });

  // Each item wraps its card in a "why you're seeing this" line. A card that
  // renders as nothing used to leave that line stranded — a run of bare "Top
  // post from your feed" labels with no post under any of them.
  describe('posts whose card renders nothing', () => {
    it('drops the source label too when the post is muted', () => {
      feed.posts.set([
        makePost('kept', 'original', true, '<p>still here</p>'),
        makePost('hushed', 'original', true, '<p>never again</p>'),
      ]);
      TestBed.inject(MutedPosts).mute('hushed');
      fixture.detectChanges();

      expect(text()).toContain('still here');
      expect(text()).not.toContain('never again');
      expect(labels()).toHaveLength(1);
    });

    it('drops the source label too when the author is locally blocked', () => {
      const blocked = makePost('blocked', 'original', true, '<p>from a blocked author</p>');
      blocked.status.account = {
        id: 'b',
        username: 'b',
        acct: 'b',
        display_name: 'B',
      } as never;
      feed.posts.set([makePost('kept', 'original', true, '<p>still here</p>'), blocked]);
      TestBed.inject(LocalModeration).block(blocked.status.account);
      fixture.detectChanges();

      expect(text()).toContain('still here');
      expect(text()).not.toContain('from a blocked author');
      expect(labels()).toHaveLength(1);
    });

    it('drops the source label too when a hide-action filter matches', () => {
      const filtered = makePost('filtered', 'original', true, '<p>filtered away</p>');
      filtered.status.filtered = [
        {
          filter: { id: 'f1', title: 'No sports', context: ['home'], filter_action: 'hide' },
          keyword_matches: ['sports'],
        },
      ] as never;
      feed.posts.set([makePost('kept', 'original', true, '<p>still here</p>'), filtered]);
      fixture.detectChanges();

      expect(text()).toContain('still here');
      expect(text()).not.toContain('filtered away');
      expect(labels()).toHaveLength(1);
    });

    it('falls through to the empty state when every card would render nothing', () => {
      feed.posts.set([makePost('hushed', 'original', true, '<p>never again</p>')]);
      TestBed.inject(MutedPosts).mute('hushed');
      fixture.detectChanges();

      expect(labels()).toHaveLength(0);
      expect(text()).toContain('follow some people and hashtags');
    });
  });
});
