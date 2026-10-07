import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Watch } from './watch';
import { PartyConversation } from './party-conversation';
import { ThreadLoader } from '../read/thread-loader';
import { StatusCard } from '../../status-card/status-card';
import { Status } from '../../models';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { ClientPrefs } from '../../client-prefs';
import { StatusVisibility } from '../../status-visibility';
import { TrustedAccounts } from '../../trusted-accounts';
import { FollowTrust } from '../../follow-trust';
import { ReadingZen } from '../../reading-zen';

@Component({ selector: 'app-status-card', template: '' })
class CardStub {
  readonly status = input<Status>();
  readonly showMedia = input(true);
  readonly partyTagsEnabled = input(false);
  readonly partyTagAdded = output<string>();
  readonly filterContext = input('thread');
  readonly changed = output<Status>();
  readonly deleted = output<Status>();
  readonly replied = output<Status>();
}

@Component({ selector: 'app-party-conversation', template: '' })
class PartyStub {
  readonly root = input<Status | null>(null);
  readonly comments = input<Status[]>([]);
  readonly session = input('');
  readonly changed = output<Status>();
  readonly deleted = output<Status>();
  readonly replied = output<Status>();
}

describe('Watch post access and reveal gates', () => {
  let fixture: ComponentFixture<Watch>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let loader: {
    status: ReturnType<typeof signal<Status | null>>;
    descendants: ReturnType<typeof signal<Status[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    loadError: ReturnType<typeof signal<string | null>>;
    publicContextUnavailable: ReturnType<typeof signal<boolean>>;
    load: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  let blocked: ReturnType<typeof signal<boolean>>;
  let images: ReturnType<typeof signal<boolean>>;
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
      publicContextUnavailable: signal(false),
      load: vi.fn(),
      destroy: vi.fn(),
    };
    blocked = signal(false);
    images = signal(true);
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
        { provide: ClientPrefs, useValue: { showImages: images, feedReader: signal(false) } },
        {
          provide: StatusVisibility,
          useValue: { rendersNothing: () => blocked(), activeFilters: () => [] },
        },
        {
          provide: TrustedAccounts,
          useValue: { entries: signal({}), cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
      ],
    });
    TestBed.overrideComponent(Watch, {
      remove: { imports: [StatusCard, PartyConversation], providers: [ThreadLoader] },
      add: {
        imports: [CardStub, PartyStub],
        providers: [{ provide: ThreadLoader, useValue: loader }],
      },
    });
  });
  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  function mount(): void {
    fixture = TestBed.createComponent(Watch);
    fixture.detectChanges();
  }

  it('holds the full viewport while open and releases the app chrome on leaving', () => {
    const zen = TestBed.inject(ReadingZen);
    mount();
    expect(zen.active()).toBe(true);
    expect(zen.chromeHidden()).toBe(true);
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

  it('refuses a server-local ID for another server without issuing a post request', () => {
    params.next(
      convertToParamMap({ post: '1', attachment: 'v1', server: 'https://elsewhere.test' }),
    );
    mount();
    expect(loader.load).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      'Switch to the server',
    );
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
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
});
