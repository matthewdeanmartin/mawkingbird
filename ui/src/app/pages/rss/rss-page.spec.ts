import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParsedFeed } from '../../providers/rss/rss-parser';
import { RssFetch } from '../../providers/rss/rss-fetch';
import { RssProvider } from '../../providers/rss/rss-provider';
import { RssSubscriptions } from '../../providers/rss/rss-subscriptions';
import { RssReadState } from '../../providers/rss/rss-read-state';
import { ClientPrefs } from '../../client-prefs';
import { RssPage } from './rss-page';
import { StatusCard } from '../../status-card/status-card';
import { Status } from '../../models';

/**
 * Stands in for `app-status-card`, rendering just the item title.
 *
 * The real card is not exercised here on purpose: this page's job is deciding
 * *which* statuses belong in the pane, and the card has its own spec for how one
 * is drawn. Rendering the real thing also drags in NgOptimizedImage, which
 * throws in dev mode on the RSS adapter's `data:` avatar (a pre-existing issue
 * unrelated to what these tests are about).
 */
@Component({ selector: 'app-status-card', template: '{{ status().content }}' })
class StatusCardStub {
  readonly status = input.required<Status>();
  readonly filterContext = input<string>();
}

/** A minimal parseable feed with one dated item, enough for the adapter. */
function feed(title: string, itemTitle: string, publishedAt: string): ParsedFeed {
  return {
    title,
    link: null,
    items: [
      {
        guid: `${title}-${itemTitle}`,
        title: itemTitle,
        link: null,
        publishedAt,
        html: '<p>body</p>',
        isFullContent: true,
        enclosures: [],
        categories: [],
        author: null,
        commentsFeedUrl: null,
        commentCount: null,
      },
    ],
  };
}

describe('RssPage', () => {
  /** Feed URL → what fetching it returns. Unlisted URLs fail, like a dead feed. */
  let feeds: Map<string, ParsedFeed>;

  beforeEach(() => {
    localStorage.clear();
    feeds = new Map();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'rss', component: RssPage }]),
        {
          provide: RssFetch,
          useValue: {
            fetchFeed: vi.fn((url: string) => {
              const parsed = feeds.get(url);
              return parsed ? of(parsed) : throwError(() => new Error('nope'));
            }),
          },
        },
      ],
    });
    // Before any inject(): TestBed refuses an override once instantiated.
    TestBed.overrideComponent(RssPage, {
      remove: { imports: [StatusCard] },
      add: { imports: [StatusCardStub] },
    });
  });

  function setUp(): ComponentFixture<RssPage> {
    const fixture = TestBed.createComponent(RssPage);
    fixture.detectChanges();
    return fixture;
  }

  function textOf(fixture: ComponentFixture<RssPage>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** Every rail row's trimmed label, in order. */
  function railRows(fixture: ComponentFixture<RssPage>): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.rail-row')].map(
      (el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  it('invites you to add a feed when there are none', () => {
    expect(textOf(setUp())).toContain('No feeds yet');
  });

  it('lists subscribed feeds with host and item count', () => {
    TestBed.inject(RssSubscriptions).add(
      'https://blog.example.com/feed.xml',
      'Example Blog',
      false,
      12,
    );
    const text = textOf(setUp());
    expect(text).toContain('Example Blog');
    expect(text).toContain('blog.example.com');
    expect(text).toContain('12 items');
  });

  it('marks a disabled feed as off', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://blog.example.com/feed.xml', 'Example Blog');
    subs.setEnabled('https://blog.example.com/feed.xml', false);
    expect(textOf(setUp())).toContain('· off');
  });

  it('groups feeds under their folder, unfiled first', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://a.example.com/feed.xml', 'Loose Feed');
    subs.add('https://b.example.com/feed.xml', 'Tech Feed', false, undefined, 'Tech');
    subs.add('https://c.example.com/feed.xml', 'News Feed', false, undefined, 'News');

    const rows = railRows(setUp());
    expect(rows[0]).toContain('All items');
    // Unfiled group leads, then folders alphabetically (News before Tech).
    expect(rows.slice(1)).toEqual([
      expect.stringContaining('Unsorted'),
      expect.stringContaining('Loose Feed'),
      expect.stringContaining('News'),
      expect.stringContaining('News Feed'),
      expect.stringContaining('Tech'),
      expect.stringContaining('Tech Feed'),
    ]);
  });

  it('shows no folder headers at all when nothing is filed', () => {
    TestBed.inject(RssSubscriptions).add('https://a.example.com/feed.xml', 'Loose Feed');
    const rows = railRows(setUp());
    expect(rows).toEqual([
      expect.stringContaining('All items'),
      expect.stringContaining('Loose Feed'),
    ]);
  });

  it('selecting a feed puts it in the URL and loads it into the pane', async () => {
    const url = 'https://blog.example.com/feed.xml';
    feeds.set(url, feed('Example Blog', 'Hello world', '2026-08-20T10:00:00Z'));
    TestBed.inject(RssSubscriptions).add(url, 'Example Blog');

    const fixture = setUp();
    fixture.componentInstance['selectFeed'](url);
    await fixture.whenStable();
    fixture.detectChanges();

    // Angular leaves `:` literal in a query value and escapes only the slashes.
    expect(TestBed.inject(Router).url).toContain('feed=https:%2F%2Fblog.example.com%2Ffeed.xml');
    expect(textOf(fixture)).toContain('Hello world');
  });

  it('restores the same pane when loaded directly on a ?feed= URL', async () => {
    const url = 'https://blog.example.com/feed.xml';
    feeds.set(url, feed('Example Blog', 'Deep linked', '2026-08-20T10:00:00Z'));
    TestBed.inject(RssSubscriptions).add(url, 'Example Blog');

    await TestBed.inject(Router).navigate(['/rss'], { queryParams: { feed: url } });
    const fixture = setUp();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(textOf(fixture)).toContain('Deep linked');
    expect(textOf(fixture)).toContain('Open as profile');
  });

  it('merges every feed in a folder, newest first', async () => {
    const subs = TestBed.inject(RssSubscriptions);
    feeds.set('https://a.example.com/f.xml', feed('A', 'Older item', '2026-08-01T00:00:00Z'));
    feeds.set('https://b.example.com/f.xml', feed('B', 'Newer item', '2026-08-20T00:00:00Z'));
    feeds.set('https://c.example.com/f.xml', feed('C', 'Other folder', '2026-08-21T00:00:00Z'));
    subs.add('https://a.example.com/f.xml', 'A', false, undefined, 'Tech');
    subs.add('https://b.example.com/f.xml', 'B', false, undefined, 'Tech');
    subs.add('https://c.example.com/f.xml', 'C', false, undefined, 'News');

    const fixture = setUp();
    fixture.componentInstance['selectFolder']('Tech');
    await fixture.whenStable();
    fixture.detectChanges();

    const text = textOf(fixture);
    expect(text).toContain('Newer item');
    expect(text).toContain('Older item');
    // The other folder's feed must not leak into this pane.
    expect(text).not.toContain('Other folder');
    expect(text.indexOf('Newer item')).toBeLessThan(text.indexOf('Older item'));
  });

  it('shows the rest of a folder when one feed in it fails', async () => {
    const subs = TestBed.inject(RssSubscriptions);
    feeds.set('https://ok.example.com/f.xml', feed('OK', 'Survived', '2026-08-20T00:00:00Z'));
    subs.add('https://ok.example.com/f.xml', 'OK Feed', false, undefined, 'Tech');
    // Deliberately not in `feeds`, so fetching it throws.
    subs.add('https://dead.example.com/f.xml', 'Dead Feed', false, undefined, 'Tech');

    const fixture = setUp();
    fixture.componentInstance['selectFolder']('Tech');
    await fixture.whenStable();
    fixture.detectChanges();

    const text = textOf(fixture);
    expect(text).toContain('Survived');
    expect(text).toContain("Couldn't load Dead Feed");
  });

  it('stops loading when the pane source completes without a value', async () => {
    TestBed.overrideProvider(RssProvider, { useValue: { getFeeds: () => EMPTY } });
    TestBed.inject(RssSubscriptions).add('https://silent.example/feed.xml', 'Silent Feed');

    const fixture = setUp();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = textOf(fixture);
    expect(text).not.toContain('Loading items');
    expect(text).toContain("Couldn't load Silent Feed");
  });

  it('opens the add-feed dialog on click, closes it on (closed)', () => {
    const fixture = setUp();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.rss-rail-head button',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-add-feed-dialog'),
    ).not.toBeNull();

    (fixture.componentInstance as unknown as { closeAddDialog(): void }).closeAddDialog();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-add-feed-dialog')).toBeNull();
  });

  describe('read state, starring and density', () => {
    const URL_A = 'https://a.example.com/f.xml';
    const URL_B = 'https://b.example.com/f.xml';

    /** Two feeds in different folders, each with one item. */
    async function twoFolders() {
      feeds.set(URL_A, feed('A', 'Alpha item', '2026-08-20T00:00:00Z'));
      feeds.set(URL_B, feed('B', 'Beta item', '2026-08-21T00:00:00Z'));
      const subs = TestBed.inject(RssSubscriptions);
      subs.add(URL_A, 'A', false, undefined, 'Tech');
      subs.add(URL_B, 'B', false, undefined, 'News');
      const fixture = setUp();
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    const idOf = (url: string, guid: string) => `rss:${url}::${guid}`;

    it('marks an item read when it is opened in headline mode', async () => {
      feeds.set(URL_A, feed('A', 'Alpha item', '2026-08-20T00:00:00Z'));
      TestBed.inject(RssSubscriptions).add(URL_A, 'A');
      TestBed.inject(ClientPrefs).setRssDensity('headlines');
      const readState = TestBed.inject(RssReadState);
      const fixture = setUp();
      await fixture.whenStable();
      fixture.detectChanges();

      const id = idOf(URL_A, 'A-Alpha item');
      expect(readState.isRead(id)).toBe(false);

      fixture.componentInstance['toggleExpanded'](fixture.componentInstance['statuses']()[0]);
      expect(readState.isRead(id)).toBe(true);
    });

    it('does not mark anything read merely by rendering', async () => {
      // Scroll tracking is opt-in; with it off, loading a pane must not touch
      // read state at all.
      await twoFolders();
      expect(TestBed.inject(RssReadState).readCount()).toBe(0);
    });

    it('renders each RSS item once and offers a direct Reader link', async () => {
      const fixture = await twoFolders();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelectorAll('app-status-card')).toHaveLength(2);
      expect(element.querySelectorAll('app-reader-core')).toHaveLength(0);
      const links = [...element.querySelectorAll<HTMLAnchorElement>('.read-in-reader')];
      expect(links).toHaveLength(2);
      expect(links.every((link) => link.textContent?.includes('Long text reader'))).toBe(true);
      expect(decodeURIComponent(links[0].getAttribute('href') ?? '')).toContain('/read/rss:');
    });

    it('uses the same direct Reader link for an expanded headline', async () => {
      feeds.set(URL_A, feed('A', 'Alpha item', '2026-08-20T00:00:00Z'));
      TestBed.inject(RssSubscriptions).add(URL_A, 'A');
      TestBed.inject(ClientPrefs).setRssDensity('headlines');
      const fixture = setUp();
      await fixture.whenStable();
      fixture.componentInstance['toggleExpanded'](fixture.componentInstance['statuses']()[0]);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelectorAll('app-status-card')).toHaveLength(1);
      expect(element.querySelector('app-reader-core')).toBeNull();
      expect(element.querySelector('.read-in-reader')?.textContent).toContain('Long text reader');
    });

    it('mark-all-read covers only the selected folder', async () => {
      const fixture = await twoFolders();
      const readState = TestBed.inject(RssReadState);

      fixture.componentInstance['selectFolder']('Tech');
      await fixture.whenStable();
      fixture.detectChanges();
      fixture.componentInstance['markAllRead']();

      // The single most embarrassing bug this sprint could ship: marking the
      // other folder's items read too.
      expect(readState.isRead(idOf(URL_A, 'A-Alpha item'))).toBe(true);
      expect(readState.isRead(idOf(URL_B, 'B-Beta item'))).toBe(false);
      expect(readState.readCount()).toBe(1);
    });

    it('mark-all-read on a single feed covers only that feed', async () => {
      const fixture = await twoFolders();
      const readState = TestBed.inject(RssReadState);

      fixture.componentInstance['selectFeed'](URL_B);
      await fixture.whenStable();
      fixture.detectChanges();
      fixture.componentInstance['markAllRead']();

      expect(readState.isRead(idOf(URL_B, 'B-Beta item'))).toBe(true);
      expect(readState.isRead(idOf(URL_A, 'A-Alpha item'))).toBe(false);
    });

    it('mark-all-read on All items covers everything loaded', async () => {
      const fixture = await twoFolders();
      fixture.componentInstance['markAllRead']();
      expect(TestBed.inject(RssReadState).readCount()).toBe(2);
    });

    it('mark-all-read ignores the Starred filter and marks the whole pane', async () => {
      const fixture = await twoFolders();
      const readState = TestBed.inject(RssReadState);
      readState.setStarred(idOf(URL_A, 'A-Alpha item'), true);

      fixture.componentInstance['setFilter']('starred');
      fixture.detectChanges();
      fixture.componentInstance['markAllRead']();

      // Not just the one visible starred item.
      expect(readState.readCount()).toBe(2);
    });

    it('the Starred filter shows only starred items', async () => {
      const fixture = await twoFolders();
      TestBed.inject(RssReadState).setStarred(idOf(URL_A, 'A-Alpha item'), true);

      fixture.componentInstance['setFilter']('starred');
      fixture.detectChanges();

      const text = textOf(fixture);
      expect(text).toContain('Alpha item');
      expect(text).not.toContain('Beta item');
    });

    it('calls the saved list "Read later" while keeping the stored key', async () => {
      // The rename is copy-only and deliberately so: `starred` stays the
      // internal id and `mockingbird_rss_starred` stays the storage key,
      // because renaming a persisted key would throw away everybody's saved
      // items to change a label. Asserted together so a later "tidy-up" that
      // renames the key has to fail this test first.
      const fixture = await twoFolders();
      TestBed.inject(RssReadState).setStarred(idOf(URL_A, 'A-Alpha item'), true);
      fixture.detectChanges();

      const text = textOf(fixture);
      expect(text).toContain('Read later');
      expect(text).not.toContain('Starred');
      expect(localStorage.getItem('mockingbird_rss_starred')).not.toBeNull();
    });

    it('persists the density preference', async () => {
      await twoFolders();
      const prefs = TestBed.inject(ClientPrefs);
      expect(prefs.rssDensity()).toBe('full');

      prefs.setRssDensity('headlines');
      expect(prefs.rssDensity()).toBe('headlines');
      prefs.setRssDensity('nonsense' as never);
      expect(prefs.rssDensity()).toBe('headlines');
    });

    it('collapses any expansion when density changes', async () => {
      feeds.set(URL_A, feed('A', 'Alpha item', '2026-08-20T00:00:00Z'));
      TestBed.inject(RssSubscriptions).add(URL_A, 'A');
      const fixture = setUp();
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.componentInstance['toggleExpanded'](fixture.componentInstance['statuses']()[0]);
      expect(fixture.componentInstance['expandedId']()).not.toBeNull();

      fixture.componentInstance['setDensity']('headlines');
      expect(fixture.componentInstance['expandedId']()).toBeNull();
    });

    it('toggles one item read by hand', async () => {
      const fixture = await twoFolders();
      const readState = TestBed.inject(RssReadState);
      const status = fixture.componentInstance['statuses']()[0];

      fixture.componentInstance['toggleRead'](status);
      expect(readState.isRead(status.id)).toBe(true);
      fixture.componentInstance['toggleRead'](status);
      expect(readState.isRead(status.id)).toBe(false);
    });

    it('only marks read on scroll when the preference is on', async () => {
      const fixture = await twoFolders();
      const readState = TestBed.inject(RssReadState);
      const status = fixture.componentInstance['statuses']()[0];

      fixture.componentInstance['onSeen'](status);
      expect(readState.isRead(status.id)).toBe(false);

      TestBed.inject(ClientPrefs).setRssScrollMarksRead(true);
      fixture.componentInstance['onSeen'](status);
      expect(readState.isRead(status.id)).toBe(true);
    });
  });

  describe('starter kit toggle', () => {
    it('opens showing kits when there are no feeds at all', () => {
      const fixture = setUp();
      expect(fixture.componentInstance['showKits']()).toBe(true);
      expect(textOf(fixture)).toContain('Start with a kit');
    });

    it('opens showing the reading list once feeds exist', async () => {
      const url = 'https://a.example.com/f.xml';
      feeds.set(url, feed('A', 'Alpha item', '2026-08-20T00:00:00Z'));
      TestBed.inject(RssSubscriptions).add(url, 'A');
      const fixture = setUp();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance['showKits']()).toBe(false);
      expect(textOf(fixture)).toContain('Alpha item');
      expect(textOf(fixture)).not.toContain('Start with a kit');
    });

    it('swaps the pane between kits and the reading list', async () => {
      const url = 'https://a.example.com/f.xml';
      feeds.set(url, feed('A', 'Alpha item', '2026-08-20T00:00:00Z'));
      TestBed.inject(RssSubscriptions).add(url, 'A');
      const fixture = setUp();
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.componentInstance['toggleKits']();
      fixture.detectChanges();
      // One thing at a time: kits replace the list rather than pushing it down.
      expect(textOf(fixture)).toContain('Start with a kit');
      expect(textOf(fixture)).not.toContain('Alpha item');

      fixture.componentInstance['toggleKits']();
      fixture.detectChanges();
      expect(textOf(fixture)).toContain('Alpha item');
      expect(textOf(fixture)).not.toContain('Start with a kit');
    });

    it('does not close itself when a kit install adds feeds', async () => {
      const fixture = setUp();
      expect(fixture.componentInstance['showKits']()).toBe(true);

      TestBed.inject(RssSubscriptions).add('https://a.example.com/f.xml', 'A');
      await fixture.whenStable();
      fixture.detectChanges();

      // Derived-from-feed-count would yank the panel away mid-click.
      expect(fixture.componentInstance['showKits']()).toBe(true);
    });

    it('closes the kits and shows articles when a newly added feed is selected', async () => {
      const url = 'https://a.example.com/f.xml';
      feeds.set(url, feed('A', 'Installed kit article', '2026-08-20T00:00:00Z'));
      const fixture = setUp();
      TestBed.inject(RssSubscriptions).add(url, 'A');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance['showKits']()).toBe(true);
      fixture.componentInstance['selectFeed'](url);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance['showKits']()).toBe(false);
      expect(textOf(fixture)).toContain('Installed kit article');
      expect(textOf(fixture)).not.toContain('Start with a kit');
    });
  });
});
