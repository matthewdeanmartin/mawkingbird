import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { FEED_SECTIONS } from './feed-sections';
import {
  MISSKEY_VISITOR,
  saveMisskeyIdentity,
  saveMisskeyVisitor,
} from '../../connections/misskey/misskey-identity-store';
import { MisskeyProvider } from '../../connections/misskey/misskey-provider';
import { RssCache } from '../../reading/rss/rss-cache';
import { Lists } from './lists';

const SERVER = 'https://misskey.design';
const api = (endpoint: string) => `${SERVER}/api/${endpoint}`;

/**
 * M3: the Feeds page offers only the feeds of networks the account can read,
 * and a Misskey account gets its own: timelines, antennas, lists, channels, clips.
 */
describe('Feeds for a Misskey account', () => {
  let http: HttpTestingController;
  const query = new BehaviorSubject(convertToParamMap({ section: 'all' }));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // The Timelines links go Home; a bare route lets that navigation land.
        provideRouter([{ path: 'home', children: [] }]),
        { provide: RssCache, useValue: { evict: () => Promise.resolve() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: {}, queryParamMap: convertToParamMap({ section: 'all' }) },
            queryParamMap: query.asObservable(),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Never the Mastodon API: this account has no Mastodon server.
    expect(http.match((req) => req.url.includes('/api/v1') || req.url.includes('/api/v2'))).toEqual(
      [],
    );
    localStorage.clear();
  });

  function signIn(): void {
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok', permissions: ['read:account', 'write:notes'] },
    );
    TestBed.inject(Auth).enterMisskey(key);
  }

  function open() {
    const fixture = TestBed.createComponent(Lists);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      sectionOptions(): { id: string }[];
    };
    return { fixture, page };
  }

  const text = (el: HTMLElement) => el.textContent ?? '';

  it('offers the Misskey sections and none of the Mastodon or Bluesky ones', () => {
    signIn();
    const { page } = open();
    http.match(() => true).forEach((req) => req.flush([]));
    const ids = page.sectionOptions().map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'mk-timelines',
        'mk-antennas',
        'mk-lists',
        'mk-channels',
        'mk-clips',
      ]),
    );
    for (const section of FEED_SECTIONS.filter((s) => s.network === 'mastodon')) {
      expect(ids).not.toContain(section.id);
    }
    expect(ids.some((id) => id.startsWith('bsky-'))).toBe(false);
    // Network-free feeds stay.
    expect(ids).toEqual(expect.arrayContaining(['rss', 'videos', 'other-servers']));
  });

  it('lists antennas, lists, channels and clips, each opening its feed page', async () => {
    signIn();
    const { fixture } = open();
    http.expectOne(api('channels/featured')).flush([{ id: 'c9', name: 'お絵描き' }]);
    http.expectOne(api('antennas/list')).flush([{ id: 'a1', name: 'Cats' }]);
    http.expectOne(api('users/lists/list')).flush([{ id: 'l1', name: 'Friends' }]);
    http.expectOne(api('channels/followed')).flush([{ id: 'c1', name: 'Gamedev' }]);
    http.expectOne(api('channels/my-favorites')).flush([]);
    http.expectOne(api('clips/list')).flush([{ id: 'k1', name: 'Saved art', notesCount: 4 }]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(text(el)).toContain('Cats');
      expect(text(el)).toContain('Saved art');
    });
    const hrefs = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')]
      .map((a) => a.getAttribute('href'))
      .filter((href) => href?.startsWith('/misskey/'));
    expect(hrefs).toEqual([
      '/misskey/antenna/a1',
      '/misskey/list/l1',
      '/misskey/channel/c1',
      '/misskey/channel/c9',
      '/misskey/clip/k1',
    ]);
  });

  it('opens a timeline on Home', () => {
    signIn();
    const { fixture } = open();
    http.match(() => true).forEach((req) => req.flush([]));
    fixture.detectChanges();
    const local = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')].find(
      (link) => link.textContent?.trim() === 'Local',
    );
    expect(local?.getAttribute('href')).toBe('/home');
    local!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(TestBed.inject(MisskeyProvider).timeline()).toBe('local');
  });

  it('gives the visitor the timelines and featured channels only', () => {
    saveMisskeyVisitor(SERVER);
    TestBed.inject(Auth).enterMisskey(MISSKEY_VISITOR);
    const { fixture } = open();
    http.expectOne(api('channels/featured')).flush([]);
    http.expectNone(api('antennas/list'));
    http.expectNone(api('clips/list'));
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('Sign in to use yours');
  });
});
