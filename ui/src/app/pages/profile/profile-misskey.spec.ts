import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { saveMisskeyIdentity } from '../../providers/misskey/misskey-identity-store';
import { MkNote } from '../../providers/misskey/misskey-types';
import { Profile } from './profile';

const SERVER = 'https://misskey.design';

const note = (id: string): MkNote => ({
  id,
  createdAt: '2026-11-09T10:00:00.000Z',
  text: `note ${id}`,
  user: { id: 'u9', name: 'Ai', username: 'ai', host: null, avatarUrl: null },
  userId: 'u9',
  visibility: 'public',
});

/**
 * A Misskey profile (`/accounts/mk:<userId>`, M1 follow-up): read through the
 * reader's own Misskey server, read-only, and never through the Mastodon API.
 */
describe('Profile of a Misskey user', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'mk:u9' })),
            snapshot: {
              queryParamMap: convertToParamMap({}),
              paramMap: convertToParamMap({ id: 'mk:u9' }),
            },
            queryParamMap: of(convertToParamMap({})),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok' },
    );
    TestBed.inject(Auth).enterMisskey(key);
  });

  afterEach(() => {
    expect(http.match((r) => r.url.startsWith('/api/v1') || r.url.startsWith('/api/v2'))).toEqual(
      [],
    );
    localStorage.clear();
  });

  async function setUp(): Promise<ComponentFixture<Profile>> {
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    const show = await vi.waitFor(() => http.expectOne(`${SERVER}/api/users/show`));
    expect(show.request.body).toEqual({ userId: 'u9', i: 'tok' });
    show.flush({
      id: 'u9',
      name: 'Ai',
      username: 'ai',
      host: null,
      avatarUrl: null,
      description: '**こんにちは**',
      followersCount: 12,
      followingCount: 3,
      notesCount: 40,
    });
    const notes = await vi.waitFor(() => http.expectOne(`${SERVER}/api/users/notes`));
    expect(notes.request.body).toMatchObject({ userId: 'u9', i: 'tok' });
    notes.flush([note('n2'), note('n1')]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('note n2');
    });
    return fixture;
  }

  it('shows the user and their notes from the Misskey server', async () => {
    const fixture = await setUp();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ai');
    expect(el.textContent).toContain('note n2');
    expect(el.querySelector('.bio, .note, [class*="bio"]')?.innerHTML ?? el.innerHTML).toContain(
      '<strong>こんにちは</strong>',
    );
  });

  it('offers Open on Misskey and no follow, tabs or analytics', async () => {
    const fixture = await setUp();
    const el = fixture.nativeElement as HTMLElement;
    const open = Array.from(el.querySelectorAll('a')).find((a) =>
      a.getAttribute('href')?.startsWith(`${SERVER}/@ai`),
    );
    expect(open).toBeDefined();
    expect(el.querySelector('.profile-tabs')).toBeNull();
  });

  it('loads the next page with untilId', async () => {
    const fixture = await setUp();
    (fixture.componentInstance as unknown as { loadMore(): void }).loadMore();
    const next = await vi.waitFor(() => http.expectOne(`${SERVER}/api/users/notes`));
    expect(next.request.body.untilId).toBe('n1');
    next.flush([]);
  });
});
