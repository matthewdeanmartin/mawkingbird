import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { FollowTrust } from '../../accounts/follow-trust';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { Playback } from '../video-player/playback';
import { PlaylistsPage } from './playlists-page';
import { RadioPlaylists } from './radio-playlists';

function post(id: string, extra: Partial<Status> = {}): Status {
  return {
    id,
    url: `https://sea.example/@singer/${id}`,
    visibility: 'public',
    created_at: `2026-11-0${id}T00:00:00Z`,
    account: { id: 'singer', acct: 'singer@sea.example' },
    content: `<p>Mix ${id}</p>`,
    media_attachments: [{ id: `m${id}`, type: 'audio', url: `https://audio.example/${id}.mp3` }],
    ...extra,
  } as unknown as Status;
}

describe('PlaylistsPage', () => {
  let data: BehaviorSubject<Record<string, string>>;
  let auth: { isAnonymous: boolean };
  let publicApi: {
    lookupAccount: ReturnType<typeof vi.fn>;
    getAccountStatuses: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    data = new BehaviorSubject<Record<string, string>>({});
    auth = { isAnonymous: false };
    publicApi = {
      lookupAccount: vi.fn(() => of({ id: 'singer' })),
      getAccountStatuses: vi.fn(() =>
        of([
          post('1'),
          post('2', { in_reply_to_id: '1', in_reply_to_account_id: 'singer' }),
          post('3'),
        ]),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'playlists', children: [] },
          { path: 'playlists/:id', children: [] },
          { path: 'singles', children: [] },
        ]),
        {
          provide: Auth,
          useValue: Object.assign(auth, { kind: signal('mastodon'), token: signal('t') }),
        },
        { provide: Api, useValue: {} },
        { provide: AnonymousPublicApi, useValue: publicApi },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        { provide: ActivatedRoute, useValue: { snapshot: {}, data } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(PlaylistsPage);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  }

  it('starts empty with three ways in, and New playlist opens an empty playlist', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const { page, root } = render();
    expect(root.textContent).toContain('No playlists yet');
    expect(Array.from(root.querySelectorAll('a'), (link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/singles', '/playlists/find']),
    );
    page.create();
    const [row] = TestBed.inject(RadioPlaylists).saved();
    expect(row).toMatchObject({ name: 'Untitled playlist', tracks: [] });
    expect(navigate).toHaveBeenCalledWith(['/playlists', row.id]);
  });

  it('lists saved playlists once, without a repeated heading', () => {
    TestBed.inject(RadioPlaylists).refresh();
    TestBed.inject(RadioPlaylists).create('Morning');
    const { root } = render();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('ul[mbItemList]')?.textContent).toContain('Morning');
    expect(root.textContent).not.toContain('No playlists yet');
  });

  it('opens a playlist link as a shared preview, refusing other links', () => {
    data.next({ view: 'find' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const { page } = render();
    page.link.set('https://example.com/not-a-post');
    page.openLink();
    expect(page.linkError()).toBe(true);
    page.link.set('https://sea.example/@singer/1');
    page.openLink();
    expect(navigate).toHaveBeenCalledWith(['/playlists', 'shared'], {
      queryParams: { post: 'https://sea.example/@singer/1' },
    });
  });

  it('finds an account’s playlist threads and multi-recording posts while signed out', async () => {
    auth.isAnonymous = true;
    data.next({ view: 'find' });
    const { page, fixture, root } = render();
    page.handle.set('singer@sea.example');
    await page.look();
    fixture.detectChanges();
    expect(publicApi.lookupAccount).toHaveBeenCalledWith('https://sea.example', 'singer');
    expect(page.found()?.map((thread) => thread.root.id)).toEqual(['1']);
    expect(root.textContent).toContain('2 recordings');
    expect(root.textContent).not.toContain('My playlist threads');
  });
});
