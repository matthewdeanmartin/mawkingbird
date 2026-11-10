import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { saveMisskeyIdentity } from '../../providers/misskey/misskey-identity-store';
import { MkNote } from '../../providers/misskey/misskey-types';
import { MisskeyFeed } from './misskey-feed';

const SERVER = 'https://misskey.design';
const api = (endpoint: string) => `${SERVER}/api/${endpoint}`;
const note = (id: string): MkNote => ({
  id,
  createdAt: '2026-11-10T10:00:00.000Z',
  text: `note ${id}`,
  user: { id: 'u9', name: 'Ai', username: 'ai', host: null, avatarUrl: null },
  userId: 'u9',
  visibility: 'public',
});

describe('Misskey feed page (M3)', () => {
  let http: HttpTestingController;

  function setUp(kind: string, id: string, permissions?: string[]): void {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ kind, id })) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok', ...(permissions ? { permissions } : {}) },
    );
    TestBed.inject(Auth).enterMisskey(key);
  }

  afterEach(() => localStorage.clear());

  const text = (el: HTMLElement) => el.textContent ?? '';

  it.each([
    ['antenna', 'antennas/show', 'antennas/notes', 'antennaId'],
    ['list', 'users/lists/show', 'notes/user-list-timeline', 'listId'],
    ['clip', 'clips/show', 'clips/notes', 'clipId'],
  ])('reads a %s and pages it', async (kind, show, notes, key) => {
    setUp(kind, 'x1');
    const fixture = TestBed.createComponent(MisskeyFeed);
    fixture.detectChanges();
    const info = http.expectOne(api(show));
    expect(info.request.body).toEqual({ [key]: 'x1', i: 'tok' });
    info.flush({ id: 'x1', name: 'My feed' });
    const first = await vi.waitFor(() => http.expectOne(api(notes)));
    expect(first.request.body).toMatchObject({ [key]: 'x1', limit: 20 });
    first.flush([note('n1'), note('n2')]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture.nativeElement)).toContain('My feed');
      expect(text(fixture.nativeElement)).toContain('note n2');
    });
    const more = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Load more',
    );
    more!.click();
    const second = await vi.waitFor(() => http.expectOne(api(notes)));
    expect(second.request.body).toMatchObject({ untilId: 'n2' });
    second.flush([]);
  });

  it('follows a channel when the account may write', async () => {
    setUp('channel', 'c1', ['read:account', 'write:notes', 'write:channels']);
    const fixture = TestBed.createComponent(MisskeyFeed);
    fixture.detectChanges();
    http.expectOne(api('channels/show')).flush({ id: 'c1', name: 'Gamedev', isFollowing: false });
    (await vi.waitFor(() => http.expectOne(api('channels/timeline')))).flush([]);
    const follow = await vi.waitFor(() => {
      fixture.detectChanges();
      const found = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Follow channel',
      );
      expect(found).toBeTruthy();
      return found!;
    });
    follow.click();
    const req = http.expectOne(api('channels/follow'));
    expect(req.request.body).toEqual({ channelId: 'c1', i: 'tok' });
    req.flush(null);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture.nativeElement)).toContain('Unfollow channel');
    });
  });

  it('asks once more before following channels with a token from before M3', async () => {
    setUp('channel', 'c1', ['read:account', 'write:notes']);
    const fixture = TestBed.createComponent(MisskeyFeed);
    fixture.detectChanges();
    http.expectOne(api('channels/show')).flush({ id: 'c1', name: 'Gamedev', isFollowing: false });
    (await vi.waitFor(() => http.expectOne(api('channels/timeline')))).flush([]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture.nativeElement)).toContain('Allow following channels');
      expect(text(fixture.nativeElement)).not.toContain('Follow channel');
    });
  });

  it('says when the feed could not be read', async () => {
    setUp('antenna', 'gone');
    const fixture = TestBed.createComponent(MisskeyFeed);
    fixture.detectChanges();
    http.expectOne(api('antennas/show')).flush(null, { status: 400, statusText: 'Bad Request' });
    (await vi.waitFor(() => http.expectOne(api('antennas/notes')))).flush(
      { error: { code: 'NO_SUCH_ANTENNA' } },
      { status: 400, statusText: 'Bad Request' },
    );
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture.nativeElement)).toContain('Could not load this from the Misskey server');
    });
  });
});
