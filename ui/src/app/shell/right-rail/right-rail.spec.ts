import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { HouseAdStore } from '../../house-ad-store';
import { HOUSE_ADS_SHOWN } from '../../house-ads';
import { Account } from '../../models';
import { Server } from '../../server';
import { SearchServer } from '../../search-server';
import { MastodonConnector } from '../../providers/mastodon/mastodon-connector';
import { seedBskyIdentity } from '../../testing/seed-storage';
import { RightRail } from './right-rail';

interface RightRailInternals {
  homeHost: () => string | null;
  donateServerUrl: () => string;
  anonymousShareUrl: () => string;
  anonymousShareAbsoluteUrl: () => string;
  shareOpen: () => boolean;
  openShare: () => void;
  closeShare: () => void;
}

function internals(fixture: ComponentFixture<RightRail>): RightRailInternals {
  return fixture.componentInstance as unknown as RightRailInternals;
}

describe('RightRail', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(): ComponentFixture<RightRail> {
    const fixture = TestBed.createComponent(RightRail);
    fixture.detectChanges();
    // Instance info request fires on init; individual tests may flush or ignore it.
    httpMock.match(() => true).forEach((req) => req.flush({}, { status: 404, statusText: 'NF' }));
    return fixture;
  }

  /**
   * With a search server configured, two instances are serving this session and
   * the rail must say so.
   *
   * Before this the card named one server as *the* server while every search
   * quietly went somewhere else, which left "why are my results from a
   * different place?" with no answer anywhere in the UI.
   */
  describe('two-server roles', () => {
    function renderWithInstance(): ComponentFixture<RightRail> {
      TestBed.inject(Auth).account.set({ id: '1', acct: 'matt@elekk.xyz' } as Account);
      const fixture = TestBed.createComponent(RightRail);
      fixture.detectChanges();
      httpMock
        .match((r) => r.url === '/api/v2/instance' || r.url === '/api/v1/instance')
        .forEach((req) =>
          req.flush({
            domain: 'elekk.xyz',
            title: 'Elekk',
            version: '4.3.0',
            usage: { users: { active_month: 12 } },
          }),
        );
      httpMock.match(() => true).forEach((req) => req.flush({}, { status: 404, statusText: 'NF' }));
      fixture.detectChanges();
      return fixture;
    }

    it('names both servers and what each one does', () => {
      TestBed.inject(SearchServer).setBaseUrl('mastodon.social');
      const el = renderWithInstance().nativeElement as HTMLElement;

      const roles = el.querySelector('.server-roles');
      expect(roles).not.toBeNull();
      const text = roles?.textContent ?? '';
      // Both hosts, each labelled with the job it is actually doing — a bare
      // pair of hostnames would not say which is which.
      expect(text).toContain('elekk.xyz');
      expect(text).toContain('mastodon.social');
      expect(text).toContain('Feeds');
      expect(text).toContain('Search');
    });

    it('says nothing when one server does everything', () => {
      // No badge without a second server: a row reading "Search: your server"
      // is furniture, and the card already names that server above.
      const el = renderWithInstance().nativeElement as HTMLElement;

      expect(el.querySelector('.server-roles')).toBeNull();
    });
  });

  it("infers the donate host from the account's acct domain", () => {
    TestBed.inject(Auth).account.set({ id: '1', acct: 'matt@elekk.xyz' } as Account);
    const fixture = setUp();

    expect(internals(fixture).homeHost()).toBe('elekk.xyz');
    expect(internals(fixture).donateServerUrl()).toBe('https://elekk.xyz/about');
    expect(internals(fixture).anonymousShareUrl()).toBe('/anonymous?elekk.xyz');
  });

  it('exposes an absolute (origin-qualified) share URL for copying, not just a route', () => {
    TestBed.inject(Auth).account.set({ id: '1', acct: 'matt@elekk.xyz' } as Account);
    const fixture = setUp();

    const absolute = internals(fixture).anonymousShareAbsoluteUrl();
    // A real link someone can paste elsewhere: origin + the anonymous route.
    expect(absolute).toBe(`${location.origin}/anonymous?elekk.xyz`);
    expect(absolute.startsWith('http')).toBe(true);
  });

  it('"Share this server" opens a dialog instead of navigating', () => {
    TestBed.inject(Auth).account.set({ id: '1', acct: 'matt@elekk.xyz' } as Account);
    const fixture = setUp();

    expect(internals(fixture).shareOpen()).toBe(false);
    internals(fixture).openShare();
    expect(internals(fixture).shareOpen()).toBe(true);
    internals(fixture).closeShare();
    expect(internals(fixture).shareOpen()).toBe(false);
  });

  it('falls back to the connected instance for local accts', () => {
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    TestBed.inject(Auth).account.set({ id: '1', acct: 'matt' } as Account);
    const fixture = setUp();

    expect(internals(fixture).homeHost()).toBe('mastodon.social');
    expect(internals(fixture).donateServerUrl()).toBe('https://mastodon.social/about');
  });

  it('renders the donate links and a rotating pair of house ads', () => {
    TestBed.inject(Auth).account.set({ id: '1', acct: 'matt@elekk.xyz' } as Account);
    const fixture = setUp();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    // Donate links are computed from the account/instance, so assert them.
    const hrefs = [...el.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toContain('https://elekk.xyz/about');
    expect(hrefs).toContain('https://joinmastodon.org/sponsors');
    // "Share this server" is a button that opens a copy dialog, NOT an <a> that
    // navigates to the anonymous route — so it must not appear among the hrefs.
    expect(hrefs).not.toContain('/anonymous?elekk.xyz');
    const shareBtn = el.querySelector<HTMLButtonElement>('button.share-server');
    expect(shareBtn?.textContent?.trim()).toBe('Share this server');

    // House-ad *content* is editorial and changes freely — assert structure, not
    // specific URLs: HOUSE_ADS_SHOWN cards, each linking out over https.
    const cards = [...el.querySelectorAll('.spotlight-card')];
    expect(cards).toHaveLength(HOUSE_ADS_SHOWN);
    for (const card of cards) {
      const link = card.querySelector<HTMLAnchorElement>('a[href^="https://"]');
      expect(link).not.toBeNull();
    }
  });

  it('counts a click on an ad locally, without leaving the rail', () => {
    const fixture = setUp();
    fixture.detectChanges();
    const store = TestBed.inject(HouseAdStore);
    const clicked = store.visible()[0];

    const card = (fixture.nativeElement as HTMLElement).querySelector('.spotlight-card')!;
    card.querySelector<HTMLAnchorElement>('a.spotlight-body')!.dispatchEvent(
      // The anchor is a real outbound link; cancel the navigation jsdom would
      // complain about and keep the click itself.
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(store.rows().find((row) => row.ad.id === clicked.id)!.clicks?.count).toBe(1);
  });

  it('dismisses one ad without opening it, and refills the slot', () => {
    const fixture = setUp();
    fixture.detectChanges();
    const store = TestBed.inject(HouseAdStore);
    const dismissed = store.visible()[0];
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('.spotlight-card .spotlight-dismiss')!.click();
    fixture.detectChanges();

    expect(store.visible().map((ad) => ad.id)).not.toContain(dismissed.id);
    // A dismiss is not a click on the advertiser.
    expect(store.totalClicks()).toBe(0);
    expect(el.querySelectorAll('.spotlight-card')).toHaveLength(HOUSE_ADS_SHOWN);
  });

  it('renders no ad cards at all once ads are switched off', () => {
    TestBed.inject(HouseAdStore).setEnabled(false);
    const fixture = setUp();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.spotlight-card')).toHaveLength(0);
    // The donate block is not an ad and stays regardless.
    expect(
      [...el.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) => a.getAttribute('href')),
    ).toContain('https://joinmastodon.org/sponsors');
  });

  it('house-ad markup carries no ad-* classes (ad blockers hide those cosmetically)', () => {
    const fixture = setUp();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.spotlight-card').length).toBeGreaterThan(0);
    const adClassed = [...el.querySelectorAll('*')].filter((node) =>
      [...node.classList].some((cls) => /^ad[s]?([-_]|$)/i.test(cls)),
    );
    expect(adClassed).toHaveLength(0);
  });

  it('no longer hosts the trends widget (moved to the left rail)', () => {
    const fixture = setUp();
    expect((fixture.nativeElement as HTMLElement).querySelector('.trend')).toBeNull();
  });

  /**
   * The rails by account kind.
   *
   * A Bluesky-primary account was being shown four Mastodon widgets it cannot
   * use — Just My Server (Bluesky has no instances to narrow to), a donate block
   * asking it to fund a server it does not use, a server-info card describing an
   * instance that is not its home, and Fediverse trends links into endpoints
   * there is no token for — while being shown no Bluesky equivalent of any of it.
   *
   * Widgets are **swapped, not stacked**: what a Bluesky-primary account loses
   * in Mastodon widgets it gains back in Bluesky ones, so the rail does not grow.
   */
  describe('by account kind', () => {
    function seedBlueskyPrimary(): void {
      localStorage.setItem('mastodon_mock_account_mode', 'bluesky');
      seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    }

    /**
     * Render without the blanket flush `setUp` does, so the *absence* of
     * requests can be asserted rather than swallowed.
     */
    function render(): ComponentFixture<RightRail> {
      const fixture = TestBed.createComponent(RightRail);
      fixture.detectChanges();
      return fixture;
    }

    it('makes no Mastodon requests for a Bluesky-primary account with no connector', () => {
      seedBlueskyPrimary();
      const fixture = render();

      // The heart of the sprint: no widget may fetch until its predicate says it
      // will render. Bluesky trends are allowed — those are this account's own
      // network — so only Mastodon paths are asserted absent.
      expect(httpMock.match((r) => r.url.startsWith('/api/'))).toEqual([]);
      httpMock.match((r) => r.url.includes('bsky.app')).forEach((req) => req.flush({}));
      fixture.detectChanges();
    });

    it('hides Just My Server, the donate block and the server card without a connector', () => {
      seedBlueskyPrimary();
      const fixture = render();
      httpMock.match(() => true).forEach((req) => req.flush({}));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.server-mode-card')).toBeNull();
      expect(el.querySelector('.donate-block')).toBeNull();
      expect(el.querySelector('.server-info')).toBeNull();
      const hrefs = [...el.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) =>
        a.getAttribute('href'),
      );
      expect(hrefs).not.toContain('https://joinmastodon.org/sponsors');
    });

    it('shows a Bluesky service card naming the PDS, with no donate block', () => {
      seedBlueskyPrimary();
      const fixture = render();
      httpMock.match(() => true).forEach((req) => req.flush({}));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      const card = el.querySelector('.bsky-service-card');
      expect(card?.textContent).toContain('me.bsky.social');
      // The entryway/self-hosted distinction is the real information here for
      // the kind of person who runs their own PDS.
      expect(card?.textContent).toContain('entryway');
      // Bluesky has no per-instance donation model, so that block does not exist
      // here rather than being translated into something meaningless.
      expect(card?.querySelector('.donate-link')).toBeNull();
    });

    it('hides the trends card entirely when the unspecced endpoint refuses', () => {
      seedBlueskyPrimary();
      const fixture = render();
      // `unspecced` is unstable by name: a refusal must hide the card, never
      // render an empty one and never surface an error.
      //
      // Refusing `getTrends` falls back to `getTrendingTopics`, so both have to
      // be refused to reach the "no trends at all" state — which is itself worth
      // pinning, since the fallback is the reason there are two endpoints.
      httpMock
        .expectOne((r) => r.url.includes('getTrends'))
        .flush({}, { status: 400, statusText: 'Bad Request' });
      httpMock
        .expectOne((r) => r.url.includes('getTrendingTopics'))
        .flush({}, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.bsky-trend')).toBeNull();
      expect(el.textContent).not.toContain('Trending on Bluesky');
    });

    it('falls back to getTrendingTopics when getTrends refuses', () => {
      seedBlueskyPrimary();
      const fixture = render();
      httpMock
        .expectOne((r) => r.url.includes('getTrends'))
        .flush({}, { status: 404, statusText: 'Not Found' });
      httpMock
        .expectOne((r) => r.url.includes('getTrendingTopics'))
        .flush({
          topics: [{ displayName: 'A topic', link: '/profile/did:plc:x/feed/y' }],
        });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      const trend = el.querySelector<HTMLAnchorElement>('a.bsky-trend');
      expect(trend?.textContent).toContain('A topic');
      // A Bluesky trend links to a generated feed, not a tag timeline, and the
      // API returns a site-relative path — resolving it against Mawkingbird's
      // own origin would 404.
      expect(trend?.getAttribute('href')).toBe('https://bsky.app/profile/did:plc:x/feed/y');
    });

    it('gives the Mastodon widgets back once the connector is opted into', () => {
      seedBlueskyPrimary();
      TestBed.inject(MastodonConnector).enableAnonymous();
      const fixture = render();
      // The instance card reads `usage.users`, so answer it with the shape the
      // real endpoint returns rather than a bare {}.
      httpMock
        .match((r) => r.url === '/api/v2/instance' || r.url === '/api/v1/instance')
        .forEach((req) =>
          req.flush({
            domain: 'mastodon.social',
            title: 'Mastodon',
            version: '4.3.0',
            usage: { users: { active_month: 1 } },
          }),
        );
      httpMock.match(() => true).forEach((req) => req.flush({}));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.donate-block')).not.toBeNull();
      expect(
        [...el.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) => a.getAttribute('href')),
      ).toContain('https://joinmastodon.org/sponsors');
    });

    it('leaves a mastodon-primary account’s rails untouched', () => {
      localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
      localStorage.setItem('mastodon_mock_token', 'tok');
      TestBed.inject(Auth).account.set({ id: '1', acct: 'matt@elekk.xyz' } as Account);
      const fixture = setUp();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      // The standing regression clause: an existing Mastodon session sees no
      // change at all, and gains no Bluesky chrome it did not ask for.
      expect(el.querySelector('.donate-block')).not.toBeNull();
      expect(el.querySelector('.server-mode-card')).not.toBeNull();
      expect(el.querySelector('.bsky-service-card')).toBeNull();
      expect(el.querySelector('.bsky-trend')).toBeNull();
    });

    it('house ads render for a Bluesky-primary account, unchanged', () => {
      seedBlueskyPrimary();
      const fixture = render();
      httpMock.match(() => true).forEach((req) => req.flush({}));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      // Network-agnostic, and the one thing in the rail that is about
      // Mawkingbird rather than about a network. They stay in every combination.
      expect(el.querySelectorAll('.spotlight-card')).toHaveLength(HOUSE_ADS_SHOWN);
    });
  });
});
