import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalPlayerHost } from '../../audio-embeds/external-player-host';
import { Auth } from '../../auth';
import { ClientPrefs } from '../../client-prefs';
import { FollowTrust } from '../../follow-trust';
import { ExternalMedia } from '../../audio-embeds/providers';
import { Status } from '../../models';
import { Server } from '../../server';
import { StatusCard } from '../../status-card/status-card';
import { StatusVisibility } from '../../status-visibility';
import { TrustedAccounts } from '../../trusted-accounts';
import { Playback } from '../../video-player/playback';
import { ThreadLoader } from '../read/thread-loader';
import { ListenPage } from './listen-page';
import { RADIO_AUDIO, RadioPlayer } from './radio-player';

@Component({ selector: 'app-status-card', template: '{{ status()?.id }}' })
class CardStub {
  readonly status = input<Status>();
  readonly showMedia = input(true);
  readonly filterContext = input('thread');
  readonly changed = output<Status>();
  readonly deleted = output<Status>();
  readonly replied = output<Status>();
}
@Component({ selector: 'app-external-player', template: '{{ source().label }}' })
class ExternalStub {
  readonly source = input.required<ExternalMedia>();
}

describe('ListenPage', () => {
  let fixture: ComponentFixture<ListenPage>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let loader: Record<string, unknown> & {
    status: ReturnType<typeof signal<Status | null>>;
    descendants: ReturnType<typeof signal<Status[]>>;
  };
  let warned: boolean;
  const recording = (extra: Partial<Status> = {}): Status =>
    ({
      id: '7',
      url: 'https://home.test/@host/7',
      visibility: 'public',
      content: '<p>Episode 12: the sea</p>',
      spoiler_text: '',
      sensitive: false,
      account: { id: 'host', acct: 'host', display_name: 'Podcast host' },
      media_attachments: [
        {
          id: 'ep',
          type: 'audio',
          url: 'https://media.test/ep.mp3',
          preview_url: '',
          description: '',
        },
      ],
      ...extra,
    }) as Status;

  beforeEach(() => {
    localStorage.clear();
    warned = false;
    params = new BehaviorSubject(convertToParamMap({ post: '7', server: 'https://home.test' }));
    loader = {
      status: signal<Status | null>(null),
      descendants: signal<Status[]>([]),
      loading: signal(false),
      loadError: signal<string | null>(null),
      publicContextUnavailable: signal(false),
      load: vi.fn(),
      destroy: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: Auth, useValue: { kind: signal('mastodon'), token: signal('token') } },
        { provide: Server, useValue: { baseUrl: signal('https://home.test') } },
        { provide: ClientPrefs, useValue: { showImages: signal(true), feedReader: signal(false) } },
        {
          provide: StatusVisibility,
          useValue: { rendersNothing: () => false, activeFilters: () => [] },
        },
        {
          provide: TrustedAccounts,
          useValue: { entries: signal({}), cwExpanded: () => !warned, sensitiveShown: () => true },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        {
          provide: RADIO_AUDIO,
          useValue: () => {
            const audio = document.createElement('audio');
            Object.defineProperty(audio, 'duration', { value: 1800 });
            vi.spyOn(audio, 'play').mockImplementation(async () => {
              audio.dispatchEvent(new Event('playing'));
            });
            vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
            vi.spyOn(audio, 'load').mockImplementation(() => undefined);
            return audio;
          },
        },
      ],
    });
    TestBed.overrideComponent(ListenPage, {
      remove: { imports: [StatusCard, ExternalPlayerHost], providers: [ThreadLoader] },
      add: {
        imports: [CardStub, ExternalStub],
        providers: [{ provide: ThreadLoader, useValue: loader }],
      },
    });
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.inject(RadioPlayer).stop();
  });

  function mount(status: Status | null = recording()): HTMLElement {
    fixture = TestBed.createComponent(ListenPage);
    fixture.detectChanges();
    loader.status.set(status);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const button = (root: HTMLElement, text: string) =>
    Array.from(root.querySelectorAll('button')).find((item) =>
      item.textContent?.trim().startsWith(text),
    ) as HTMLButtonElement;

  it('loads the post, plays through Radio and takes over from the dock while playing', () => {
    const root = mount();
    expect(loader['load']).toHaveBeenCalledWith('7');
    expect(root.querySelector('h2')?.textContent).toContain('Episode 12: the sea');
    const player = TestBed.inject(RadioPlayer);
    button(root, 'Play').click();
    fixture.detectChanges();
    expect(player.current()?.media.id).toBe('ep');
    expect(player.dockSuppressed()).toBe(true);
    // A long recording gets skip controls.
    (player.duration as ReturnType<typeof signal<number>>).set(1800);
    fixture.detectChanges();
    expect(root.querySelector('[aria-label="Forward 30 seconds"]')).toBeTruthy();
    fixture.destroy();
    expect(player.dockSuppressed()).toBe(false);
    expect(player.active()).toBe(true);
  });

  it('offers to resume a long recording where listening stopped', () => {
    const player = TestBed.inject(RadioPlayer);
    player.positions.set(new Map([['7:ep', { time: 754, duration: 1800, at: 1 }]]));
    const root = mount();
    expect(root.textContent).toContain('Resume from 12:34');
    expect(button(root, 'Start from the beginning')).toBeTruthy();
  });

  it('keeps a content warning in front of the recording until revealed', () => {
    warned = true;
    const root = mount(recording({ spoiler_text: 'Loud' }));
    expect(root.textContent).toContain('Loud');
    expect(button(root, 'Play')).toBeUndefined();
    button(root, 'Show recording').click();
    fixture.detectChanges();
    expect(button(root, 'Play')).toBeTruthy();
  });

  it('shows inline-only providers and indents the conversation', () => {
    const root = mount(
      recording({
        media_attachments: [],
        content: '<a href="https://www.deezer.com/track/3135556">Deezer</a>',
      }),
    );
    expect(root.querySelector('app-external-player')?.textContent).toContain('Deezer');
    expect(root.textContent).toContain('they stop when you leave this page');
    loader.descendants.set([
      { ...recording(), id: '8', in_reply_to_id: '7' },
      { ...recording(), id: '9', in_reply_to_id: '8' },
    ]);
    fixture.detectChanges();
    const depths = Array.from(root.querySelectorAll<HTMLElement>('.comment')).map((item) =>
      item.style.getPropertyValue('--depth'),
    );
    expect(depths).toEqual(['1', '2']);
  });

  it('refuses a server-local id from another server', () => {
    params.next(convertToParamMap({ post: '7', server: 'https://elsewhere.test' }));
    const root = mount(null);
    expect(root.textContent).toContain('Switch to the server this post belongs to');
    expect(loader['load']).not.toHaveBeenCalled();
  });
});
