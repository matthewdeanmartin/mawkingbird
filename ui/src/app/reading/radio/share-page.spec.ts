import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowTrust } from '../../accounts/follow-trust';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { Compose } from '../../publishing/compose/compose';
import { Drafts } from '../../publishing/drafts';
import { TargetAvailabilitySource } from '../../publishing/compose/target-availability';
import { Playback } from '../video-player/playback';
import { RadioPlayer } from './radio-player';
import { RadioPlaylists } from './radio-playlists';
import { SharePage } from './share-page';
import { ShareRequest } from './share-request';

@Component({ selector: 'app-compose', template: 'composer' })
class ComposeStub {
  readonly draftContext = input('');
  readonly acceptHandoff = input(false);
  readonly posted = output<Status>();
}

function post(id: string, content = ''): Status {
  return {
    id,
    url: `https://sea.example/@singer/${id}`,
    visibility: 'public',
    account: { id: 'singer', acct: 'singer@sea.example', display_name: 'Singer' },
    content: content || `<p>Song ${id}</p>`,
    tags: [],
    spoiler_text: '',
    sensitive: false,
    media_attachments: content
      ? []
      : [{ id: `m${id}`, type: 'audio', url: `https://audio.example/${id}.mp3` }],
  } as unknown as Status;
}

describe('SharePage', () => {
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let auth: { isAnonymous: boolean };

  beforeEach(() => {
    localStorage.clear();
    params = new BehaviorSubject(convertToParamMap({}));
    auth = { isAnonymous: false };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: Object.assign(auth, {
            kind: signal('mastodon'),
            token: signal('t'),
            account: signal(null),
          }),
        },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        { provide: TargetAvailabilitySource, useValue: { current: () => ({}) } },
        { provide: ActivatedRoute, useValue: { snapshot: {}, queryParamMap: params } },
      ],
    });
    TestBed.overrideComponent(SharePage, {
      remove: { imports: [Compose] },
      add: { imports: [ComposeStub] },
    });
  });

  function render() {
    const fixture = TestBed.createComponent(SharePage);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  }

  it('asks for something to share when nothing was offered', () => {
    const { root } = render();
    expect(root.textContent).toContain('Nothing to share yet');
  });

  it('builds a post from a recording with every service link, then opens the composer', () => {
    const spotify = post(
      's',
      '<p>Sea song</p><a href="https://open.spotify.com/track/abc123">Spotify</a> <a href="https://singer.bandcamp.com/track/sea">Bandcamp</a>',
    );
    TestBed.inject(ShareRequest).offer(TestBed.inject(RadioPlayer).singlesOf(spotify)[0]);
    const { page, fixture, root } = render();
    expect(page.links().map((link) => link.label)).toEqual([
      'The Mastodon post',
      'Spotify',
      'Bandcamp',
    ]);
    expect(page.text()).toContain('https://singer.bandcamp.com/track/sea');
    expect(page.text()).toContain('shared by @singer@sea.example');
    expect(page.text()).toContain('#nowplaying');
    page.toggleLink('https://open.spotify.com/track/abc123', false);
    page.includeCredit.set(false);
    expect(page.text()).not.toContain('spotify');
    expect(page.text()).not.toContain('shared by');
    // Sites without a connected account get their own share pages.
    expect(page.intents().map((intent) => intent.id)).toContain('reddit');

    page.write();
    fixture.detectChanges();
    expect(TestBed.inject(Drafts).takeHandoff()?.snapshot.segments).toEqual([page.text()]);
    expect(root.querySelector('app-compose')).toBeTruthy();
    expect(page.changed()).toBe(false);
    page.toggleTag('fedimusic', true);
    fixture.detectChanges();
    expect(page.changed()).toBe(true);
    expect(root.textContent).toContain('Start again from these choices');
  });

  it('shares a playlist as one numbered post, or as a Mastodon thread when signed in', () => {
    const player = TestBed.inject(RadioPlayer);
    const playlists = TestBed.inject(RadioPlaylists);
    playlists.refresh();
    const id = playlists.create('Road trip', [
      ...player.tracks(post('1')),
      ...player.tracks(post('2')),
    ])!;
    params.next(convertToParamMap({ playlist: id }));
    const { page, fixture, root } = render();
    // Each track links where it plays: here, its audio file.
    expect(
      page.text().startsWith('Road trip\n\n1. Song 1\nhttps://audio.example/1.mp3\n2. Song 2'),
    ).toBe(true);
    expect(page.text()).toContain('#fedimusic');
    expect(page.formats().find((format) => format.value === 'thread')?.disabled).toBe(false);
    page.format.set('thread');
    fixture.detectChanges();
    expect(root.querySelector('section.publish')).toBeTruthy();
    expect(root.querySelector('app-compose')).toBeNull();
  });

  it('offers the thread only to a signed-in Mastodon account', () => {
    auth.isAnonymous = true;
    const playlists = TestBed.inject(RadioPlaylists);
    playlists.refresh();
    const id = playlists.create('Mix', TestBed.inject(RadioPlayer).tracks(post('1')))!;
    params.next(convertToParamMap({ playlist: id }));
    const { page, root } = render();
    expect(page.formats().find((format) => format.value === 'thread')?.disabled).toBe(true);
    expect(root.textContent).toContain('Sign in to a Mastodon account to post a thread.');
  });
});
