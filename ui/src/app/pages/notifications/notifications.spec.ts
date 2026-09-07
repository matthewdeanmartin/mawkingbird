import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account, MastodonNotification, Relationship, Status } from '../../models';
import { Auth } from '../../auth';
import { ClientPrefs } from '../../client-prefs';
import { Streaming } from '../../streaming';
import { FakeStreaming } from '../../testing/fake-streaming';
import { accountsNewToMe, groupNotifications, isSameAccount, Notifications } from './notifications';

interface NotificationsInternals {
  items: Signal<MastodonNotification[]>;
  live: WritableSignal<boolean>;
  setSource(source: 'mastodon' | 'bluesky'): void;
  chatKey(n: MastodonNotification): string;
}

function internals(fixture: ComponentFixture<Notifications>): NotificationsInternals {
  return fixture.componentInstance as unknown as NotificationsInternals;
}

function makeNotification(id: string, type: string): MastodonNotification {
  return {
    id,
    type,
    created_at: '2026-01-01T00:00:00Z',
    account: {
      id: '1',
      username: 'alan',
      acct: 'alan',
      display_name: 'Alan',
    } as MastodonNotification['account'],
  };
}

function makeAccount(id: string, name = `Person ${id}`): Account {
  return {
    id,
    username: `person${id}`,
    acct: `person${id}@example.social`,
    display_name: name,
    note: `<p>Bio for ${name}</p>`,
    url: `https://example.social/@person${id}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 12,
    following_count: 3,
    statuses_count: 45,
    bot: false,
    locked: false,
    fields: [],
  };
}

function relationship(id: string, over: Partial<Relationship> = {}): Relationship {
  return {
    id,
    following: false,
    followed_by: false,
    requested: false,
    blocking: false,
    muting: false,
    ...over,
  };
}

describe('Notifications', () => {
  let httpMock: HttpTestingController;
  let fakeStreaming: FakeStreaming;

  beforeEach(() => {
    fakeStreaming = new FakeStreaming();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: fakeStreaming },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(): ComponentFixture<Notifications> {
    const fixture = TestBed.createComponent(Notifications);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/notifications').flush([]);
    return fixture;
  }

  /**
   * Live is driven by Blue → "Auto-refresh timeline" rather than a button on
   * this page, and the effect that follows it runs on first change detection —
   * so the preference has to be on before the component is created.
   */
  function setUpLive(): ComponentFixture<Notifications> {
    TestBed.inject(ClientPrefs).setAutoRefreshTimeline(true);
    return setUp();
  }

  it('opens the user stream when auto-refresh is on', () => {
    const fixture = setUpLive();

    expect(internals(fixture).live()).toBe(true);
    expect(fakeStreaming.lastKind).toEqual({ stream: 'user' });
  });

  it('leaves the stream shut when auto-refresh is off', () => {
    const fixture = setUp();

    expect(internals(fixture).live()).toBe(false);
    expect(fakeStreaming.lastKind).toBeNull();
  });

  it('prepends an incoming "notification" event', () => {
    const fixture = setUpLive();

    fakeStreaming.emit({ event: 'notification', payload: makeNotification('1', 'follow') });

    expect(
      internals(fixture)
        .items()
        .map((n) => n.id),
    ).toEqual(['1']);
  });

  it('ignores non-notification stream events (e.g. update)', () => {
    const fixture = setUpLive();

    fakeStreaming.emit({ event: 'update', payload: { id: 'should-be-ignored' } });

    expect(internals(fixture).items()).toEqual([]);
  });

  it('renders media thumbnails inside a mention excerpt', () => {
    const fixture = TestBed.createComponent(Notifications);
    fixture.detectChanges();
    const n = makeNotification('9', 'mention');
    n.status = {
      id: 's9',
      content: '<p>look at this</p>',
      media_attachments: [
        { id: 'm1', type: 'image', url: 'https://x/full.png', preview_url: 'https://x/prev.png' },
      ],
    } as unknown as MastodonNotification['status'];
    httpMock.expectOne('/api/v1/notifications').flush([n]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector<HTMLImageElement>('.excerpt-media img');
    expect(img?.getAttribute('src')).toBe('https://x/prev.png');
    expect(el.querySelector('.excerpt-content')?.textContent).toContain('look at this');
  });

  it('shows one profile row per unfamiliar account and excludes followed accounts', () => {
    const fixture = TestBed.createComponent(Notifications);
    fixture.detectChanges();
    const first = makeNotification('n1', 'favourite');
    first.account = makeAccount('new', 'New Person');
    first.status = { id: 'post-1', content: '', media_attachments: [] } as unknown as Status;
    const repeat = makeNotification('n2', 'mention');
    repeat.account = first.account;
    repeat.status = { id: 'reply-1', content: '', media_attachments: [] } as unknown as Status;
    const followed = makeNotification('n3', 'reblog');
    followed.account = makeAccount('known', 'Known Person');
    httpMock.expectOne('/api/v1/notifications').flush([first, repeat, followed]);
    fixture.detectChanges();

    const newViewButton = [...fixture.nativeElement.querySelectorAll('button')].find(
      (button: HTMLButtonElement) => button.textContent?.includes('Accounts New to Me'),
    ) as HTMLButtonElement;
    newViewButton.click();
    fixture.detectChanges();
    httpMock
      .expectOne((request) => request.url === '/api/v1/accounts/relationships')
      .flush([relationship('new'), relationship('known', { following: true })]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('app-account-result-card')).toHaveLength(1);
    expect(element.textContent).toContain('New Person');
    expect(element.textContent).toContain('Bio for New Person');
    expect(element.textContent).toContain('liked your post · 1 more recent notification');
    expect(element.textContent).not.toContain('Known Person');
    expect(element.querySelector<HTMLAnchorElement>('.acct-reason a')?.getAttribute('href')).toBe(
      '/statuses/post-1',
    );
    expect(element.textContent).toContain('Block account');
    const cardBodyChildren = [
      ...element.querySelector<HTMLElement>('.acct-body')!.children,
    ] as HTMLElement[];
    expect(cardBodyChildren.indexOf(element.querySelector('.acct-reason')!)).toBeLessThan(
      cardBodyChildren.indexOf(element.querySelector('.acct-bio')!),
    );

    [...element.querySelectorAll<HTMLButtonElement>('.acct-danger-panel button')]
      .find((button) => button.textContent?.trim() === '1 day')!
      .click();
    const mute = httpMock.expectOne('/api/v1/accounts/new/mute');
    expect(mute.request.body).toEqual({ duration: 86400 });
    mute.flush(relationship('new', { muting: true }));
    fixture.detectChanges();
    expect(element.querySelectorAll('app-account-result-card')).toHaveLength(0);
  });

  it('removes an unfamiliar account from the view immediately after following', () => {
    const fixture = TestBed.createComponent(Notifications);
    fixture.detectChanges();
    const notification = makeNotification('n1', 'mention');
    notification.account = makeAccount('new', 'New Person');
    notification.status = {
      id: 'reply-1',
      content: '',
      media_attachments: [],
    } as unknown as Status;
    httpMock.expectOne('/api/v1/notifications').flush([notification]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const buttons = (): HTMLButtonElement[] => [
      ...element.querySelectorAll<HTMLButtonElement>('button'),
    ];
    buttons()
      .find((button) => button.textContent?.includes('Accounts New to Me'))!
      .click();
    fixture.detectChanges();
    httpMock
      .expectOne((request) => request.url === '/api/v1/accounts/relationships')
      .flush([relationship('new')]);
    fixture.detectChanges();

    buttons()
      .find((button) => button.textContent?.trim() === 'Follow')!
      .click();
    httpMock
      .expectOne('/api/v1/accounts/new/follow')
      .flush(relationship('new', { following: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('app-account-result-card')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('No unfamiliar accounts');
  });

  it('deduplicates new actors and excludes followed, mutual, requested, muted, and blocked ones', () => {
    const notifications = ['new', 'new', 'followed', 'mutual', 'requested', 'muted', 'blocked'].map(
      (id, index) => ({
        ...makeNotification(String(index), 'favourite'),
        account: makeAccount(id),
      }),
    );
    const relationships = new Map([
      ['new', relationship('new')],
      ['followed', relationship('followed', { following: true })],
      ['mutual', relationship('mutual', { following: true, followed_by: true })],
      ['requested', relationship('requested', { requested: true })],
      ['muted', relationship('muted', { muting: true })],
      ['blocked', relationship('blocked', { blocking: true })],
    ]);

    const candidates = accountsNewToMe(notifications, relationships);

    expect(candidates.map((candidate) => candidate.account.id)).toEqual(['new']);
    expect(candidates[0].notificationCount).toBe(2);
  });

  it('excludes the signed-in account from Accounts New to Me', () => {
    const self = makeAccount('self');
    self.username = 'demodemoson';
    self.acct = 'demodemoson';
    self.url = 'https://mastodon.social/@demodemoson';
    const notification = makeNotification('self-notification', 'favourite');
    notification.account = {
      ...self,
      id: 'alternate-self-representation',
      acct: 'demodemoson@mastodon.social',
    };
    const relationships = new Map([
      [notification.account.id, relationship(notification.account.id)],
    ]);

    expect(isSameAccount(notification.account, self)).toBe(true);
    expect(accountsNewToMe([notification], relationships, new Set(), self)).toEqual([]);
  });

  it('does not confuse the same username on another server with the signed-in account', () => {
    const self = makeAccount('self');
    self.username = 'demodemoson';
    self.acct = 'demodemoson@mastodon.social';
    self.url = 'https://mastodon.social/@demodemoson';
    const other = makeAccount('other');
    other.username = 'demodemoson';
    other.acct = 'demodemoson@other.social';
    other.url = 'https://other.social/@demodemoson';

    expect(isSameAccount(other, self)).toBe(false);
  });

  describe('groupNotifications', () => {
    function notif(
      id: string,
      type: string,
      accountId: string,
      statusId?: string,
    ): MastodonNotification {
      const n = makeNotification(id, type);
      n.account = { ...n.account, id: accountId, username: `u${accountId}` };
      if (statusId) {
        n.status = { id: statusId, content: '', media_attachments: [] } as unknown as Status;
      }
      return n;
    }

    it('leaves buckets at or under the threshold expanded', () => {
      const rows = groupNotifications([
        notif('1', 'favourite', 'a', 's1'),
        notif('2', 'favourite', 'b', 's1'),
        notif('3', 'favourite', 'c', 's1'),
      ]);
      expect(rows.map((r) => r.kind)).toEqual(['single', 'single', 'single']);
    });

    it('collapses 4+ same-status notifications into one group at the newest position', () => {
      const rows = groupNotifications([
        notif('0', 'follow', 'z'),
        notif('1', 'reblog', 'a', 's1'),
        notif('2', 'reblog', 'b', 's1'),
        notif('3', 'reblog', 'c', 's1'),
        notif('4', 'reblog', 'd', 's1'),
        notif('5', 'follow', 'y'),
      ]);
      expect(rows.map((r) => r.kind)).toEqual(['single', 'group', 'single']);
      const group = rows[1] as Extract<(typeof rows)[number], { kind: 'group' }>;
      expect(group.count).toBe(4);
      expect(group.sample.map((n) => n.account.id)).toEqual(['a', 'b', 'c']);
      expect(group.status.id).toBe('s1');
    });

    it('groups per (type, status): favourites and reblogs of one post stay apart', () => {
      const rows = groupNotifications([
        ...['a', 'b', 'c', 'd'].map((who, i) => notif(`f${i}`, 'favourite', who, 's1')),
        ...['a', 'b', 'c', 'd'].map((who, i) => notif(`r${i}`, 'reblog', who, 's1')),
      ]);
      expect(rows.map((r) => r.kind)).toEqual(['group', 'group']);
    });

    it('never groups mentions', () => {
      const rows = groupNotifications(
        ['a', 'b', 'c', 'd', 'e'].map((who, i) => notif(`${i}`, 'mention', who, 's1')),
      );
      expect(rows.every((r) => r.kind === 'single')).toBe(true);
    });

    it('counts each account once, so repeats do not trip the threshold', () => {
      const rows = groupNotifications([
        notif('1', 'favourite', 'a', 's1'),
        notif('2', 'favourite', 'a', 's1'),
        notif('3', 'favourite', 'b', 's1'),
        notif('4', 'favourite', 'c', 's1'),
      ]);
      expect(rows.every((r) => r.kind === 'single')).toBe(true);
    });
  });

  // ---------------------------------------------------------------- chatKey

  function mentionOf(visibility: string, mentions: { acct: string }[]): MastodonNotification {
    const n = makeNotification('m1', 'mention');
    n.account = { ...n.account, acct: 'alice' };
    n.status = {
      id: 's1',
      visibility,
      mentions: mentions.map((m, i) => ({
        id: `${i}`,
        username: m.acct.split('@')[0],
        acct: m.acct,
        url: `https://example.social/@${m.acct}`,
      })),
    } as unknown as Status;
    return n;
  }

  it('keys a public mention by its author', () => {
    const fixture = setUp();

    expect(internals(fixture).chatKey(mentionOf('public', [{ acct: 'me' }]))).toBe('pub:alice');
  });

  it('keys a direct mention by participant set, so it matches the private row', () => {
    const fixture = setUp();
    TestBed.inject(Auth).account.set({ id: '1', acct: 'me' } as Account);

    // Sorted, and without my own handle: the format `privateKey` builds on the
    // Conversations side. A `pub:` key here matched no row and drafted a stub.
    expect(internals(fixture).chatKey(mentionOf('direct', [{ acct: 'me' }, { acct: 'bob' }]))).toBe(
      'priv:alice,bob',
    );
  });

  it('turning auto-refresh off closes the stream', () => {
    const fixture = setUpLive();

    TestBed.inject(ClientPrefs).setAutoRefreshTimeline(false);
    fixture.detectChanges();

    expect(internals(fixture).live()).toBe(false);
    expect(fakeStreaming.closed).toBe(true);
  });

  it('closes the stream on the Bluesky source, which has none to open', () => {
    const fixture = setUpLive();

    internals(fixture).setSource('bluesky');
    fixture.detectChanges();

    expect(internals(fixture).live()).toBe(false);
    expect(fakeStreaming.closed).toBe(true);
  });
});
