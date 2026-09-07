import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import korean from '../../../public/i18n/ko.json';
import { FeatureFlags } from '../feature-flags';
import { Signal, WritableSignal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { Drafts } from '../drafts';
import { Status, Translation } from '../models';
import { StatusCard } from './status-card';
import {
  parseAnonymousAccountRouteRef,
  parseAnonymousStatusRouteRef,
} from '../providers/anonymous/anonymous-route-ref';
import { AiTranslate } from '../ai-translate';
import { OpenRouterSession } from '../providers/openrouter/openrouter-session';
import { TranslationPreference } from '../translation-preference';
import { AnonymousBookmarks } from '../providers/anonymous/anonymous-bookmarks';
import { HugoSettings } from '../providers/hugo/hugo-settings';
import { PosseQueue } from '../providers/hugo/posse-queue';
import { seedBskyIdentity, seedBskySession } from '../testing/seed-storage';

/** Expose protected signals/methods for white-box testing. */
interface StatusCardInternals {
  replying: WritableSignal<boolean>;
  quoting: WritableSignal<boolean>;
  showReport: WritableSignal<boolean>;
  reported: WritableSignal<boolean>;
  editing: WritableSignal<boolean>;
  editText: WritableSignal<string>;
  saving: WritableSignal<boolean>;
  translation: WritableSignal<Translation | null>;
  translating: WritableSignal<boolean>;
  pollSelection: WritableSignal<number[]>;
  showPolicyMenu: WritableSignal<boolean>;
  showHistory: WritableSignal<boolean>;
  lightboxIndex: WritableSignal<number | null>;
  openLightbox(index: number, event: Event): void;
  onContentClick(event: MouseEvent): void;
}

function internals(fixture: ComponentFixture<StatusCard>): StatusCardInternals {
  return fixture.componentInstance as unknown as StatusCardInternals;
}

// ---------------------------------------------------------------- shared test data

function makeAccount(id = '1') {
  return {
    id,
    username: `user${id}`,
    acct: `user${id}`,
    display_name: `User ${id}`,
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
  };
}

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    id: '1',
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content: '<p>Hello</p>',
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: makeAccount('1'),
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
    ...overrides,
  };
}

function fakeEvent(): Event {
  return { stopPropagation: vi.fn() } as unknown as Event;
}

describe('StatusCard', () => {
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

  /** Creates a fixture, sets the required `status` input, and runs the first CD cycle. */
  function setUp(status = makeStatus()): ComponentFixture<StatusCard> {
    const fixture = TestBed.createComponent(StatusCard);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * Clicking the card's own whitespace opens the thread.
   *
   * The bug: navigation hung off the anchor around the post *text*, so an
   * image-only post had nothing to click. The risk in fixing it is the opposite
   * failure — a card that eats clicks meant for its own buttons — so most of
   * these tests are about what must NOT navigate.
   */
  describe('clicking the card body', () => {
    function clickOn(fixture: ComponentFixture<StatusCard>, selector: string): MouseEvent {
      const el = (fixture.nativeElement as HTMLElement).querySelector(selector);
      expect(el, `no element matched ${selector}`).not.toBeNull();
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      el!.dispatchEvent(event);
      return event;
    }

    it('opens the thread when the click lands on the card itself', () => {
      const fixture = setUp(makeStatus({ id: '42' }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      clickOn(fixture, 'article.status');

      expect(navigate).toHaveBeenCalledWith(['/statuses', '42']);
    });

    // The reported case: no text at all, so the content anchor is empty and the
    // whole card is the only thing left to click.
    it('opens the thread from an image-only post', () => {
      const fixture = setUp(
        makeStatus({
          id: '43',
          content: '',
          media_attachments: [
            { id: 'm1', type: 'image', url: 'https://example.com/a.png', preview_url: '' },
          ] as Status['media_attachments'],
        }),
      );
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      clickOn(fixture, 'article.status');

      expect(navigate).toHaveBeenCalledWith(['/statuses', '43']);
    });

    /**
     * Post text used to be wrapped in its own routerLink, so a click navigated
     * before a selection could be made and a double-click navigated on the
     * first of the pair. The card handler does the job now.
     */
    it('opens the thread from post text without making the text a link', () => {
      const fixture = setUp(makeStatus({ id: '45' }));
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('a.content-link')).toBeNull();

      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      clickOn(fixture, '.content');

      expect(navigate).toHaveBeenCalledWith(['/statuses', '45']);
    });

    it('leaves a selection alone rather than navigating away from it', () => {
      const fixture = setUp(makeStatus({ id: '46' }));
      const el = fixture.nativeElement as HTMLElement;
      const article = el.querySelector('article.status')!;

      // The gesture that ends a selection: the browser collapses it on
      // mousedown, so the card snapshots it there rather than reading it late.
      const selection = getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(el.querySelector('.content')!);
      selection.removeAllRanges();
      selection.addRange(range);

      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      article.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      selection.removeAllRanges();
      clickOn(fixture, '.content');

      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not navigate when an action button was clicked', () => {
      const fixture = setUp(makeStatus({ id: '44' }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      clickOn(fixture, '[aria-label="Reply"]');

      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not navigate when a media thumbnail was clicked', () => {
      const fixture = setUp(
        makeStatus({
          id: '45',
          media_attachments: [
            { id: 'm1', type: 'image', url: 'https://example.com/a.png', preview_url: '' },
          ] as Status['media_attachments'],
        }),
      );
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      clickOn(fixture, '.media-thumb');

      // That click belongs to the lightbox.
      expect(navigate).not.toHaveBeenCalled();
    });

    /**
     * Clicking the card to dismiss an existing selection must not navigate.
     *
     * The sequence matters and is the point of this test. A real browser
     * collapses the selection on `mousedown`, so a guard reading the live
     * selection during `click` sees nothing and navigates anyway. The test
     * therefore dispatches mousedown *while* the selection exists and clears it
     * before the click, the way a browser actually does.
     */
    it('does not navigate when the gesture began with text selected', () => {
      const fixture = setUp(makeStatus({ id: '46' }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const article = (fixture.nativeElement as HTMLElement).querySelector('article.status')!;

      let selected = 'some highlighted words';
      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => selected,
      } as unknown as Selection);

      article.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      selected = ''; // The browser collapses it before the click arrives.
      article.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );

      expect(navigate).not.toHaveBeenCalled();
    });

    it('still navigates on a plain click with nothing selected', () => {
      const fixture = setUp(makeStatus({ id: '49' }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const article = (fixture.nativeElement as HTMLElement).querySelector('article.status')!;

      article.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      article.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );

      expect(navigate).toHaveBeenCalledWith(['/statuses', '49']);
    });

    // A selection left over from earlier must not disable the card forever.
    it('navigates on the next click after a selection is dropped', () => {
      const fixture = setUp(makeStatus({ id: '50' }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const article = (fixture.nativeElement as HTMLElement).querySelector('article.status')!;

      let selected = 'highlighted';
      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => selected,
      } as unknown as Selection);

      article.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      selected = '';
      article.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
      expect(navigate).not.toHaveBeenCalled();

      article.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      article.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
      expect(navigate).toHaveBeenCalledWith(['/statuses', '50']);
    });

    it.each([
      ['ctrl', { ctrlKey: true }],
      ['meta', { metaKey: true }],
      ['shift', { shiftKey: true }],
    ])('leaves %s-click to the browser', (_name, modifier) => {
      const fixture = setUp(makeStatus({ id: '47' }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      const article = (fixture.nativeElement as HTMLElement).querySelector('article.status')!;
      article.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...modifier }),
      );

      expect(navigate).not.toHaveBeenCalled();
    });

    it('leaves middle-click to the browser', () => {
      const fixture = setUp(makeStatus({ id: '48' }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      const article = (fixture.nativeElement as HTMLElement).querySelector('article.status')!;
      article.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 }),
      );

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('hides write actions and menus in Anonymous', () => {
    TestBed.inject(Auth).enterAnonymous();
    const f = setUp(makeStatus({ reblogs_count: 2, favourites_count: 3 }));
    const el = f.nativeElement as HTMLElement;

    expect(el.querySelector('[aria-label="Reply"]')).toBeNull();
    expect(el.querySelector('[aria-label="Boost"]')).toBeNull();
    expect(el.querySelector('[aria-label="Favourite"]')).toBeNull();
    // Bookmarking is deliberately available here: AnonymousCapabilities sets
    // canBookmark, because it is client-side only and never reaches the server.
    // This used to be asserted absent, which only passed because the button had
    // no accessible name to find it by.
    expect(el.querySelector('[aria-label="Bookmark"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Translate');
    expect(el.textContent).not.toContain('Report');
    expect(el.textContent).toContain('2');
    expect(el.textContent).toContain('3');
    expect(el.querySelector('[title="Replies"]')?.textContent).toContain('0');
    // The boost counter's title follows the reader's vocabulary setting now
    // (posts/tweets/florps), so it is selected by the default label rather than
    // the hardcoded "Reposts" it used to carry.
    expect(el.querySelector('[title="Boosts"]')?.textContent).toContain('2');
    expect(el.querySelector('[title="Favourites"]')?.textContent).toContain('3');
  });

  /**
   * Anonymous readers used to get counts rendered as `<span class="action">`.
   * `.action` carries `cursor: pointer` and a hover highlight, so those spans
   * looked exactly like the working buttons beside them and did nothing at all
   * when tapped — on a phone, indistinguishable from a tap that missed.
   */
  describe('Anonymous actions answer the tap', () => {
    it('offers a way in when an anonymous reader taps like', () => {
      TestBed.inject(Auth).enterAnonymous();
      const f = setUp(makeStatus({ favourites_count: 3 }));
      const el = f.nativeElement as HTMLElement;

      const like = el.querySelector<HTMLButtonElement>('button[title="Favourites"]');
      expect(like).not.toBeNull();

      like!.click();
      f.detectChanges();

      expect(el.querySelector('app-sign-in-prompt')).not.toBeNull();
    });

    it('sends an anonymous reader from the comment count to the thread', () => {
      TestBed.inject(Auth).enterAnonymous();
      const f = setUp(makeStatus({ replies_count: 2 }));
      const el = f.nativeElement as HTMLElement;

      // A real link, not an inert span: reading replies never needed an account.
      const comments = el.querySelector<HTMLAnchorElement>('a[title="Replies"]');
      expect(comments).not.toBeNull();
      expect(comments!.getAttribute('href')).toBe('/statuses/1');
    });

    it('never dresses a bare count as something tappable', () => {
      TestBed.inject(Auth).enterAnonymous();
      // No url, so there is nothing to share and the boost count is only a number.
      const f = setUp(makeStatus({ reblogs_count: 2, url: null }));
      const el = f.nativeElement as HTMLElement;

      const boosts = el.querySelector('[title="Boosts"]');
      expect(boosts?.tagName).toBe('SPAN');
      expect(boosts?.classList.contains('action-static')).toBe(true);
    });
  });

  /**
   * `[disabled]` was the whole of the feedback, and a disabled icon button looks
   * exactly like an idle one — so a tap that landed and a tap that missed the
   * target produced the same picture. Worse, one flag disabled all five controls
   * at once, so pressing Like made the card look like it was doing five things.
   */
  describe('feedback while an action is in flight', () => {
    function likeButton(f: ComponentFixture<StatusCard>): HTMLButtonElement {
      return (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[aria-label="Favourite"]',
      )!;
    }

    it('shows the like as done before the server answers', () => {
      const f = setUp(makeStatus({ id: '7', favourites_count: 4 }));

      likeButton(f).click();
      f.detectChanges();

      const el = f.nativeElement as HTMLElement;
      // The icon flips and the count moves with it: "Liked" beside an unchanged
      // number is its own kind of broken.
      expect(el.querySelector('[aria-label="Undo favourite"]')).not.toBeNull();
      expect(el.textContent).toContain('5');
      httpMock.expectOne((r) => r.url.includes('/favourite'));
    });

    it('marks only the pressed control as working', () => {
      const f = setUp(makeStatus({ id: '8' }));

      likeButton(f).click();
      f.detectChanges();

      const el = f.nativeElement as HTMLElement;
      const working = [...el.querySelectorAll('.action.working')];
      expect(working.length).toBe(1);
      httpMock.expectOne((r) => r.url.includes('/favourite'));
    });

    it('puts the like back when the request fails', () => {
      const f = setUp(makeStatus({ id: '9', favourites_count: 4 }));

      likeButton(f).click();
      httpMock
        .expectOne((r) => r.url.includes('/favourite'))
        .flush(null, { status: 500, statusText: 'Server Error' });
      f.detectChanges();

      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('[aria-label="Favourite"]')).not.toBeNull();
      expect(el.querySelector('.action.working')).toBeNull();
      expect(el.textContent).toContain('4');
    });
  });

  /**
   * Reported as "clicking replies just pops me to the top of the page".
   *
   * `[href]` bound to a null `display.url` renders `href=""`, and an empty href
   * is not an inert link — it points at the current page, so clicking it
   * reloads the route and dumps the reader back at the top of the feed. A
   * foreign post without a url (a Bluesky post whose adapter had none) put one
   * of these in the action row right beside the reply count.
   */
  it('never renders a link that navigates to the current page', () => {
    const f = setUp(makeStatus({ id: 'bsky:1', provider: 'bluesky', url: null }));
    const el = f.nativeElement as HTMLElement;

    for (const anchor of el.querySelectorAll('a')) {
      expect(anchor.getAttribute('href')).not.toBe('');
    }
  });

  it('still offers the original when the post has one', () => {
    const f = setUp(makeStatus({ id: 'bsky:2', provider: 'bluesky', url: 'https://bsky.app/p/2' }));

    const link = (f.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.open-original',
    );
    expect(link?.getAttribute('href')).toBe('https://bsky.app/p/2');
  });

  it('links the booster to their profile', () => {
    // "John Doe boosted this" was bare text, so muting their boosts — or just
    // finding out who they are — meant searching the name by hand.
    const booster = makeAccount('99');
    booster.display_name = 'John Doe';
    booster.acct = 'john@social.example';
    const f = setUp(makeStatus({ account: booster, reblog: makeStatus({ id: '5' }) }));
    const el = f.nativeElement as HTMLElement;

    const link = el.querySelector<HTMLAnchorElement>('.boost-by');
    expect(link?.textContent?.trim()).toBe('John Doe');
    expect(link?.getAttribute('href')).toContain('99');
  });

  it('opens the share-elsewhere dialog from the Anonymous boost button', () => {
    TestBed.inject(Auth).enterAnonymous();
    const f = setUp(makeStatus({ url: 'https://social.example/@alice/1' }));
    const share = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[aria-label="Share elsewhere"]',
    )!;

    share.click();
    f.detectChanges();

    expect((f.nativeElement as HTMLElement).querySelector('app-share-dialog')).not.toBeNull();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Share elsewhere');
  });

  describe('unified share menu', () => {
    function boostButton(f: ComponentFixture<StatusCard>): HTMLButtonElement | null {
      return (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[aria-label="Boost"], [aria-label="Boost, quote or share"]',
      );
    }

    it('leaves the action bar untouched while the flag is off', () => {
      // The default. Boost is its own button and there is no menu — this is the
      // guarantee that turning the flag on is the only thing that moves anything.
      const f = setUp(makeStatus({ url: 'https://social.example/@alice/1' }));
      const element = f.nativeElement as HTMLElement;

      expect(element.querySelector('[aria-label="Boost"]')).not.toBeNull();
      expect(element.querySelector('.share-menu-host')).toBeNull();
      expect(element.querySelector('[aria-haspopup="menu"]')).toBeNull();
    });

    it('collapses boost, quote and share into one control when on', () => {
      TestBed.inject(FeatureFlags).setState('unified-share', 'production');
      const f = setUp(makeStatus({ url: 'https://social.example/@alice/1' }));
      const element = f.nativeElement as HTMLElement;

      // One control where there were up to three.
      expect(element.querySelector('.share-menu-host')).not.toBeNull();
      expect(element.querySelector('[aria-label="Boost"]')).toBeNull();
      expect(element.querySelector('.share-menu')).toBeNull();

      boostButton(f)!.click();
      f.detectChanges();

      const items = Array.from(
        element.querySelectorAll<HTMLButtonElement>('.share-menu [role="menuitem"]'),
      ).map((button) => button.textContent?.trim());
      expect(items).toContain('Boost');
      expect(items).toContain('Quote');
      expect(items).toContain('Share elsewhere…');
    });

    it('boosts from the menu without reimplementing boosting', () => {
      TestBed.inject(FeatureFlags).setState('unified-share', 'production');
      const f = setUp(makeStatus({ url: 'https://social.example/@alice/1' }));
      const element = f.nativeElement as HTMLElement;

      boostButton(f)!.click();
      f.detectChanges();
      const boost = Array.from(
        element.querySelectorAll<HTMLButtonElement>('.share-menu [role="menuitem"]'),
      ).find((button) => button.textContent?.trim() === 'Boost')!;
      boost.click();
      f.detectChanges();

      // The menu delegates to the existing boost path rather than owning a
      // second one, so the ordinary reblog request is what goes out.
      httpMock.expectOne('/api/v1/statuses/1/reblog').flush(makeStatus({ reblogged: true }));
      f.detectChanges();

      expect(element.querySelector('.share-menu')).toBeNull();
    });

    it('opens the share dialog from the menu', () => {
      TestBed.inject(FeatureFlags).setState('unified-share', 'production');
      const f = setUp(makeStatus({ url: 'https://social.example/@alice/1' }));
      const element = f.nativeElement as HTMLElement;

      boostButton(f)!.click();
      f.detectChanges();
      Array.from(element.querySelectorAll<HTMLButtonElement>('.share-menu [role="menuitem"]'))
        .find((button) => button.textContent?.trim() === 'Share elsewhere…')!
        .click();
      f.detectChanges();

      expect(element.querySelector('app-share-dialog')).not.toBeNull();
    });

    it('keeps the b and q keyboard shortcuts off the menu', () => {
      // They call toggleReblog/toggleQuote directly, so the menu must not become
      // a required step for anyone using the keyboard.
      TestBed.inject(FeatureFlags).setState('unified-share', 'production');
      const f = setUp(makeStatus({ url: 'https://social.example/@alice/1' }));
      const element = f.nativeElement as HTMLElement;

      element
        .querySelector('article')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
      f.detectChanges();

      expect(element.querySelector('.share-menu')).toBeNull();
      expect(element.querySelector('app-compose')).not.toBeNull();
    });
  });

  it('loads public edit history from the post server in Anonymous', () => {
    TestBed.inject(Auth).enterAnonymous('https://home.example');
    const f = setUp(
      makeStatus({
        id: 'anonymous-mastodon:social.example:100',
        provider: 'anonymous-mastodon',
        edited_at: '2026-01-01T00:00:00.000Z',
        providerRef: {
          server: 'https://social.example',
          statusId: '100',
          accountId: '7',
        },
      }),
    );

    (f.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[title="Edit history"]')!
      .click();
    f.detectChanges();

    const req = httpMock.expectOne('https://social.example/api/v1/statuses/100/history');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('links Anonymous Mastodon avatars and posts to public in-app routes', () => {
    TestBed.inject(Auth).enterAnonymous('https://home.example');
    const fixture = setUp(
      makeStatus({
        id: 'anonymous-mastodon:social.example:100',
        provider: 'anonymous-mastodon',
        url: 'https://social.example/@user1/100',
        account: { ...makeAccount('7'), url: 'https://social.example/@user1' },
        providerRef: {
          server: 'https://social.example',
          statusId: '100',
          accountId: '7',
        },
      }),
    );
    const element = fixture.nativeElement as HTMLElement;
    const accountSegment = element
      .querySelector<HTMLAnchorElement>('a.avatar-link')!
      .getAttribute('href')!
      .split('/')
      .at(-1)!;
    const statusSegment = element
      .querySelector<HTMLAnchorElement>('a.post-time')!
      .getAttribute('href')!
      .split('/')
      .at(-1)!;

    expect(parseAnonymousAccountRouteRef(decodeURIComponent(accountSegment))).toEqual({
      server: 'https://social.example',
      id: '7',
      originalUrl: 'https://social.example/@user1',
    });
    expect(parseAnonymousStatusRouteRef(decodeURIComponent(statusSegment))).toEqual({
      server: 'https://social.example',
      id: '100',
      originalUrl: 'https://social.example/@user1/100',
    });
  });

  // ---------------------------------------------------------------- action errors

  it('updates Korean boost counts when the dictionary changes and preserves English terminology', () => {
    const f = setUp(makeStatus({ reblogs_count: 7 }));
    const cmp = f.componentInstance as any;
    const transloco = TestBed.inject(TranslocoService);
    const availableLangs = transloco.getAvailableLangs();
    expect(cmp.countWords().boosts).toBe(cmp.words().boosts);
    transloco.setAvailableLangs(['en', 'ko']);
    try {
      transloco.setTranslation(korean, 'ko');
      transloco.setActiveLang('ko');
      f.detectChanges();
      expect(cmp.countWords().boosts).toBe('부스트');
      expect(cmp.countWords().BoostedBy).toBe('부스트');
      expect((f.nativeElement as HTMLElement).textContent).toContain('부스트: 7');
      transloco.setActiveLang('en');
      expect(cmp.countWords().boosts).toBe(cmp.words().boosts);
    } finally {
      transloco.setActiveLang('en');
      transloco.setAvailableLangs(availableLangs);
    }
  });

  it('renders a Korean action failure without injecting an English verb', () => {
    const f = setUp(makeStatus({ id: '5' }));
    const transloco = TestBed.inject(TranslocoService);
    const availableLangs = transloco.getAvailableLangs();
    transloco.setAvailableLangs(['en', 'ko']);
    try {
      transloco.setTranslation(korean, 'ko');
      transloco.setActiveLang('ko');
      f.componentInstance.toggleFavourite(fakeEvent());
      httpMock.expectOne('/api/v1/statuses/5/favourite').flush('failed', {
        status: 500,
        statusText: 'Server Error',
      });
      f.detectChanges();
      expect(
        (f.nativeElement as HTMLElement).querySelector('.action-error')?.textContent,
      ).toContain('좋아요 작업을 완료할 수 없습니다');
      transloco.setActiveLang('en');
    } finally {
      transloco.setActiveLang('en');
      transloco.setAvailableLangs(availableLangs);
    }
  });

  it('a failed favourite surfaces an error instead of failing silently', () => {
    const bsky = makeStatus({
      id: 'bsky:at://did:plc:x/app.bsky.feed.post/1',
      provider: 'bluesky',
      providerRef: {
        uri: 'at://did:plc:x/app.bsky.feed.post/1',
        cid: 'c1',
        likeUri: null,
        repostUri: null,
        replyRoot: { uri: 'at://did:plc:x/app.bsky.feed.post/1', cid: 'c1' },
        replyParentUri: null,
        externalUri: null,
      },
    });
    // BlueskyApi has no session in tests → toggleFavourite errors immediately.
    const f = setUp(bsky);
    const cmp = f.componentInstance as any;

    cmp.toggleFavourite(fakeEvent());

    expect(cmp.actionBusy()).toBe(false);
    expect(cmp.actionError()).toContain('Re-link in Settings');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('.action-error')).not.toBeNull();
  });

  it('a successful favourite clears busy state and emits changed', () => {
    const f = setUp(makeStatus({ id: '5' }));
    const cmp = f.componentInstance as any;
    const changed: Status[] = [];
    f.componentInstance.changed.subscribe((s: Status) => changed.push(s));

    cmp.toggleFavourite(fakeEvent());
    expect(cmp.actionBusy()).toBe(true);
    httpMock
      .expectOne('/api/v1/statuses/5/favourite')
      .flush(makeStatus({ id: '5', favourited: true }));

    expect(cmp.actionBusy()).toBe(false);
    expect(cmp.actionError()).toBeNull();
    expect(changed[0]?.favourited).toBe(true);
  });

  // ---------------------------------------------------------------- POSSE

  /** A connected Hugo blog with interaction recording switched on. */
  function enablePosse(): void {
    TestBed.inject(HugoSettings).connect('tok', {
      owner: 'mistersql',
      repo: 'my-blog',
      branch: 'main',
      contentPath: 'content/posts',
      siteUrl: null,
      includeInProfile: false,
      posse: true,
    });
  }

  it('issues exactly the same request whether or not POSSE is on', () => {
    // The safety property of the whole feature: recording is additive, and a
    // POSSE bug must never make a working like look broken.
    enablePosse();
    const f = setUp(makeStatus({ id: '5', url: 'https://m.social/@u/5' }));

    (f.componentInstance as any).toggleFavourite(fakeEvent());

    httpMock
      .expectOne('/api/v1/statuses/5/favourite')
      .flush(makeStatus({ id: '5', favourited: true }));
    httpMock.verify();
    expect((f.componentInstance as any).actionError()).toBeNull();
  });

  it('records a like to the queue when POSSE is on', () => {
    enablePosse();
    const f = setUp(makeStatus({ id: '5', url: 'https://m.social/@u/5' }));

    (f.componentInstance as any).toggleFavourite(fakeEvent());
    httpMock
      .expectOne('/api/v1/statuses/5/favourite')
      .flush(makeStatus({ id: '5', url: 'https://m.social/@u/5', favourited: true }));

    const queue = TestBed.inject(PosseQueue);
    expect(queue.count()).toBe(1);
    expect(queue.entries()[0]).toMatchObject({
      kind: 'like',
      targetUrl: 'https://m.social/@u/5',
    });
  });

  it('records nothing at all when POSSE is off', () => {
    const f = setUp(makeStatus({ id: '5', url: 'https://m.social/@u/5' }));

    (f.componentInstance as any).toggleFavourite(fakeEvent());
    httpMock
      .expectOne('/api/v1/statuses/5/favourite')
      .flush(makeStatus({ id: '5', favourited: true }));

    expect(TestBed.inject(PosseQueue).count()).toBe(0);
  });

  it('un-liking removes a record that has not been published yet', () => {
    enablePosse();
    const f = setUp(makeStatus({ id: '5', url: 'https://m.social/@u/5', favourited: true }));

    (f.componentInstance as any).toggleFavourite(fakeEvent());
    httpMock
      .expectOne('/api/v1/statuses/5/unfavourite')
      .flush(makeStatus({ id: '5', url: 'https://m.social/@u/5', favourited: false }));

    // Liking and immediately un-liking leaves nothing behind.
    expect(TestBed.inject(PosseQueue).count()).toBe(0);
  });

  it('records nothing when a like fails', () => {
    enablePosse();
    const f = setUp(makeStatus({ id: '5', url: 'https://m.social/@u/5' }));

    (f.componentInstance as any).toggleFavourite(fakeEvent());
    httpMock
      .expectOne('/api/v1/statuses/5/favourite')
      .flush({}, { status: 500, statusText: 'Server Error' });

    // Only the success path records: a like that did not happen is not a like.
    expect(TestBed.inject(PosseQueue).count()).toBe(0);
  });

  // ------------------------------------------------- POSSE-only (RSS, Twitter)

  function rssStatus() {
    return makeStatus({
      id: 'rss:https://blog.example/feed.xml::1',
      url: 'https://blog.example/posts/hello/',
      provider: 'rss',
    } as Partial<Status>);
  }

  it('offers record-only like and boost on an RSS item when POSSE is on', () => {
    enablePosse();
    const f = setUp(rssStatus());

    const buttons = [
      ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.action'),
    ].map((b) => b.getAttribute('title'));
    expect(buttons.some((t) => t?.includes('Record a like'))).toBe(true);
    expect(buttons.some((t) => t?.includes('Record a boost'))).toBe(true);
  });

  it('shows exactly one recycle symbol on an RSS item under unified share', () => {
    // The bug this fixes: with both the unified control and POSSE on, a feed
    // item grew *two* 🔁 buttons — one whose menu held only "Share elsewhere…",
    // and one that recorded a boost on your own blog. Two identical symbols,
    // and nothing on screen said which was which.
    TestBed.inject(FeatureFlags).setState('unified-share', 'production');
    enablePosse();
    const f = setUp(rssStatus());
    const element = f.nativeElement as HTMLElement;

    const recycles = [...element.querySelectorAll<HTMLElement>('button.action')].filter((button) =>
      button.textContent?.includes('🔁'),
    );
    expect(recycles.length).toBe(1);
  });

  it('goes straight to the share dialog on an RSS item, with no middleman menu', () => {
    // Boost and quote are both impossible on a feed item, so the menu had one
    // entry. A one-entry menu is not a choice, it is an extra click between the
    // reader and the dialog they already asked for.
    TestBed.inject(FeatureFlags).setState('unified-share', 'production');
    const f = setUp(rssStatus());
    const element = f.nativeElement as HTMLElement;

    const button = element.querySelector<HTMLButtonElement>('.share-menu-host button.action')!;
    // It announces a dialog, not a menu, because that is what it opens.
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-label')).toBe('Share this article');

    button.click();
    f.detectChanges();

    expect(element.querySelector('.share-menu')).toBeNull();
    expect(element.querySelector('app-share-dialog')).not.toBeNull();
  });

  it('names POSSE in words when the menu carries it beside a real share', () => {
    // With POSSE on there are two things to choose between, so the menu earns
    // its existence again — and the blog option says "my blog" rather than
    // being a second bare recycle symbol.
    TestBed.inject(FeatureFlags).setState('unified-share', 'production');
    enablePosse();
    const f = setUp(rssStatus());
    const element = f.nativeElement as HTMLElement;

    const button = element.querySelector<HTMLButtonElement>('.share-menu-host button.action')!;
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    button.click();
    f.detectChanges();

    const items = [
      ...element.querySelectorAll<HTMLButtonElement>('.share-menu [role="menuitem"]'),
    ].map((b) => b.textContent?.trim());
    expect(items).toEqual(['Record a boost on my blog', 'Share elsewhere…']);
    // Boost and quote are not offered, because a feed has no endpoint for them.
    expect(items).not.toContain('Boost');
    expect(items).not.toContain('Quote');
  });

  it('keeps the three-item menu on a Mastodon post', () => {
    // The counterpart guarantee: nothing about the RSS fix narrows a real post,
    // where Boost, Quote and Share are three genuinely different actions.
    TestBed.inject(FeatureFlags).setState('unified-share', 'production');
    const f = setUp(makeStatus({ url: 'https://social.example/@alice/1' }));
    const element = f.nativeElement as HTMLElement;

    const button = element.querySelector<HTMLButtonElement>('.share-menu-host button.action')!;
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    button.click();
    f.detectChanges();

    const items = [
      ...element.querySelectorAll<HTMLButtonElement>('.share-menu [role="menuitem"]'),
    ].map((b) => b.textContent?.trim());
    expect(items).toEqual(['Boost', 'Quote', 'Share elsewhere…']);
  });

  it('records an RSS like without making any request at all', () => {
    enablePosse();
    const f = setUp(rssStatus());

    (f.componentInstance as any).togglePosseOnly('like', fakeEvent());

    // There is no endpoint to call for a feed item — pretending otherwise is
    // exactly what PROVIDER_CAPS.rss correctly refuses.
    httpMock.verify();
    const queue = TestBed.inject(PosseQueue);
    expect(queue.count()).toBe(1);
    expect(queue.entries()[0]).toMatchObject({
      kind: 'like',
      targetUrl: 'https://blog.example/posts/hello/',
      provider: 'rss',
    });
  });

  it('un-records an RSS like, since the queue is the only state there is', () => {
    enablePosse();
    const f = setUp(rssStatus());
    const cmp = f.componentInstance as any;

    cmp.togglePosseOnly('like', fakeEvent());
    expect(cmp.posseQueued('like')).toBe(true);
    cmp.togglePosseOnly('like', fakeEvent());

    expect(cmp.posseQueued('like')).toBe(false);
    expect(TestBed.inject(PosseQueue).count()).toBe(0);
  });

  it('shows no record-only buttons when POSSE is off', () => {
    const f = setUp(rssStatus());

    // A button that records nowhere is a button that does nothing.
    const titles = [
      ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.action'),
    ].map((b) => b.getAttribute('title'));
    expect(titles.some((t) => t?.includes('Record a'))).toBe(false);
  });

  it('never offers record-only buttons on the reader’s own content', () => {
    enablePosse();
    const f = setUp(
      makeStatus({
        id: 'blog:hugo:mine',
        url: 'https://mistersql.github.io/mistersql/posts/mine/',
        provider: 'blog',
      } as Partial<Status>),
    );

    // Recording that you liked your own writing is not worth a commit.
    expect((f.componentInstance as any).posseOnly()).toBe(false);
  });

  // ---------------------------------------------------------------- display / boostedBy

  it('display returns the status itself when it is not a reblog', () => {
    const s = makeStatus({ id: '42' });
    const f = setUp(s);
    expect(f.componentInstance.display.id).toBe('42');
  });

  it('display unwraps the reblog when the status is a boost', () => {
    const original = makeStatus({ id: 'orig' });
    const boost = makeStatus({ id: 'boost', reblog: original });
    const f = setUp(boost);
    expect(f.componentInstance.display.id).toBe('orig');
  });

  it('boostedBy returns null for a plain status', () => {
    const f = setUp(makeStatus());
    expect(f.componentInstance.boostedBy).toBeNull();
  });

  it('boostedBy returns the booster display_name for a reblog', () => {
    const booster = makeAccount('2');
    booster.display_name = 'Booster McBoostface';
    const boost = makeStatus({ account: booster, reblog: makeStatus({ id: 'orig' }) });
    const f = setUp(boost);
    expect(f.componentInstance.boostedBy).toBe('Booster McBoostface');
  });

  // ---------------------------------------------------------------- openReport / onReported

  it('openReport: sets showReport and calls stopPropagation', () => {
    const f = setUp();
    const ev = fakeEvent();
    f.componentInstance.openReport(ev);
    expect(internals(f).showReport()).toBe(true);
    expect((ev.stopPropagation as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('onReported: hides the report dialog and marks the status as reported', () => {
    const f = setUp();
    f.componentInstance.openReport(fakeEvent());
    f.componentInstance.onReported();
    expect(internals(f).showReport()).toBe(false);
    expect(internals(f).reported()).toBe(true);
  });

  // ---------------------------------------------------------------- startEdit / cancelEdit

  it('startEdit: fetches status source and opens the edit field', () => {
    const f = setUp();
    f.componentInstance.startEdit(fakeEvent());

    const req = httpMock.expectOne('/api/v1/statuses/1/source');
    req.flush({ id: '1', text: 'original text', spoiler_text: '' });

    expect(internals(f).editing()).toBe(true);
    expect(internals(f).editText()).toBe('original text');
  });

  it('cancelEdit: closes the edit field', () => {
    const f = setUp();
    f.componentInstance.startEdit(fakeEvent());
    httpMock.expectOne('/api/v1/statuses/1/source').flush({ id: '1', text: 'x', spoiler_text: '' });

    f.componentInstance.cancelEdit();
    expect(internals(f).editing()).toBe(false);
  });

  // ---------------------------------------------------------------- saveEdit

  it('saveEdit: PUTs updated text and emits changed with the server response', () => {
    const changed: Status[] = [];
    const f = setUp();
    f.componentInstance.changed.subscribe((s) => changed.push(s));

    // Open edit mode.
    f.componentInstance.startEdit(fakeEvent());
    httpMock
      .expectOne('/api/v1/statuses/1/source')
      .flush({ id: '1', text: 'old', spoiler_text: '' });

    internals(f).editText.set('new content');
    f.componentInstance.saveEdit();

    const req = httpMock.expectOne('/api/v1/statuses/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.status).toBe('new content');
    const updated = makeStatus({ id: '1', content: '<p>new content</p>' });
    req.flush(updated);

    expect(changed).toHaveLength(1);
    expect(changed[0].content).toBe('<p>new content</p>');
    expect(internals(f).editing()).toBe(false);
  });

  it('saveEdit: does nothing when text is blank', () => {
    const f = setUp();
    f.componentInstance.startEdit(fakeEvent());
    httpMock.expectOne('/api/v1/statuses/1/source').flush({ id: '1', text: '', spoiler_text: '' });

    internals(f).editText.set('   ');
    f.componentInstance.saveEdit();

    httpMock.expectNone('/api/v1/statuses/1');
  });

  it('saveEdit: clears saving flag on HTTP error', () => {
    const f = setUp();
    f.componentInstance.startEdit(fakeEvent());
    httpMock.expectOne('/api/v1/statuses/1/source').flush({ id: '1', text: 'x', spoiler_text: '' });

    internals(f).editText.set('edited');
    f.componentInstance.saveEdit();

    httpMock
      .expectOne('/api/v1/statuses/1')
      .flush('', { status: 422, statusText: 'Unprocessable' });

    expect(internals(f).saving()).toBe(false);
  });

  // ---------------------------------------------------------------- toggleReply / toggleQuote

  it('opens the inline reply composer compact, with no preview panel', () => {
    // An inline reply sits under the post being replied to. The full composer's
    // preview opens on by default, so the seeded @handle alone used to push a
    // tall duplicate of the post between the reader and the box they are typing
    // in. Compact starts with the preview off; the 👁 button still turns it on.
    const f = setUp(makeStatus({}));
    internals(f).replying.set(true);
    f.detectChanges();

    const element = f.nativeElement as HTMLElement;
    expect(element.querySelector('.inline-compose .compose-compact')).not.toBeNull();
    expect(element.querySelector('.inline-compose .preview')).toBeNull();
  });

  it('toggleReply: flips replying and collapses any open quote composer', () => {
    const f = setUp();
    internals(f).quoting.set(true);

    f.componentInstance.toggleReply(fakeEvent());

    expect(internals(f).replying()).toBe(true);
    expect(internals(f).quoting()).toBe(false);
  });

  it('toggleReply: a second call collapses the reply composer', () => {
    const f = setUp();
    f.componentInstance.toggleReply(fakeEvent());
    f.componentInstance.toggleReply(fakeEvent());
    expect(internals(f).replying()).toBe(false);
  });

  it('toggleQuote: flips quoting and collapses any open reply composer', () => {
    const f = setUp();
    internals(f).replying.set(true);

    f.componentInstance.toggleQuote(fakeEvent());

    expect(internals(f).quoting()).toBe(true);
    expect(internals(f).replying()).toBe(false);
  });

  // ---------------------------------------------------------------- onReplied / onQuoted

  it('onReplied: closes the reply composer and emits changed with incremented replies_count', () => {
    const changed: Status[] = [];
    const replied: Status[] = [];
    const f = setUp(makeStatus({ replies_count: 3 }));
    f.componentInstance.changed.subscribe((s) => changed.push(s));
    f.componentInstance.replied.subscribe((s) => replied.push(s));

    internals(f).replying.set(true);
    const replyStatus = makeStatus({ id: '99' });
    f.componentInstance.onReplied(replyStatus);

    expect(internals(f).replying()).toBe(false);
    expect(changed[0].replies_count).toBe(4);
    expect(replied[0].id).toBe('99');
  });

  it('onQuoted: closes the quote composer and emits replied with the new quote post', () => {
    const replied: Status[] = [];
    const f = setUp();
    f.componentInstance.replied.subscribe((s) => replied.push(s));

    internals(f).quoting.set(true);
    const quotePost = makeStatus({ id: 'qp-1' });
    f.componentInstance.onQuoted(quotePost);

    expect(internals(f).quoting()).toBe(false);
    expect(replied[0].id).toBe('qp-1');
  });

  // ---------------------------------------------------------------- toggleFavourite

  it('toggleFavourite: POSTs to /favourite when not yet favourited and emits changed', () => {
    const changed: Status[] = [];
    const f = setUp(makeStatus({ id: '5', favourited: false }));
    f.componentInstance.changed.subscribe((s) => changed.push(s));

    f.componentInstance.toggleFavourite(fakeEvent());

    const req = httpMock.expectOne('/api/v1/statuses/5/favourite');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '5', favourited: true }));

    expect(changed[0].favourited).toBe(true);
  });

  it('toggleFavourite: POSTs to /unfavourite when already favourited', () => {
    const f = setUp(makeStatus({ id: '5', favourited: true }));
    f.componentInstance.toggleFavourite(fakeEvent());
    const req = httpMock.expectOne('/api/v1/statuses/5/unfavourite');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '5', favourited: false }));
  });

  // ---------------------------------------------------------------- toggleReblog

  it('toggleReblog: POSTs to /reblog when not yet reblogged', () => {
    const f = setUp(makeStatus({ id: '7', reblogged: false }));
    f.componentInstance.toggleReblog(fakeEvent());
    const req = httpMock.expectOne('/api/v1/statuses/7/reblog');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '7' })); // reblog wrapper
  });

  it('toggleReblog: POSTs to /unreblog when already reblogged', () => {
    const f = setUp(makeStatus({ id: '7', reblogged: true }));
    f.componentInstance.toggleReblog(fakeEvent());
    const req = httpMock.expectOne('/api/v1/statuses/7/unreblog');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '7' }));
  });

  // ---------------------------------------------------------------- toggleBookmark

  it('toggleBookmark: POSTs to /bookmark when not yet bookmarked', () => {
    const f = setUp(makeStatus({ id: '8', bookmarked: false }));
    f.componentInstance.toggleBookmark(fakeEvent());
    const req = httpMock.expectOne('/api/v1/statuses/8/bookmark');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '8' }));
  });

  it('toggleBookmark: POSTs to /unbookmark when already bookmarked', () => {
    const f = setUp(makeStatus({ id: '8', bookmarked: true }));
    f.componentInstance.toggleBookmark(fakeEvent());
    const req = httpMock.expectOne('/api/v1/statuses/8/unbookmark');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '8' }));
  });

  it('toggleBookmark: uses Bluesky private bookmarks for a linked Bluesky post', () => {
    seedBskySession({
      service: 'https://bsky.social',
      handle: 'me.bsky.social',
      did: 'did:plc:me',
      accessJwt: 'access',
      refreshJwt: 'refresh',
    });
    const f = setUp(
      makeStatus({
        id: 'bsky:at://did:plc:them/app.bsky.feed.post/1',
        provider: 'bluesky',
        providerRef: {
          uri: 'at://did:plc:them/app.bsky.feed.post/1',
          cid: 'post-cid',
          likeUri: null,
          repostUri: null,
          replyRoot: { uri: 'at://did:plc:them/app.bsky.feed.post/1', cid: 'post-cid' },
          replyParentUri: null,
          externalUri: null,
        },
      }),
    );
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    f.componentInstance.toggleBookmark(fakeEvent());

    const req = httpMock.expectOne('https://bsky.social/xrpc/app.bsky.bookmark.createBookmark');
    expect(req.request.body).toEqual({
      uri: 'at://did:plc:them/app.bsky.feed.post/1',
      cid: 'post-cid',
    });
    req.flush({});
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ bookmarked: true }));
    httpMock.expectNone('/api/v1/statuses/bsky:at://did:plc:them/app.bsky.feed.post/1/bookmark');
  });

  it('toggleBookmark: keeps a Bluesky post local when no Bluesky account is linked', () => {
    const f = setUp(
      makeStatus({
        id: 'bsky:at://did:plc:them/app.bsky.feed.post/1',
        provider: 'bluesky',
      }),
    );
    f.componentInstance.toggleBookmark(fakeEvent());

    expect(TestBed.inject(AnonymousBookmarks).bookmarks()).toHaveLength(1);
    httpMock.expectNone('/api/v1/statuses/bsky:at://did:plc:them/app.bsky.feed.post/1/bookmark');
    httpMock.expectNone('https://bsky.social/xrpc/app.bsky.bookmark.createBookmark');
  });

  it('routes own Bluesky post deletion natively and hides Mastodon-only owner actions', () => {
    seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    expect(TestBed.inject(Auth).enterBluesky()).toBe(true);
    const status = makeStatus({
      id: 'bsky:at://did:plc:me/app.bsky.feed.post/1',
      provider: 'bluesky',
      account: makeAccount('bsky:did:plc:me'),
      providerRef: {
        uri: 'at://did:plc:me/app.bsky.feed.post/1',
        cid: 'post-cid',
        likeUri: null,
        repostUri: null,
        replyRoot: { uri: 'at://did:plc:me/app.bsky.feed.post/1', cid: 'post-cid' },
        replyParentUri: null,
        externalUri: null,
      },
    });
    const f = setUp(status);
    expect(TestBed.inject(Auth).account()?.id).toBe('bsky:did:plc:me');
    expect((f.componentInstance as unknown as { isOwn: Signal<boolean> }).isOwn()).toBe(true);
    const html = f.nativeElement as HTMLElement;
    expect(html.querySelector('[aria-label="Delete"]')).not.toBeNull();
    expect(html.querySelector('[aria-label="Pin"]')).toBeNull();
    expect(html.querySelector('[aria-label="Mute thread"]')).toBeNull();
    expect(html.querySelector('[aria-label="Edit"]')).toBeNull();

    const deleted = vi.fn();
    f.componentInstance.deleted.subscribe(deleted);
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true);
    f.componentInstance.remove(fakeEvent());
    const request = httpMock.expectOne('https://bsky.social/xrpc/com.atproto.repo.deleteRecord');
    expect(request.request.body).toEqual({
      repo: 'did:plc:me',
      collection: 'app.bsky.feed.post',
      rkey: '1',
    });
    request.flush({});

    expect(deleted).toHaveBeenCalledWith(status);
    httpMock.expectNone('/api/v1/statuses/bsky:at://did:plc:me/app.bsky.feed.post/1');
    confirmDelete.mockRestore();
  });

  it('offers AI translation on a tweet, since the server cannot translate it', () => {
    // Translation for a read-only provider means "ask the autorouter". The
    // server button needs canUseServerActions and the AI button needed
    // anonymous mode, so a signed-in reader looking at a tweet got *neither*
    // — translate vanished rather than being merely unavailable.
    const f = setUp(makeStatus({ id: 'twitter:1', provider: 'twitter' }));
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector("button[aria-label='Translate with AI']")).not.toBeNull();
    // And never the server one: /api/v1/statuses/twitter:1/translate can only 404.
    expect(el.querySelector("button[title='Translate']")).toBeNull();
  });

  it('toggleBookmark: keeps a tweet local instead of 404ing the home server', () => {
    // Signing in used to *break* this. `twitter:2083…` names nothing the home
    // server has ever seen, so the call 404s and the bookmark is lost silently
    // — while an anonymous reader bookmarking the same post got a working local
    // one. Observed in a browser as
    // `POST /api/v1/statuses/twitter:2083317461269598348/bookmark`.
    const f = setUp(
      makeStatus({ id: 'twitter:2083317461269598348', provider: 'twitter', bookmarked: false }),
    );
    f.componentInstance.toggleBookmark(fakeEvent());
    httpMock.expectNone('/api/v1/statuses/twitter:2083317461269598348/bookmark');
    expect(TestBed.inject(AnonymousBookmarks).bookmarks().length).toBe(1);
  });

  it('offers Mastodon and Raindrop choices when the second provider is connected', () => {
    localStorage.setItem(
      'mockingbird_raindrop_credentials',
      JSON.stringify({ clientId: 'client-id', clientSecret: 'client-secret' }),
    );
    localStorage.setItem(
      'mockingbird_raindrop_token',
      JSON.stringify({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 60_000,
      }),
    );
    const f = setUp(
      makeStatus({
        id: '8',
        url: 'https://social.example/@alice/8',
        content: '<p><a href="https://article.example/read">Read it</a></p>',
      }),
    );

    f.componentInstance.toggleBookmark(fakeEvent());
    f.detectChanges();

    const text = (f.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Where should this bookmark go?');
    expect(text).toContain('Mastodon');
    expect(text).toContain('Save the post');
    expect(text).toContain('article.example');
    httpMock.expectNone('/api/v1/statuses/8/bookmark');
  });

  // ---------------------------------------------------------------- togglePin

  it('togglePin: POSTs to /pin when not pinned', () => {
    const f = setUp(makeStatus({ id: '9', pinned: false }));
    f.componentInstance.togglePin(fakeEvent());
    const req = httpMock.expectOne('/api/v1/statuses/9/pin');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '9' }));
  });

  it('togglePin: POSTs to /unpin when already pinned', () => {
    const f = setUp(makeStatus({ id: '9', pinned: true }));
    f.componentInstance.togglePin(fakeEvent());
    const req = httpMock.expectOne('/api/v1/statuses/9/unpin');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '9' }));
  });

  // ---------------------------------------------------------------- toggleMute

  it('toggleMute: POSTs to /mute when not muted', () => {
    const f = setUp(makeStatus({ id: '10', muted: false }));
    f.componentInstance.toggleMute(fakeEvent());
    const req = httpMock.expectOne('/api/v1/statuses/10/mute');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '10' }));
  });

  it('toggleMute: POSTs to /unmute when already muted', () => {
    const f = setUp(makeStatus({ id: '10', muted: true }));
    f.componentInstance.toggleMute(fakeEvent());
    const req = httpMock.expectOne('/api/v1/statuses/10/unmute');
    expect(req.request.method).toBe('POST');
    req.flush(makeStatus({ id: '10' }));
  });

  // ---------------------------------------------------------------- toggleTranslate

  it('toggleTranslate: calls /translate and stores result', () => {
    const f = setUp(makeStatus({ id: '11' }));
    f.componentInstance.toggleTranslate(fakeEvent());

    const req = httpMock.expectOne('/api/v1/statuses/11/translate');
    const translation: Translation = {
      content: '<p>Hello</p>',
      spoiler_text: '',
      detected_source_language: 'de',
      provider: 'DeepL',
    };
    req.flush(translation);

    expect(internals(f).translation()).toEqual(translation);
    expect(internals(f).translating()).toBe(false);
  });

  it('toggleTranslate: a second call clears the translation (show original)', () => {
    const f = setUp(makeStatus({ id: '11' }));
    // Pre-seed a translation.
    internals(f).translation.set({
      content: '<p>Hola</p>',
      spoiler_text: '',
      detected_source_language: 'es',
      provider: 'Google',
    });
    f.componentInstance.toggleTranslate(fakeEvent());

    // No HTTP request; just clears.
    httpMock.expectNone('/api/v1/statuses/11/translate');
    expect(internals(f).translation()).toBeNull();
  });

  it('toggleTranslate: clears translating flag on HTTP error', () => {
    const f = setUp(makeStatus({ id: '11' }));
    f.componentInstance.toggleTranslate(fakeEvent());
    httpMock
      .expectOne('/api/v1/statuses/11/translate')
      .flush('', { status: 503, statusText: 'Unavailable' });
    expect(internals(f).translating()).toBe(false);
  });

  // ---------------------------------------------------------------- pollPercent

  it('pollPercent: returns the correct percentage for a poll option', () => {
    const f = setUp(
      makeStatus({
        id: '12',
        poll: {
          id: 'p1',
          expires_at: null,
          expired: false,
          multiple: false,
          votes_count: 100,
          voters_count: 80,
          options: [
            { title: 'Yes', votes_count: 75 },
            { title: 'No', votes_count: 25 },
          ],
          voted: false,
          own_votes: [],
        },
      }),
    );
    expect(f.componentInstance.pollPercent({ votes_count: 75 })).toBe(75);
    expect(f.componentInstance.pollPercent({ votes_count: 25 })).toBe(25);
  });

  it('pollPercent: returns 0 when total votes are 0', () => {
    const f = setUp();
    // No poll — votes_count defaults to 0.
    expect(f.componentInstance.pollPercent({ votes_count: 0 })).toBe(0);
  });

  // ---------------------------------------------------------------- toggleChoice

  it('toggleChoice: sets the selection for single-choice polls', () => {
    const f = setUp(
      makeStatus({
        poll: {
          id: 'p1',
          expires_at: null,
          expired: false,
          multiple: false,
          votes_count: 0,
          voters_count: 0,
          options: [
            { title: 'A', votes_count: 0 },
            { title: 'B', votes_count: 0 },
          ],
          voted: false,
          own_votes: [],
        },
      }),
    );
    f.componentInstance.toggleChoice(1);
    expect(internals(f).pollSelection()).toEqual([1]);

    // Picking a different option replaces the previous one.
    f.componentInstance.toggleChoice(0);
    expect(internals(f).pollSelection()).toEqual([0]);
  });

  it('toggleChoice: toggles multi-choice selections', () => {
    const f = setUp(
      makeStatus({
        poll: {
          id: 'p1',
          expires_at: null,
          expired: false,
          multiple: true,
          votes_count: 0,
          voters_count: 0,
          options: [
            { title: 'A', votes_count: 0 },
            { title: 'B', votes_count: 0 },
            { title: 'C', votes_count: 0 },
          ],
          voted: false,
          own_votes: [],
        },
      }),
    );
    f.componentInstance.toggleChoice(0);
    f.componentInstance.toggleChoice(2);
    expect(internals(f).pollSelection()).toEqual([0, 2]);

    // De-selecting an already-selected option removes it.
    f.componentInstance.toggleChoice(0);
    expect(internals(f).pollSelection()).toEqual([2]);
  });

  // ---------------------------------------------------------------- openHistory / togglePolicyMenu

  it('openHistory: sets showHistory to true and calls stopPropagation', () => {
    const f = setUp();
    const ev = fakeEvent();
    f.componentInstance.openHistory(ev);
    expect(internals(f).showHistory()).toBe(true);
    expect((ev.stopPropagation as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('togglePolicyMenu: flips the showPolicyMenu signal', () => {
    const f = setUp();
    expect(internals(f).showPolicyMenu()).toBe(false);
    f.componentInstance.togglePolicyMenu(fakeEvent());
    expect(internals(f).showPolicyMenu()).toBe(true);
    f.componentInstance.togglePolicyMenu(fakeEvent());
    expect(internals(f).showPolicyMenu()).toBe(false);
  });

  // ---------------------------------------------------------------- setPolicy

  it('setPolicy: POSTs the policy and emits changed, then closes the policy menu', () => {
    const changed: Status[] = [];
    const f = setUp(makeStatus({ id: '15' }));
    f.componentInstance.changed.subscribe((s) => changed.push(s));

    internals(f).showPolicyMenu.set(true);
    f.componentInstance.setPolicy('followers');

    const req = httpMock.expectOne('/api/v1/statuses/15/interaction_policy');
    expect(req.request.method).toBe('PUT');
    req.flush(makeStatus({ id: '15' }));

    expect(changed).toHaveLength(1);
    expect(internals(f).showPolicyMenu()).toBe(false);
  });

  // ---------------------------------------------------------------- isOwn

  it('isOwn is true when the logged-in user owns the status', () => {
    // Inject Auth before creating any component to avoid "TestBed already instantiated" errors.
    const auth = TestBed.inject(Auth);
    auth.setAccount(makeAccount('42') as never);
    const f = setUp(makeStatus({ account: makeAccount('42') }));
    const comp = f.componentInstance as unknown as { isOwn: Signal<boolean> };
    expect(comp.isOwn()).toBe(true);
  });

  it('isOwn is false when the status belongs to another account', () => {
    const auth = TestBed.inject(Auth);
    auth.setAccount(makeAccount('1') as never);
    const f = setUp(makeStatus({ account: makeAccount('2') }));
    const comp = f.componentInstance as unknown as { isOwn: Signal<boolean> };
    expect(comp.isOwn()).toBe(false);
  });

  // ---------------------------------------------------------------- external links

  function makeMedia(id: string) {
    return {
      id,
      type: 'image',
      url: `https://cdn.example/${id}.jpg`,
      preview_url: `https://cdn.example/${id}-small.jpg`,
      description: `image ${id}`,
    };
  }

  /** Build a MouseEvent whose target is an <a href> inside rendered content. */
  function clickOnAnchor(href: string, className = ''): MouseEvent {
    const anchor = document.createElement('a');
    if (href) {
      anchor.setAttribute('href', href);
    }
    if (className) {
      anchor.className = className;
    }
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: anchor });
    return event;
  }

  it('onContentClick: opens http(s) links in a new tab and prevents in-app nav', () => {
    const f = setUp();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const event = clickOnAnchor('https://example.com/article');
    const preventSpy = vi.spyOn(event, 'preventDefault');

    internals(f).onContentClick(event);

    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/article',
      '_blank',
      'noopener,noreferrer',
    );
    expect(preventSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('onContentClick: leaves genuinely relative (non-tag) links to the router', () => {
    const f = setUp();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const event = clickOnAnchor('/accounts/42');
    const preventSpy = vi.spyOn(event, 'preventDefault');

    internals(f).onContentClick(event);

    expect(openSpy).not.toHaveBeenCalled();
    expect(preventSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('onContentClick: routes a hashtag link in-app instead of opening the instance', () => {
    const f = setUp();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    // Server content points hashtags at the origin instance.
    const event = clickOnAnchor('https://mastodon.social/tags/spaceflight', 'mention hashtag');
    const preventSpy = vi.spyOn(event, 'preventDefault');

    internals(f).onContentClick(event);

    expect(navSpy).toHaveBeenCalledWith(['/tags', 'spaceflight']);
    expect(openSpy).not.toHaveBeenCalled(); // NOT opened externally
    expect(preventSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('onContentClick: routes a resolved mention to its Mawkingbird profile', () => {
    const f = setUp(
      makeStatus({
        content:
          '<p>Hello <span class="h-card"><a class="u-url mention" href="https://remote.example/@alice">@alice@remote.example</a></span></p>',
        mentions: [
          {
            id: '42',
            username: 'alice',
            acct: 'alice@remote.example',
            url: 'https://remote.example/@alice',
          },
        ],
      }),
    );
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const event = clickOnAnchor('https://remote.example/@alice', 'u-url mention');
    Object.defineProperty(event.target, 'textContent', { value: '@alice@remote.example' });

    internals(f).onContentClick(event);

    // Handle rides in the path beside the id: a mention's id is only valid on
    // the server that wrote the post, and a short one can silently resolve to
    // a different account elsewhere.
    expect(navSpy).toHaveBeenCalledWith(['/accounts', '42', '@alice@remote.example']);
  });

  it('shortens a bare long URL label without changing its destination', () => {
    const url = 'https://example.com/really_long_path/that/keeps/going?with=query';
    const f = setUp(makeStatus({ content: `<p><a href="${url}">${url}</a></p>` }));
    const anchor = (f.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.content a')!;

    expect(anchor.textContent).toBe('example.com/…');
    expect(anchor.getAttribute('href')).toBe(url);
  });

  it('resolves a Mastodon post link into an embedded quote card', () => {
    const quoteUrl = 'https://remote.example/@alice/456';
    const f = setUp(
      makeStatus({ content: `<p>Worth reading</p><p><a href="${quoteUrl}">${quoteUrl}</a></p>` }),
    );
    httpMock.expectOne('https://remote.example/api/v1/statuses/456').flush(
      makeStatus({
        id: '456',
        url: quoteUrl,
        content: '<p>The quoted post</p>',
        account: { ...makeAccount('9'), username: 'alice', acct: 'alice' },
      }),
    );
    f.detectChanges();

    const element = f.nativeElement as HTMLElement;
    expect(element.querySelector('.quote-card')?.textContent).toContain('The quoted post');
    expect(element.querySelector('.content')?.textContent).toContain('Worth reading');
    expect(element.querySelector('.content')?.textContent).not.toContain('remote.example');
  });

  it('onContentClick: ignores clicks that are not on a link', () => {
    const f = setUp();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const span = document.createElement('span');
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', { value: span });

    expect(() => internals(f).onContentClick(event)).not.toThrow();
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  // ---------------------------------------------------------------- image lightbox

  it('openLightbox: records the clicked index and prevents default navigation', () => {
    const f = setUp(makeStatus({ media_attachments: [makeMedia('a'), makeMedia('b')] }));
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Event;

    internals(f).openLightbox(1, event);

    expect(internals(f).lightboxIndex()).toBe(1);
    expect((event.preventDefault as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('renders a clickable media thumbnail per attachment', () => {
    const f = setUp(makeStatus({ media_attachments: [makeMedia('a'), makeMedia('b')] }));
    const thumbs = (f.nativeElement as HTMLElement).querySelectorAll('.media-thumb');
    expect(thumbs).toHaveLength(2);
  });

  // ------------------------------------------------------------ images-off mode

  it('replaces thumbnails with one alt-text row per attachment when images are off', () => {
    TestBed.inject(ClientPrefs).setShowImages(false);
    const f = setUp(makeStatus({ media_attachments: [makeMedia('a'), makeMedia('b')] }));
    const el = f.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.media-thumb')).toHaveLength(0);
    const rows = el.querySelectorAll('.media-alt-row');
    expect(rows).toHaveLength(2);
    // The author's description is the content in this mode, so it must be shown.
    expect(rows[0].textContent).toContain('image a');
    expect(rows[1].textContent).toContain('image b');
    expect(rows[0].querySelector('.media-alt-icon')?.textContent).toContain('🖼️');
  });

  it('says so when an attachment has no alt text, rather than showing a blank row', () => {
    TestBed.inject(ClientPrefs).setShowImages(false);
    const f = setUp(makeStatus({ media_attachments: [{ ...makeMedia('a'), description: null }] }));
    const row = (f.nativeElement as HTMLElement).querySelector('.media-alt-row');

    expect(row?.textContent).toContain('No description provided');
    expect(row?.getAttribute('aria-label')).toContain('no description provided');
  });

  it('uses a media-type icon so video and audio are not mislabelled as pictures', () => {
    TestBed.inject(ClientPrefs).setShowImages(false);
    const f = setUp(
      makeStatus({
        media_attachments: [
          { ...makeMedia('v'), type: 'video' },
          { ...makeMedia('s'), type: 'audio' },
        ],
      }),
    );
    const icons = (f.nativeElement as HTMLElement).querySelectorAll('.media-alt-icon');

    expect(icons[0].textContent).toContain('🎬');
    expect(icons[1].textContent).toContain('🔊');
  });

  it('an alt-text row still opens that image in the lightbox', () => {
    TestBed.inject(ClientPrefs).setShowImages(false);
    const f = setUp(makeStatus({ media_attachments: [makeMedia('a'), makeMedia('b')] }));

    (f.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('.media-alt-row')[1]
      .click();
    f.detectChanges();

    expect(internals(f).lightboxIndex()).toBe(1);
  });

  it('mounts the lightbox only after an image is opened', () => {
    const f = setUp(makeStatus({ media_attachments: [makeMedia('a')] }));
    expect((f.nativeElement as HTMLElement).querySelector('app-lightbox')).toBeNull();

    internals(f).lightboxIndex.set(0);
    f.detectChanges();

    expect((f.nativeElement as HTMLElement).querySelector('app-lightbox')).not.toBeNull();
  });

  it('shows a "Boosted" label only while the status is reblogged', () => {
    const f = setUp(makeStatus({ reblogged: false }));
    expect((f.nativeElement as HTMLElement).querySelector('.did')).toBeNull();

    f.componentRef.setInput('status', makeStatus({ reblogged: true }));
    f.detectChanges();
    const label = (f.nativeElement as HTMLElement).querySelector('.did');
    expect(label?.textContent).toContain('Boosted');
  });

  // ---------------------------------------------------------------- delete & repost

  describe('delete & repost', () => {
    interface RedraftInternals {
      redrafting: WritableSignal<boolean>;
      redraftText: WritableSignal<string>;
      deleteAndRedraft(event: Event): void;
      onRedrafted(status: Status): void;
      cancelRedraft(): void;
    }

    function redraftInternals(f: ComponentFixture<StatusCard>): RedraftInternals {
      return f.componentInstance as unknown as RedraftInternals;
    }

    function startRedraft(f: ComponentFixture<StatusCard>): void {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      redraftInternals(f).deleteAndRedraft(fakeEvent());
      httpMock
        .expectOne('/api/v1/statuses/1/source')
        .flush({ id: '1', text: 'original text', spoiler_text: '' });
      httpMock.expectOne('/api/v1/statuses/1').flush(makeStatus());
    }

    afterEach(() => vi.restoreAllMocks());

    it('fetches the source, deletes the post, and opens the seeded composer', () => {
      const f = setUp();
      startRedraft(f);
      f.detectChanges();

      expect(redraftInternals(f).redrafting()).toBe(true);
      expect(redraftInternals(f).redraftText()).toBe('original text');
      expect((f.nativeElement as HTMLElement).querySelector('.redraft app-compose')).not.toBeNull();
    });

    it('does nothing when the confirmation is declined', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const f = setUp();
      redraftInternals(f).deleteAndRedraft(fakeEvent());

      httpMock.expectNone('/api/v1/statuses/1/source');
      expect(redraftInternals(f).redrafting()).toBe(false);
    });

    it('emits changed with the reposted status so containers swap it in', () => {
      const f = setUp();
      const changed: Status[] = [];
      const deleted: Status[] = [];
      f.componentInstance.changed.subscribe((s) => changed.push(s));
      f.componentInstance.deleted.subscribe((s) => deleted.push(s));
      startRedraft(f);

      redraftInternals(f).onRedrafted(makeStatus({ id: '2' }));

      expect(redraftInternals(f).redrafting()).toBe(false);
      expect(changed.map((s) => s.id)).toEqual(['2']);
      expect(deleted).toHaveLength(0);
    });

    it('emits deleted when the redraft is discarded (post is already gone)', () => {
      const f = setUp();
      const deleted: Status[] = [];
      f.componentInstance.deleted.subscribe((s) => deleted.push(s));
      startRedraft(f);

      redraftInternals(f).cancelRedraft();

      expect(redraftInternals(f).redrafting()).toBe(false);
      expect(deleted.map((s) => s.id)).toEqual(['1']);
    });
  });

  // ------------------------------------------------------------- save as to-do

  describe('save as to-do', () => {
    interface TodoInternals {
      saveAsTodo(event: Event): void;
      todosEnabled(): boolean;
      actionNotice: WritableSignal<string | null>;
    }

    function todoInternals(f: ComponentFixture<StatusCard>): TodoInternals {
      return f.componentInstance as unknown as TodoInternals;
    }

    it('parks a local draft and publishes nothing at all', () => {
      const f = setUp();
      todoInternals(f).saveAsTodo(fakeEvent());

      // One menu click must never post — not even to an audience of one.
      expect(httpMock.match((r) => r.method === 'POST')).toHaveLength(0);
      const drafts = TestBed.inject(Drafts).drafts();
      expect(drafts).toHaveLength(1);
      expect(drafts[0].segments[0]).toContain('#todo');
      expect(drafts[0].quotedStatusId).toBe('1');
    });

    it('says what happened, and that nothing was posted', () => {
      const f = setUp();
      todoInternals(f).saveAsTodo(fakeEvent());

      expect(todoInternals(f).actionNotice()).toContain('Nothing was posted');
    });

    it('uses the account own word for a to-do', () => {
      TestBed.inject(ClientPrefs).setPkmVocabulary({ note: [], todo: ['aufgabe'], cal: [] });
      const f = setUp();
      todoInternals(f).saveAsTodo(fakeEvent());

      expect(TestBed.inject(Drafts).drafts()[0].segments[0]).toContain('#aufgabe');
    });

    it('offers nothing when the user has switched to-dos off', () => {
      TestBed.inject(ClientPrefs).setPkmVocabulary({ note: ['note'], todo: [], cal: [] });
      const f = setUp();

      expect(todoInternals(f).todosEnabled()).toBe(false);
    });
  });

  // ---------------------------------------------------------------- foreign providers (RSS)

  describe('foreign statuses', () => {
    function makeRssStatus(): Status {
      return makeStatus({
        id: 'rss:https://blog.example/feed::g1',
        provider: 'rss',
        url: 'https://blog.example/post',
        account: {
          id: 'rss:https://blog.example/feed',
          username: 'blog.example',
          acct: 'blog.example',
          display_name: 'Example Blog',
        } as never,
      });
    }

    it('shows a provider badge instead of the visibility badge', () => {
      const f = setUp(makeRssStatus());
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('.provider-badge')?.textContent).toContain('RSS');
      expect(el.textContent).not.toContain('public');
    });

    it('replaces the action row with an external "Open original" link', () => {
      const f = setUp(makeRssStatus());
      const el = f.nativeElement as HTMLElement;
      const open = el.querySelector<HTMLAnchorElement>('a.open-original')!;
      expect(open.href).toBe('https://blog.example/post');
      expect(open.target).toBe('_blank');
      // No reply/boost/favourite buttons for a read-only source.
      expect(el.textContent).not.toContain('💬');
      expect(el.textContent).not.toContain('🔁');
      expect(el.textContent).not.toContain('⭐');
    });

    it('links the author to the synthetic feed profile and the timestamp to the article thread', () => {
      const f = setUp(makeRssStatus());
      const el = f.nativeElement as HTMLElement;
      // Feed = profile: the author name routes to /accounts/rss:<feedUrl>.
      const name = el.querySelector('a.name')?.getAttribute('href') ?? '';
      expect(decodeURIComponent(name)).toBe('/accounts/rss:https://blog.example/feed');
      // RSS items are threadable now: the timestamp opens the in-app reader/thread.
      const time = el.querySelector<HTMLAnchorElement>('a.post-time')?.getAttribute('href') ?? '';
      expect(decodeURIComponent(time)).toBe('/statuses/rss:https://blog.example/feed::g1');
    });

    it('offers an in-app "View thread" link for the article and its comments', () => {
      const f = setUp(makeRssStatus());
      const el = f.nativeElement as HTMLElement;
      const view = Array.from(el.querySelectorAll<HTMLAnchorElement>('a.action')).find((a) =>
        a.textContent?.includes('View thread'),
      );
      expect(decodeURIComponent(view?.getAttribute('href') ?? '')).toBe(
        '/statuses/rss:https://blog.example/feed::g1?reader=0',
      );
    });

    it('keeps normal in-app links for Mastodon statuses', () => {
      const f = setUp(makeStatus({ id: '42' }));
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('a.name')?.getAttribute('href')).toBe('/accounts/1');
      expect(el.querySelector('a.open-original')).toBeNull();
      expect(el.textContent).toContain('💬');
    });

    it('Bluesky posts get reply/boost/favourite plus Open original, but no Mastodon extras', () => {
      const f = setUp(
        makeStatus({
          id: 'bsky:at://did:plc:x/app.bsky.feed.post/1',
          provider: 'bluesky',
          url: 'https://bsky.app/profile/x/post/1',
          providerRef: {
            uri: 'at://did:plc:x/app.bsky.feed.post/1',
            cid: 'c',
            likeUri: null,
            repostUri: null,
            replyRoot: { uri: 'at://did:plc:x/app.bsky.feed.post/1', cid: 'c' },
            replyParentUri: null,
            externalUri: null,
          },
        }),
      );
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('button[title="Reply"]')).toBeTruthy();
      expect(el.querySelector('button[title="Boost"]')).toBeTruthy();
      expect(el.querySelector('button[title="Favourite"]')).toBeTruthy();
      expect(el.querySelector('a.open-original')).toBeTruthy();
      // Bookmark is now a Bluesky-native action; Mastodon-only actions stay hidden.
      expect(el.querySelector('button[title="Bookmark"]')).not.toBeNull();
      expect(el.querySelector('button[title="Quote"]')).toBeNull();
      expect(el.querySelector('button[title="Translate"]')).toBeNull();
      expect(el.querySelector('.provider-badge')?.textContent).toContain('Bluesky');
    });

    it('reports a Bluesky post through its native moderation service', () => {
      seedBskySession({
        service: 'https://bsky.social',
        did: 'did:plc:me',
        handle: 'me.bsky.social',
        accessJwt: 'access-jwt',
        refreshJwt: 'refresh-jwt',
      });
      const ref = {
        uri: 'at://did:plc:them/app.bsky.feed.post/1',
        cid: 'post-cid',
        likeUri: null,
        repostUri: null,
        replyRoot: { uri: 'at://did:plc:them/app.bsky.feed.post/1', cid: 'post-cid' },
        replyParentUri: null,
        externalUri: null,
      };
      const f = setUp(
        makeStatus({
          id: `bsky:${ref.uri}`,
          provider: 'bluesky',
          account: makeAccount('bsky:did:plc:them'),
          providerRef: ref,
        }),
      );
      const report = Array.from(
        (f.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
      ).find((button) => button.textContent?.includes('Report post'));
      expect(report).toBeTruthy();
      report!.click();
      f.detectChanges();
      const confirm = Array.from(
        (f.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
      ).find((button) => button.textContent?.includes('Confirm report'));
      confirm!.click();

      const request = httpMock.expectOne(
        'https://bsky.social/xrpc/com.atproto.moderation.createReport',
      );
      expect(request.request.body).toMatchObject({
        subject: {
          $type: 'com.atproto.repo.strongRef',
          uri: ref.uri,
          cid: ref.cid,
        },
      });
      request.flush({});
      httpMock.expectNone('/api/v1/reports');
    });

    it('replying to a Bluesky post opens the Bluesky composer, not the Mastodon one', () => {
      const f = setUp(
        makeStatus({
          id: 'bsky:at://did:plc:x/app.bsky.feed.post/1',
          provider: 'bluesky',
          url: 'https://bsky.app/profile/x/post/1',
          providerRef: {
            uri: 'at://did:plc:x/app.bsky.feed.post/1',
            cid: 'c',
            likeUri: null,
            repostUri: null,
            replyRoot: { uri: 'at://did:plc:x/app.bsky.feed.post/1', cid: 'c' },
            replyParentUri: null,
            externalUri: null,
          },
        }),
      );
      (f.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('button[title="Reply"]')!
        .click();
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('app-bsky-reply')).toBeTruthy();
      expect(el.querySelector('app-compose')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------- reader mode

describe('StatusCard reader mode (expand all)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  function setUpCard(status: Status): ComponentFixture<StatusCard> {
    const fixture = TestBed.createComponent(StatusCard);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  }

  function readerOn(fixture: ComponentFixture<StatusCard>): void {
    TestBed.inject(ClientPrefs).setFeedReader(true);
    fixture.detectChanges();
  }

  it('pre-expands content warnings', () => {
    const fixture = setUpCard(
      makeStatus({ spoiler_text: 'long post', content: '<p>the hidden essay</p>' }),
    );
    expect(fixture.nativeElement.textContent).not.toContain('the hidden essay');

    readerOn(fixture);
    expect(fixture.nativeElement.textContent).toContain('the hidden essay');
  });

  it('expands warn-filter stubs', () => {
    const fixture = setUpCard(
      makeStatus({
        content: '<p>the filtered take</p>',
        filtered: [
          {
            filter: {
              id: 'f1',
              title: 'Politics',
              context: ['home'],
              expires_at: null,
              filter_action: 'warn',
            },
            keyword_matches: null,
            status_matches: null,
          },
        ],
      }),
    );
    expect(fixture.nativeElement.textContent).toContain('Filtered: Politics');
    expect(fixture.nativeElement.textContent).not.toContain('the filtered take');

    readerOn(fixture);
    expect(fixture.nativeElement.textContent).toContain('the filtered take');
  });

  it('still respects hide-action filters', () => {
    const fixture = setUpCard(
      makeStatus({
        content: '<p>never show this</p>',
        filtered: [
          {
            filter: {
              id: 'f2',
              title: 'Muted topic',
              context: ['home'],
              expires_at: null,
              filter_action: 'hide',
            },
            keyword_matches: null,
            status_matches: null,
          },
        ],
      }),
    );
    readerOn(fixture);
    expect(fixture.nativeElement.textContent).not.toContain('never show this');
  });

  it('ignores a stale cached filter with no context array', () => {
    const fixture = setUpCard(
      makeStatus({
        content: '<p>still render this</p>',
        filtered: [{ filter: { title: 'incomplete' } }] as unknown as Status['filtered'],
      }),
    );

    expect(fixture.nativeElement.textContent).toContain('still render this');
  });
});

/**
 * AI translation (anonymous-great sprint 3).
 *
 * Two properties matter more than the rest and both get a test: an anonymous reader
 * always has the button, and model output is never rendered as HTML.
 */
describe('StatusCard — AI translation', () => {
  let httpMock: HttpTestingController;
  let translateHtml: ReturnType<typeof vi.fn>;
  /** Flipped by tests that need a connected key; the default is "not set up yet". */
  let connected = false;

  beforeEach(() => {
    localStorage.clear();
    translateHtml = vi.fn();
    connected = false;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // `targetLanguage` is part of the real service and is consulted before every
        // translation (to skip posts already in the reader's language), so the stub has
        // to answer it. These posts carry no language and are too short to detect, so
        // the same-language check declines to fire and the translation proceeds.
        { provide: AiTranslate, useValue: { translateHtml, targetLanguage: () => 'en' } },
        { provide: OpenRouterSession, useValue: { connected: () => connected } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function setUp(status = makeStatus()): ComponentFixture<StatusCard> {
    const fixture = TestBed.createComponent(StatusCard);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  }

  function aiButton(fixture: ComponentFixture<StatusCard>): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[aria-label="Translate with AI"]',
    );
  }

  it('offers AI translation to an anonymous reader even with OpenRouter unconnected', () => {
    // The deliberate exception to "no upsell, no teaser": anonymous readers have no
    // other translate button, so hiding this makes the capability invisible rather
    // than merely unavailable.
    TestBed.inject(Auth).enterAnonymous();

    expect(aiButton(setUp())).not.toBeNull();
  });

  it('explains itself instead of doing nothing when OpenRouter is unconnected', async () => {
    TestBed.inject(Auth).enterAnonymous();
    const fixture = setUp();

    aiButton(fixture)!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Connect OpenRouter');
    });
    // And it did not pretend to translate.
    expect(translateHtml).not.toHaveBeenCalled();
  });

  it('hides the AI button for a signed-in user on the server default', () => {
    // The spillover must not be a regression: signed-in behaviour is unchanged
    // unless the user opts in. `connected = true` matters — without it this would
    // pass merely because there is no key, proving nothing about the preference.
    connected = true;
    const auth = TestBed.inject(Auth);
    auth.setToken('a-token');
    auth.setAccount(makeAccount('me') as never);
    const fixture = setUp();

    expect(TestBed.inject(TranslationPreference).choice()).toBe('server');
    // The server's own 🌐 is still there; only the AI one is absent.
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[title="Translate"]'),
    ).not.toBeNull();
    expect(aiButton(fixture)).toBeNull();
  });

  it('shows the AI button for a signed-in user who opted in', () => {
    connected = true;
    const auth = TestBed.inject(Auth);
    auth.setToken('a-token');
    auth.setAccount(makeAccount('me') as never);
    TestBed.inject(TranslationPreference).set('ai');

    expect(aiButton(setUp())).not.toBeNull();
  });

  it('renders the translation as text, never as markup', async () => {
    // The one hard rule of this sprint. Server content goes through
    // applyMinimalMarkdown into [innerHTML], which is safe only because the server
    // sanitized it; model output has been sanitized by nobody.
    TestBed.inject(Auth).enterAnonymous();
    connected = true;
    translateHtml.mockResolvedValue({
      text: '<img src=x onerror=alert(1)> hola',
      model: 'test/model',
      target: 'Spanish',
    });
    const fixture = setUp();
    const component = fixture.componentInstance as unknown as { runAiTranslate(): Promise<void> };

    await component.runAiTranslate();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const block = element.querySelector('.ai-translation-text')!;

    // The tag is literal text in the DOM, not an element.
    expect(block.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(block.querySelector('img')).toBeNull();
  });

  it('names the model that produced the translation', async () => {
    TestBed.inject(Auth).enterAnonymous();
    connected = true;
    translateHtml.mockResolvedValue({ text: 'hola', model: 'google/gemma', target: 'Spanish' });
    const fixture = setUp();
    const component = fixture.componentInstance as unknown as { runAiTranslate(): Promise<void> };

    await component.runAiTranslate();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('google/gemma');
    expect(text).toContain('machine translation');
  });

  it('surfaces a model failure rather than silently doing nothing', async () => {
    TestBed.inject(Auth).enterAnonymous();
    connected = true;
    translateHtml.mockRejectedValue(new Error('Your OpenRouter credits have run out.'));
    const fixture = setUp();
    const component = fixture.componentInstance as unknown as { runAiTranslate(): Promise<void> };

    await component.runAiTranslate();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('credits have run out');
  });

  it('toggles back to the original on a second click', async () => {
    TestBed.inject(Auth).enterAnonymous();
    connected = true;
    translateHtml.mockResolvedValue({ text: 'hola', model: 'm', target: 'Spanish' });
    const fixture = setUp();
    const component = fixture.componentInstance as unknown as { runAiTranslate(): Promise<void> };

    await component.runAiTranslate();
    await component.runAiTranslate();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.ai-translation')).toBeNull();
  });
});

/**
 * The link preview the server has always sent and this app ignored.
 *
 * `Status.card` has been in `models.ts` since the Mastodon shapes were written
 * and nothing rendered it until article expansion needed a card component.
 */
describe('StatusCard — link preview', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  function setUpCard(status: Status): ComponentFixture<StatusCard> {
    const fixture = TestBed.createComponent(StatusCard);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  }

  const card = {
    url: 'https://blog.example/post',
    title: 'A Linked Article',
    description: 'What it is about.',
    type: 'link' as const,
    provider_name: 'Example Blog',
    image: 'https://blog.example/cover.jpg',
  };

  it('renders a card the server supplied', () => {
    const fixture = setUpCard(makeStatus({ card }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-preview-card')).not.toBeNull();
    expect(el.textContent).toContain('A Linked Article');
    expect(el.textContent).toContain('Example Blog');
  });

  it('renders nothing when there is no card', () => {
    const fixture = setUpCard(makeStatus());
    expect((fixture.nativeElement as HTMLElement).querySelector('app-preview-card')).toBeNull();
  });

  it('yields to the author’s own media', () => {
    // Two pictures competing for the same glance, and the upload wins.
    const fixture = setUpCard(
      makeStatus({
        card,
        media_attachments: [
          {
            id: 'm1',
            type: 'image',
            url: 'https://example.com/a.png',
            preview_url: 'https://example.com/a.png',
            description: null,
          },
        ] as Status['media_attachments'],
      }),
    );
    expect((fixture.nativeElement as HTMLElement).querySelector('app-preview-card')).toBeNull();
  });

  it('drops the card image when images are off but keeps the text', () => {
    const fixture = setUpCard(makeStatus({ card }));
    TestBed.inject(ClientPrefs).setShowImages(false);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.preview-card-image')).toBeNull();
    expect(el.textContent).toContain('A Linked Article');
  });
});
