import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { LoginMisskey } from '../../accounts/sign-in/login-misskey/login-misskey';
import { stubLocation } from '../../testing/stub-location';
import { Status } from '../../platform/api/models';
import { TranslationRouter } from '../../translation/translation-router';
import { AnonymousCapabilities } from '../../accounts/anonymous/anonymous-capabilities';
import { MisskeyApi } from './misskey-api';
import { MisskeyAuth } from './misskey-auth';
import {
  MISSKEY_VISITOR,
  MK_VISITOR_FOLLOWS_KEY,
  misskeyIdentities,
  misskeyIdentity,
  misskeyVisitorServer,
  saveMisskeyIdentity,
  saveMisskeyVisitor,
} from './misskey-identity-store';
import { MK_VISITOR_TIMELINES, MisskeyProvider } from './misskey-provider';
import { MkNote } from './misskey-types';
import {
  MISSKEY_VISITOR_FOLLOW_LIMIT,
  misskeyFollowKey,
  MisskeyVisitorFollows,
} from './misskey-visitor-follows';

const IO = 'https://misskey.io';
const DESIGN = 'https://misskey.design';

function note(id: string, createdAt: string, userId = 'u1'): MkNote {
  return {
    id,
    createdAt,
    text: `note ${id}`,
    user: { id: userId, name: null, username: `user${userId}`, host: null, avatarUrl: null },
    userId,
    visibility: 'public',
  };
}

describe('Misskey visitor (MA)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function enterVisitor(server = IO): Auth {
    saveMisskeyVisitor(server);
    const auth = TestBed.inject(Auth);
    expect(auth.enterMisskey(MISSKEY_VISITOR)).toBe(true);
    return auth;
  }

  describe('identity', () => {
    it('is one virtual Misskey user beside the signed-in ones, with no token', () => {
      saveMisskeyIdentity(
        { server: DESIGN, userId: 'u1', username: 'me', name: null, avatarUrl: null },
        { token: 'tok' },
      );
      saveMisskeyVisitor('misskey.io');
      expect(misskeyVisitorServer()).toBe(IO);
      const keys = misskeyIdentities().map((identity) => identity.key);
      expect(keys).toEqual([`${DESIGN}#u1`, MISSKEY_VISITOR]);
      expect(misskeyIdentity(MISSKEY_VISITOR)?.credentials.token).toBe('');
    });

    it('keeps its identity key (and so its account scope) when moving servers', () => {
      expect(saveMisskeyVisitor(IO)).toBe(MISSKEY_VISITOR);
      expect(saveMisskeyVisitor(DESIGN)).toBe(MISSKEY_VISITOR);
      expect(misskeyIdentity(MISSKEY_VISITOR)?.profile.server).toBe(DESIGN);
    });

    it('enters as the Misskey visitor, named as such, and cannot write', () => {
      const auth = enterVisitor();
      expect(auth.isMisskeyPrimary).toBe(true);
      expect(auth.isMisskeyVisitor).toBe(true);
      expect(auth.account()?.display_name).toBe('Misskey visitor');
      expect(auth.account()?.acct).toBe('visitor@misskey.io');
      expect(auth.misskeyAccounts().map((choice) => choice.misskeyKey)).toEqual([MISSKEY_VISITOR]);
      const caps = TestBed.inject(AnonymousCapabilities);
      expect(caps.canCompose).toBe(false);
      expect(caps.canWriteMisskey).toBe(false);
    });

    it('forgets its server and follows when removed', () => {
      const auth = enterVisitor();
      TestBed.inject(MisskeyVisitorFollows).follow({ id: 'u2', username: 'ai' }, IO);
      expect(localStorage.getItem(MK_VISITOR_FOLLOWS_KEY)).not.toBeNull();
      auth.removeMisskeyIdentity(MISSKEY_VISITOR);
      expect(misskeyVisitorServer()).toBeNull();
      expect(localStorage.getItem(MK_VISITOR_FOLLOWS_KEY)).toBeNull();
      expect(auth.isMisskeyVisitor).toBe(false);
    });
  });

  it('calls the API without a token', async () => {
    enterVisitor();
    const read = firstValueFrom(TestBed.inject(MisskeyApi).note('n1'));
    const req = http.expectOne(`${IO}/api/notes/show`);
    expect(req.request.body).toEqual({ noteId: 'n1' });
    req.flush(note('n1', '2026-11-10T00:00:00.000Z'));
    await read;
  });

  it("never asks the server's translator, which needs an account", () => {
    enterVisitor();
    const status = { provider: 'misskey', providerRef: { server: IO, noteId: 'n1' } } as Status;
    expect(TestBed.inject(TranslationRouter).misskeyCanTry(status)).toBe(false);
  });

  describe('follows', () => {
    it('keys a person by username@host, whichever server they were found through', () => {
      expect(misskeyFollowKey({ id: 'a', username: 'Ai', host: null }, IO)).toBe('ai@misskey.io');
      expect(misskeyFollowKey({ id: 'b', username: 'ai', host: 'misskey.io' }, DESIGN)).toBe(
        'ai@misskey.io',
      );
    });

    it('follows, unfollows, and stops at the limit', () => {
      const follows = TestBed.inject(MisskeyVisitorFollows);
      expect(follows.follow({ id: 'u2', username: 'ai', host: 'misskey.io' }, DESIGN)).toBe(true);
      expect(follows.follows()[0]).toMatchObject({
        key: 'ai@misskey.io',
        server: DESIGN,
        userId: 'u2',
        host: 'misskey.io',
      });
      expect(follows.isFollowing({ id: 'x', username: 'ai' }, IO)).toBe(true);
      follows.unfollow({ id: 'u2', username: 'ai', host: 'misskey.io' }, DESIGN);
      expect(follows.count()).toBe(0);
      for (let i = 0; i < MISSKEY_VISITOR_FOLLOW_LIMIT; i++) {
        follows.follow({ id: `u${i}`, username: `p${i}` }, IO);
      }
      expect(follows.follow({ id: 'extra', username: 'extra' }, IO)).toBe(false);
      expect(follows.count()).toBe(MISSKEY_VISITOR_FOLLOW_LIMIT);
    });
  });

  describe('Home timelines', () => {
    it('offers Following, Local and Global, starting on Local', () => {
      enterVisitor();
      const provider = TestBed.inject(MisskeyProvider);
      provider.reset();
      expect(provider.timeline()).toBe('local');
      expect(MK_VISITOR_TIMELINES).toEqual(['following', 'local', 'global']);
    });

    it('reads Local without a token', async () => {
      enterVisitor();
      const provider = TestBed.inject(MisskeyProvider);
      provider.reset();
      const page = firstValueFrom(provider.fetchPage());
      const req = http.expectOne(`${IO}/api/notes/local-timeline`);
      expect(req.request.body.i).toBeUndefined();
      req.flush([note('n1', '2026-11-10T00:00:00.000Z')]);
      expect((await page).map((s) => s.id)).toHaveLength(1);
    });

    it("reads Following from each followed user's notes, merged newest first", async () => {
      enterVisitor();
      const follows = TestBed.inject(MisskeyVisitorFollows);
      follows.follow({ id: 'u1', username: 'one' }, IO);
      follows.follow({ id: 'u2', username: 'two' }, DESIGN);
      follows.follow({ id: 'u3', username: 'three' }, IO);
      const provider = TestBed.inject(MisskeyProvider);
      provider.setTimeline('following');
      provider.reset();
      const page = firstValueFrom(provider.fetchPage());
      const calls = http.match((req) => req.url.endsWith('/api/users/notes'));
      expect(calls.map((req) => [req.request.url, req.request.body.userId])).toEqual([
        [`${IO}/api/users/notes`, 'u1'],
        [`${DESIGN}/api/users/notes`, 'u2'],
        [`${IO}/api/users/notes`, 'u3'],
      ]);
      expect(calls.every((req) => req.request.body.i === undefined)).toBe(true);
      calls[0].flush([note('a', '2026-11-10T01:00:00.000Z', 'u1')]);
      calls[1].flush([note('b', '2026-11-10T03:00:00.000Z', 'u2')]);
      // One unreadable user is skipped and named, not the whole page.
      calls[2].flush(null, { status: 500, statusText: 'Server Error' });
      const statuses = await vi.waitFor(() => page);
      expect(statuses.map((s) => s.created_at)).toEqual([
        '2026-11-10T03:00:00.000Z',
        '2026-11-10T01:00:00.000Z',
      ]);
      expect(provider.errors()).toEqual(['@three@misskey.io']);
    });

    it('gives a signed-in account the server timelines, not Following', () => {
      const key = saveMisskeyIdentity(
        { server: IO, userId: 'u1', username: 'me', name: null, avatarUrl: null },
        { token: 'tok' },
      );
      TestBed.inject(Auth).enterMisskey(key);
      const provider = TestBed.inject(MisskeyProvider);
      provider.reset();
      expect(provider.timeline()).toBe('home');
    });
  });
});

describe('LoginMisskey: look around without an account', () => {
  let checkServer: ReturnType<typeof vi.fn>;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    checkServer = vi.fn().mockResolvedValue(IO);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MisskeyAuth, useValue: { checkServer, begin: vi.fn(), complete: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParams: { visit: '1' },
              queryParamMap: {
                get: () => null,
                has: (key: string) => key === 'visit',
              },
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  function open() {
    const fixture = TestBed.createComponent(LoginMisskey);
    fixture.detectChanges();
    http.match(() => true).forEach((req) => req.flush([]));
    return {
      fixture,
      page: fixture.componentInstance as unknown as {
        server: { set(v: string): void };
        visit(): Promise<void>;
      },
    };
  }

  it('becomes the visitor of a server that shows visitors its notes', async () => {
    const assigned: string[] = [];
    stubLocation({ onAssign: (url) => assigned.push(url) });
    const { page } = open();
    page.server.set('misskey.io');
    const done = page.visit();
    (await vi.waitFor(() => http.expectOne(`${IO}/api/meta`))).flush({
      name: 'Misskey.io',
      ugcVisibilityForVisitor: 'local',
    });
    await done;
    expect(TestBed.inject(Auth).isMisskeyVisitor).toBe(true);
    expect(misskeyVisitorServer()).toBe(IO);
    expect(assigned).toEqual(['home']);
  });

  it('turns down a server that hides everything from visitors', async () => {
    const { fixture, page } = open();
    page.server.set('misskey.io');
    const done = page.visit();
    (await vi.waitFor(() => http.expectOne(`${IO}/api/meta`))).flush({
      name: 'Misskey.io',
      ugcVisibilityForVisitor: 'none',
    });
    await done;
    fixture.detectChanges();
    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('misskey.io does not show its notes to visitors');
    expect(misskeyVisitorServer()).toBeNull();
  });
});
