import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of } from 'rxjs';
import { Location } from '@angular/common';
import { Api } from '../../platform/api/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchQueue } from '../videos/watch-queue';
import { Watch } from './watch';
import { PartyConversation } from './party-conversation';
import { WatchPartyPrefs } from '../videos/watch-party-prefs';
import { ThreadLoader } from '../read/thread-loader';
import {
  anonymousStatusRouteRef,
  parseAnonymousStatusRouteRef,
} from '../../accounts/anonymous/anonymous-route-ref';
import { loginDestination } from '../../platform/session/login-destination';
import { StatusCard } from '../../posts/status-card/status-card';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { StatusVisibility } from '../../moderation/status-visibility';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { FollowTrust } from '../../accounts/follow-trust';
import { ReadingZen } from '../reading-zen';
import { WatchVideoPanel } from './watch-video-panel';
import { VideoSource } from '../video-player/media-source';
import { YoutubeComment } from '../videos/youtube-details';
import { PeerTubeVideo, PeerTubeVideos } from '../videos/peertube';

@Component({
  selector: 'app-status-card',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class CardStub {
  // Required, as on the real card: reading it before it is set throws (NG0950).
  readonly status = input.required<Status>();
  get display(): Status {
    return this.status();
  }
  readonly showMedia = input(true);
  readonly partyTagsEnabled = input(false);
  readonly partyTagAdded = output<string>();
  readonly filterContext = input('thread');
  readonly changed = output<Status>();
  readonly deleted = output<Status>();
  readonly replied = output<Status>();
  readonly replaced = output<{ previous: Status; next: Status }>();
  readonly showOwnReplies = input(true);
}

@Component({
  selector: 'app-party-conversation',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class PartyStub {
  readonly root = input<Status | null>(null);
  readonly comments = input<Status[]>([]);
  readonly session = input('');
  readonly initialTags = input<readonly string[]>([]);
  readonly signInNext = input('');
  readonly canReply = input(false);
  readonly youtubeVideoId = input<string | null>(null);
  readonly shareLink = input<string | null>(null);
  readonly started = output<Status>();
  readonly quoted = output<YoutubeComment>();
  readonly repliesDue = output<void>();
  readonly changed = output<Status>();
  readonly deleted = output<Status>();
  readonly replied = output<Status>();
  readonly replaced = output<{ previous: Status; next: Status }>();
}

@Component({
  selector: 'app-watch-video-panel',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<span class="panel-post">{{ post()?.display?.id }}</span>',
})
class PanelStub {
  readonly source = input<VideoSource>();
  readonly status = input<Status | null>(null);
  readonly partyTag = input<string | null>(null);
  readonly playhead = input<number | null>(null);
  readonly seeker = input<((seconds: number) => boolean) | null>(null);
  readonly peertube = input<PeerTubeVideo | null>(null);
  readonly post = input<{ display: Status } | null>(null);
  readonly entry = input<{ key: string } | null>(null);
  readonly quote = vi.fn();
}

describe('Watch post access and reveal gates', () => {
  let fixture: ComponentFixture<Watch>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let loader: {
    status: ReturnType<typeof signal<Status | null>>;
    descendants: ReturnType<typeof signal<Status[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    loadError: ReturnType<typeof signal<string | null>>;
    publicOriginalUrl: ReturnType<typeof signal<string | null>>;
    publicContextUnavailable: ReturnType<typeof signal<boolean>>;
    isAnonymousPublic: ReturnType<typeof signal<boolean>>;
    isTwitter: ReturnType<typeof signal<boolean>>;
    isRss: ReturnType<typeof signal<boolean>>;
    isMessageStatus: ReturnType<typeof signal<boolean>>;
    refreshReplies: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  let blocked: ReturnType<typeof signal<boolean>>;
  const peertubeGet = vi.fn<PeerTubeVideos['get']>();
  let images: ReturnType<typeof signal<boolean>>;
  let getContext: ReturnType<typeof vi.fn>;
  const status = (): Status =>
    ({
      id: '1',
      content: '',
      spoiler_text: '',
      sensitive: false,
      account: { id: 'author' },
      media_attachments: [
        {
          id: 'v1',
          type: 'video',
          url: 'https://media.test/private.mp4',
          preview_url: '',
          description: 'A video',
        },
      ],
    }) as Status;

  beforeEach(() => {
    peertubeGet.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    params = new BehaviorSubject(
      convertToParamMap({ post: '1', attachment: 'v1', server: 'https://home.test' }),
    );
    loader = {
      status: signal<Status | null>(null),
      descendants: signal<Status[]>([]),
      loading: signal(false),
      loadError: signal<string | null>(null),
      publicOriginalUrl: signal<string | null>(null),
      publicContextUnavailable: signal(false),
      isAnonymousPublic: signal(false),
      isTwitter: signal(false),
      isRss: signal(false),
      isMessageStatus: signal(false),
      refreshReplies: vi.fn(),
      load: vi.fn(),
      destroy: vi.fn(),
    };
    blocked = signal(false);
    images = signal(true);
    getContext = vi.fn(() => of({ ancestors: [], descendants: [] as Status[] }));
    TestBed.configureTestingModule({
      imports: [Watch],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        {
          provide: Auth,
          useValue: {
            kind: signal('mastodon'),
            token: signal('token'),
            account: signal({ id: 'me' }),
          },
        },
        { provide: Server, useValue: { baseUrl: signal('https://home.test') } },
        { provide: Api, useValue: { getContext: getContext } },
        {
          provide: ClientPrefs,
          useValue: {
            showImages: images,
            feedReader: signal(false),
            autoLoadYoutubeWatch: signal(false),
          },
        },
        {
          provide: StatusVisibility,
          useValue: { rendersNothing: () => blocked(), activeFilters: () => [] },
        },
        {
          provide: TrustedAccounts,
          useValue: { entries: signal({}), cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        { provide: PeerTubeVideos, useValue: { get: peertubeGet } },
      ],
    });
    TestBed.overrideComponent(Watch, {
      remove: {
        imports: [StatusCard, PartyConversation, WatchVideoPanel],
        providers: [ThreadLoader],
      },
      add: {
        imports: [CardStub, PartyStub, PanelStub],
        providers: [{ provide: ThreadLoader, useValue: loader }],
      },
    });
  });
  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  /** Lets a resolved or rejected promise chain land, then re-renders. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }
  }

  function mount(): void {
    fixture = TestBed.createComponent(Watch);
    fixture.detectChanges();
  }

  describe('watch queue', () => {
    const A = 'aaaaaaaaaaa';
    const B = 'bbbbbbbbbbb';
    const nextButton = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('.watch-nav button')].find(
        (button) => button.textContent?.includes('Next'),
      ) as HTMLButtonElement | undefined;
    const previousButton = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('.watch-nav button')].find(
        (button) => button.textContent?.includes('Previous'),
      ) as HTMLButtonElement | undefined;

    beforeEach(() => localStorage.clear());

    it('plays the next queued video on request and retires the finished one', () => {
      const queue = TestBed.inject(WatchQueue);
      queue.add({ title: 'First', params: { youtube: A } });
      queue.add({ title: 'Second', params: { youtube: B } });
      params.next(convertToParamMap({ youtube: A, tags: 'Party' }));
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      mount();

      expect(nextButton()?.title).toBe('Next: Second');
      expect(previousButton()).toBeUndefined();
      nextButton()!.click();

      expect(queue.items().map((item) => item.title)).toEqual(['Second']);
      // The address is replaced: Back leaves Watch instead of replaying the playlist.
      expect(navigate).toHaveBeenCalledWith(['/watch'], {
        queryParams: { youtube: B },
        replaceUrl: true,
      });

      params.next(convertToParamMap({ youtube: B }));
      fixture.detectChanges();
      previousButton()!.click();
      expect(navigate).toHaveBeenLastCalledWith(['/watch'], {
        queryParams: { youtube: A },
        replaceUrl: true,
      });
    });

    it('hands the row the post card only once the card has its post', async () => {
      params.next(convertToParamMap({ post: '1', server: 'https://home.test', attachment: 'v1' }));
      mount();
      loader.status.set(status());
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.panel-post')?.textContent).toBe('1');
    });

    it('puts the title first and the shared Back and playlist together after it', () => {
      params.next(convertToParamMap({ youtube: A }));
      mount();
      const header = (fixture.nativeElement as HTMLElement).querySelector('.watch-header')!;
      expect([...header.children].map((child) => child.tagName)).toEqual(['H1', 'DIV']);
      expect(header.querySelectorAll('app-reading-back')).toHaveLength(1);
    });

    it('hands ?tags= to the party conversation, without counting them in the queue key', () => {
      params.next(convertToParamMap({ youtube: A, tags: 'Debate,Live' }));
      mount();
      const party = fixture.debugElement.query(By.directive(PartyStub))
        .componentInstance as PartyStub;
      expect(party.initialTags()).toEqual(['Debate', 'Live']);
      expect(fixture.componentInstance['currentKey']()).toBe('youtube:' + A);
    });

    it('never advances by itself and offers nothing when the queue is empty', () => {
      params.next(convertToParamMap({ youtube: A }));
      mount();
      expect(nextButton()).toBeUndefined();
      expect(fixture.nativeElement.querySelector('.watch-nav a')).toBeNull();
    });

    it('hands the video to the row as a queue entry, and keeps queueing out of the header', () => {
      params.next(convertToParamMap({ youtube: A }));
      mount();
      const panel = fixture.debugElement.query(By.directive(PanelStub))
        .componentInstance as PanelStub;
      expect(panel.entry()?.key).toBe('youtube:' + A);
      expect(fixture.nativeElement.querySelectorAll('app-queue-button')).toHaveLength(0);
    });
  });

  it('keeps the loaded YouTube iframe when a reply refreshes the author profile', () => {
    const account = signal({ id: 'me', statuses_count: 10 });
    TestBed.overrideProvider(Auth, {
      useValue: { account, token: signal('token'), kind: signal('mastodon') },
    });
    params.next(
      convertToParamMap({ youtube: 'abcdefghijk', post: '1', server: 'https://home.test' }),
    );
    mount();
    loader.status.set({
      ...status(),
      media_attachments: [],
      content: '<p><a href="https://youtu.be/abcdefghijk">video</a></p>',
    });
    fixture.detectChanges();
    const stage = fixture.nativeElement.querySelector('app-video-player-controls') as HTMLElement;
    stage.querySelector('button')!.click();
    fixture.detectChanges();
    const frame = stage.querySelector('iframe')!;
    expect(frame).toBeTruthy();
    const src = frame.src;
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: new URL(src).origin,
        source: frame.contentWindow,
        data: JSON.stringify({ event: 'infoDelivery', info: { currentTime: 93.5 } }),
      }),
    );
    expect(fixture.componentInstance['playhead']()).toBe(93.5);
    const party = fixture.debugElement.query(By.directive(PartyStub))
      .componentInstance as PartyStub;
    party.replied.emit({ ...status(), id: 'reply' });
    account.set({ id: 'me', statuses_count: 11 });
    fixture.detectChanges();
    expect(loader.descendants()[0].id).toBe('reply');
    expect(stage.querySelector('iframe')).toBe(frame);
    expect(frame.src).toBe(src);
    expect(fixture.componentInstance['playhead']()).toBe(93.5);
  });

  it('hides the rails while open, keeps the header and its menu, and lets go on leaving', () => {
    const zen = TestBed.inject(ReadingZen);
    mount();
    expect(zen.active()).toBe(true);
    expect(zen.chromeHidden()).toBe(false);
    fixture.destroy();
    expect(zen.active()).toBe(false);
    expect(zen.chromeHidden()).toBe(false);
  });

  it('resolves the post through the existing loader and selects only its requested attachment', () => {
    mount();
    expect(loader.load).toHaveBeenCalledWith('1');
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    loader.status.set(status());
    fixture.detectChanges();
    const video = fixture.nativeElement.querySelector('video');
    expect(video.src).toBe('https://media.test/private.mp4');
    expect(video.autoplay).toBe(false);
    expect(video.loop).toBe(false);
    params.next(
      convertToParamMap({ post: '1', attachment: 'not-in-post', server: 'https://home.test' }),
    );
    loader.status.set(status());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
  });

  it("opens another server's post for a signed-in reader, by author and id", () => {
    params.next(
      convertToParamMap({
        post: '117666574738195063',
        attachment: '117666575325498892',
        server: 'https://mastodon.social',
        acct: 'alice@mastodon.social',
      }),
    );
    mount();
    expect(loader.load).toHaveBeenCalledWith(
      anonymousStatusRouteRef({
        server: 'https://mastodon.social',
        id: '117666574738195063',
        originalUrl: 'https://mastodon.social/@alice@mastodon.social/117666574738195063',
      }),
    );
    // This reader's copy has its own attachment id; its one video is the video.
    loader.status.set({ ...status(), id: 'home-copy' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
  });

  it('still opens a link made before links carried the author', () => {
    params.next(
      convertToParamMap({ post: '1', attachment: 'v1', server: 'https://elsewhere.test' }),
    );
    mount();
    expect(loader.load).toHaveBeenCalledWith(
      anonymousStatusRouteRef({ server: 'https://elsewhere.test', id: '1' }),
    );
  });

  it('finds the post again when the reader changes account', () => {
    const base = signal('https://home.test');
    TestBed.overrideProvider(Server, { useValue: { baseUrl: base } });
    mount();
    expect(loader.load).toHaveBeenLastCalledWith('1');
    loader.status.set(status());
    base.set('https://other.test');
    fixture.detectChanges();
    expect(loader.load).toHaveBeenLastCalledWith(
      anonymousStatusRouteRef({ server: 'https://home.test', id: '1' }),
    );
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
  });

  it('lets Anonymous open a shared link to a post on another server', () => {
    TestBed.overrideProvider(Auth, {
      useValue: {
        kind: signal('anonymous'),
        token: signal(null),
        account: signal(null),
        isAnonymous: true,
      },
    });
    params.next(
      convertToParamMap({
        post: '117583797572986016',
        youtube: 'Usr4VpMQjQ0',
        server: 'https://mstdn.social',
      }),
    );
    mount();
    expect(loader.load).toHaveBeenCalledWith(
      anonymousStatusRouteRef({ server: 'https://mstdn.social', id: '117583797572986016' }),
    );
  });

  it('comes back from sign-in to the same post, by its public address', () => {
    const anonymous = {
      kind: signal('anonymous'),
      token: signal(null),
      account: signal(null),
      isAnonymous: true,
    };
    TestBed.overrideProvider(Auth, { useValue: anonymous });
    params.next(
      convertToParamMap({
        post: '117668053158363850',
        youtube: 'B_im-2M2l8Q',
        server: 'https://mastodon.social',
      }),
    );
    mount();
    // Both ways it can have loaded: from another server, or from Anonymous's own.
    loader.isAnonymousPublic.set(false);
    const url = 'https://mastodon.social/@someone/117668053158363850';
    loader.status.set({ ...status(), url } as Status);
    const next = (fixture.componentInstance as unknown as { signInNext(): string }).signInNext();
    // Allowed as a return page, and unchanged by the check.
    expect(loginDestination(next)).toBe(next);
    const back = new URLSearchParams(next.split('?')[1]);
    expect(next.split('?')[0]).toBe('/watch');
    expect(back.get('youtube')).toBe('B_im-2M2l8Q');
    expect(back.get('server')).toBeNull();
    expect(parseAnonymousStatusRouteRef(back.get('post')!)).toEqual({
      server: 'https://mastodon.social',
      id: '117668053158363850',
      originalUrl: url,
    });
  });

  it('opens that address for an account on another server', () => {
    const post = anonymousStatusRouteRef({
      server: 'https://mastodon.social',
      id: '9',
      originalUrl: 'https://mastodon.social/@someone/9',
    });
    params.next(convertToParamMap({ post, youtube: 'B_im-2M2l8Q' }));
    mount();
    expect(loader.load).toHaveBeenCalledWith(post);
  });

  it("finds a looked-up post's only video, whose id differs here, but never guesses", () => {
    const post = anonymousStatusRouteRef({ server: 'https://mastodon.social', id: '9' });
    params.next(convertToParamMap({ post, attachment: 'theirs' }));
    mount();
    loader.status.set(status());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
    const [video] = status().media_attachments;
    loader.status.set({ ...status(), media_attachments: [video, { ...video, id: 'v2' }] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
  });

  it('opens a shared Bluesky video in Anonymous without changing its global post id', () => {
    TestBed.overrideProvider(Auth, {
      useValue: {
        kind: signal('anonymous'),
        token: signal(null),
        account: signal(null),
        isAnonymous: true,
      },
    });
    const post = 'bsky:at://did:plc:alice/app.bsky.feed.post/3kxyz';
    params.next(convertToParamMap({ post, attachment: 'v1', server: 'https://home.test' }));
    mount();
    expect(loader.load).toHaveBeenCalledWith(post);
    loader.status.set({ ...status(), id: post, provider: 'bluesky' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
  });

  it('shows unavailable when a shared Bluesky video is not public', () => {
    params.next(
      convertToParamMap({
        post: 'bsky:at://did:plc:alice/app.bsky.feed.post/hidden',
        attachment: 'v1',
        server: 'https://home.test',
      }),
    );
    mount();
    loader.status.set(null);
    loader.loading.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain(
      'unavailable',
    );
    expect(fixture.nativeElement.querySelector('video')).toBeNull();

    // A shared link never ends here: the post's own page, and other videos.
    loader.publicOriginalUrl.set('https://bsky.app/profile/did:plc:alice/post/hidden');
    fixture.detectChanges();
    const links = [...fixture.nativeElement.querySelectorAll('a')].map((a: HTMLAnchorElement) =>
      a.getAttribute('href'),
    );
    expect(links).toContain('https://bsky.app/profile/did:plc:alice/post/hidden');
    expect(links).toContain('/videos');
  });

  it('still refuses Anonymous a non-https server for a server-local ID', () => {
    TestBed.overrideProvider(Auth, {
      useValue: {
        kind: signal('anonymous'),
        token: signal(null),
        account: signal(null),
        isAnonymous: true,
      },
    });
    params.next(convertToParamMap({ post: '1', youtube: 'x', server: 'http://elsewhere.test' }));
    mount();
    expect(loader.load).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      'unavailable',
    );
  });

  it('does not use a YouTube fallback to bypass an unavailable post', () => {
    params.next(
      convertToParamMap({ post: '1', youtube: 'dQw4w9WgXcQ', server: 'https://home.test' }),
    );
    mount();
    loader.loadError.set('not authorized');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-video-player-controls')).toBeNull();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });

  it('keeps sensitive and warned video unmounted until explicit reveal', () => {
    mount();
    loader.status.set({ ...status(), sensitive: true, spoiler_text: 'Warning' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Show video'))!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('allows explicit media opening in text mode without changing reading preferences', () => {
    images.set(false);
    mount();
    loader.status.set(status());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[])
      .find((button) => button.textContent?.includes('Show video'))!
      .click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
    expect(images()).toBe(false);
  });

  it('removes playback when the author becomes suppressed', () => {
    mount();
    loader.status.set(status());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
    blocked.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
  });

  describe('party chat wiring', () => {
    beforeEach(() => localStorage.clear());
    const party = () =>
      fixture.debugElement.query(By.directive(PartyStub)).componentInstance as PartyStub;

    it('shows the video post under the player, in compact and card views alike', () => {
      mount();
      loader.status.set(status());
      fixture.detectChanges();
      const card = () =>
        fixture.nativeElement.querySelector('.watch-stage .watch-root app-status-card');
      expect(card()).not.toBeNull();
      // The conversation column holds only the conversation.
      expect(fixture.nativeElement.querySelector('.watch-conversation app-status-card')).toBeNull();
      TestBed.inject(WatchPartyPrefs).setView('cards');
      fixture.detectChanges();
      expect(card()).not.toBeNull();
    });

    it('cues a bare YouTube video at ?t= and hands its ID to the conversation', () => {
      params.next(convertToParamMap({ youtube: 'abcdefghijk', t: '90' }));
      mount();
      const panel = fixture.debugElement.query(By.directive(PanelStub))
        .componentInstance as PanelStub;
      expect(panel.source()?.start).toBe(90);
      expect(panel.status()).toBeNull();
      expect(party().youtubeVideoId()).toBe('abcdefghijk');
      // An unusable cue is ignored rather than breaking the page.
      params.next(convertToParamMap({ youtube: 'abcdefghijk', t: 'soon' }));
      fixture.detectChanges();
      expect(panel.source()?.start).toBe(0);
    });

    it('adopts the share post a bare video party starts, without reloading the video', () => {
      params.next(convertToParamMap({ youtube: 'abcdefghijk' }));
      mount();
      expect(party().shareLink()).toBe('https://www.youtube.com/watch?v=abcdefghijk');
      expect(party().root()).toBeNull();
      const replace = vi.spyOn(TestBed.inject(Location), 'replaceState');
      const share = { id: '77', account: { id: 'me' } } as unknown as Status;
      party().started.emit(share);
      fixture.detectChanges();
      expect(party().root()).toBe(share);
      expect(party().canReply()).toBe(true);
      expect(replace).toHaveBeenCalledWith(
        '/watch',
        'youtube=abcdefghijk&post=77&server=https%3A%2F%2Fhome.test',
      );
      const reply = { id: '78', account: { id: 'friend' } } as unknown as Status;
      getContext.mockReturnValue(of({ ancestors: [], descendants: [reply] }));
      party().repliesDue.emit();
      fixture.detectChanges();
      expect(getContext).toHaveBeenCalledWith('77');
      expect(party().comments()).toEqual([reply]);
    });

    it('plays a PeerTube link from its instance, waiting like sensitive media when NSFW', async () => {
      const short = 'kkGMgK9ZtnKfYAgnEtQxbv';
      const video = (nsfw: boolean): PeerTubeVideo => ({
        title: 'Talk',
        channel: 'fsf@tube.example',
        channelName: 'FSF',
        sensitive: nsfw,
        live: false,
        playable: {
          kind: 'native',
          key: `peertube:tube.example/${short}`,
          url: 'https://tube.example/a.mp4',
          title: 'Talk',
        },
      });
      peertubeGet.mockResolvedValueOnce(video(false));
      params.next(convertToParamMap({ post: '1', server: 'https://home.test', peertube: short }));
      mount();
      loader.status.set({
        ...status(),
        media_attachments: [],
        content: `<p><a href="https://tube.example/w/${short}">talk</a></p>`,
      } as Status);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain(
        'Opening the PeerTube video',
      );
      await fixture.whenStable();
      fixture.detectChanges();
      expect(peertubeGet).toHaveBeenCalledWith(expect.objectContaining({ kind: 'peertube' }));
      expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
      const panel = fixture.debugElement.query(By.directive(PanelStub))
        .componentInstance as PanelStub;
      expect(panel.peertube()?.channel).toBe('fsf@tube.example');

      // An NSFW video (another one) is gated, as a sensitive post would be.
      const nsfw = 'aaaaaaaaaaaaaaaaaaaaaa';
      peertubeGet.mockResolvedValueOnce(video(true));
      params.next(convertToParamMap({ post: '2', server: 'https://home.test', peertube: nsfw }));
      loader.status.set({
        ...status(),
        id: '2',
        media_attachments: [],
        content: `<p><a href="https://tube.example/w/${nsfw}">talk</a></p>`,
      } as Status);
      fixture.detectChanges();
      await settle();
      expect(fixture.nativeElement.querySelector('video')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain(
        'This post has a content warning or sensitive media.',
      );
    });

    it('says so when a PeerTube server does not hand over the video', async () => {
      const short = 'kkGMgK9ZtnKfYAgnEtQxbv';
      peertubeGet.mockRejectedValueOnce(new Error('down'));
      params.next(convertToParamMap({ post: '1', server: 'https://home.test', peertube: short }));
      mount();
      loader.status.set({
        ...status(),
        media_attachments: [],
        content: `<p><a href="https://tube.example/w/${short}">talk</a></p>`,
      } as Status);
      fixture.detectChanges();
      await settle();
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
        "didn't hand over the video",
      );
      expect(fixture.nativeElement.querySelector('video')).toBeNull();
    });

    it('quotes a YouTube comment into the share sheet', () => {
      params.next(convertToParamMap({ youtube: 'abcdefghijk' }));
      mount();
      const panel = fixture.debugElement.query(By.directive(PanelStub))
        .componentInstance as PanelStub;
      const comment = { id: 'c', author: '@viewer', text: 'Great video' } as YoutubeComment;
      party().quoted.emit(comment);
      expect(panel.quote).toHaveBeenCalledWith(comment);
    });

    it('lets the chat reply only to a post on the signed-in server', () => {
      mount();
      loader.status.set(status());
      fixture.detectChanges();
      expect(party().canReply()).toBe(true);
      loader.isAnonymousPublic.set(true);
      fixture.detectChanges();
      expect(party().canReply()).toBe(false);
    });

    it('re-reads replies when the chat asks for them', () => {
      mount();
      loader.status.set(status());
      fixture.detectChanges();
      party().repliesDue.emit();
      expect(loader.refreshReplies).toHaveBeenCalledTimes(1);
    });
  });
});
