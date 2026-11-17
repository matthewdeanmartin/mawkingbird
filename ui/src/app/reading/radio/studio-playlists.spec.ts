import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowTrust } from '../../accounts/follow-trust';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { Playback } from '../video-player/playback';
import { PlaylistPublisher } from './playlist-publisher';
import { PlaylistThread } from './playlist-thread';
import { RadioPlaylists } from './radio-playlists';
import { StudioPlaylists } from './studio-playlists';

describe('StudioPlaylists', () => {
  let auth: { isAnonymous: boolean };
  let publisher: {
    find: ReturnType<typeof vi.fn>;
    adopt: ReturnType<typeof vi.fn>;
    finding: ReturnType<typeof signal<boolean>>;
    found: ReturnType<typeof signal<PlaylistThread[] | null>>;
    cost: ReturnType<typeof vi.fn>;
    plan: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    auth = { isAnonymous: false };
    publisher = {
      find: vi.fn(async () => undefined),
      adopt: vi.fn(async () => 'adopted'),
      finding: signal(false),
      found: signal<PlaylistThread[] | null>(null),
      cost: vi.fn(() => 0),
      plan: vi.fn(() => ({})),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'radio/studio/playlists/:id', children: [] }]),
        {
          provide: Auth,
          useValue: Object.assign(auth, { kind: signal('mastodon'), token: signal('t') }),
        },
        { provide: PlaylistPublisher, useValue: publisher },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(StudioPlaylists);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  }

  it('lists only playlists authored to publish, and finds posted threads without being asked', () => {
    const playlists = TestBed.inject(RadioPlaylists);
    playlists.refresh();
    playlists.create('For listening');
    playlists.create('For posting', [], true);
    const { root } = render();
    expect(root.querySelector('ul.rows')?.textContent).toContain('For posting');
    expect(root.textContent).not.toContain('For listening');
    expect(root.textContent).toContain('Not published');
    expect(publisher.find).toHaveBeenCalledOnce();
  });

  it('starts an authored playlist and keeps a posted thread in Studio', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const { page } = render();
    page.create();
    const [row] = TestBed.inject(RadioPlaylists).saved();
    expect(row).toMatchObject({ name: 'Untitled playlist', authored: true });
    expect(navigate).toHaveBeenCalledWith(['/radio/studio/playlists', row.id]);
    const thread = { root: { id: 'r' } as Status, posts: [], recordings: 2 };
    await page.adopt(thread);
    expect(publisher.adopt).toHaveBeenCalledWith(thread);
    expect(navigate).toHaveBeenCalledWith(['/radio/studio/playlists', 'adopted']);
  });

  it('does not look for threads while signed out', () => {
    auth.isAnonymous = true;
    const { root } = render();
    expect(publisher.find).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Sign in to publish playlists.');
  });
});
