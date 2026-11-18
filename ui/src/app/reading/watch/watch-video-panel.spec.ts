import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clock, shareText, shareUrl, WatchVideoPanel } from './watch-video-panel';
import { Compose } from '../../publishing/compose/compose';
import { YoutubeFeeds } from '../videos/youtube-feeds';
import { VideoSubscriptions } from '../videos/video-subscriptions';
import { VideoPostFinder } from '../videos/video-post-finder';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { Status } from '../../platform/api/models';
import { VideoSource } from '../video-player/media-source';
import { YoutubeVideoDetails } from '../videos/youtube-details';

@Component({ selector: 'app-compose', template: '' })
class ComposeStub {
  readonly compact = input(false);
  readonly draftContext = input('');
  readonly initialText = input('');
  readonly initialTarget = input('');
  readonly initialVisibility = input('');
  readonly posted = output<Status>();
}

const channelId = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
const source = (start = 0): VideoSource => ({
  kind: 'youtube',
  key: 'youtube:abcdefghijk',
  videoId: 'abcdefghijk',
  start,
  title: 'How lamps work',
  url: 'https://www.youtube.com/watch?v=abcdefghijk',
});

describe('share text helpers', () => {
  it('formats clocks, cue links and composer text', () => {
    expect(clock(65)).toBe('1:05');
    expect(clock(3723)).toBe('1:02:03');
    expect(shareUrl('abcdefghijk')).toBe('https://youtu.be/abcdefghijk');
    expect(shareUrl('abcdefghijk', 90)).toBe('https://youtu.be/abcdefghijk?t=90');
    expect(shareText({ title: 'Lamps', url: 'https://youtu.be/x', tag: 'Show' })).toBe(
      'Lamps\n\nhttps://youtu.be/x\n\n#Show',
    );
    expect(
      shareText({
        title: 'Lamps',
        url: 'https://youtu.be/x',
        quote: { text: ' So good ', attribution: '— @a, on YouTube' },
      }),
    ).toBe('“So good” — @a, on YouTube\n\nhttps://youtu.be/x');
  });
});

describe('WatchVideoPanel', () => {
  let fixture: ComponentFixture<WatchVideoPanel>;
  afterEach(() => fixture?.destroy());

  function mount(options: {
    native?: boolean;
    details?: Partial<YoutubeVideoDetails>;
    status?: Status | null;
    resolve?: YoutubeFeeds['resolve'];
    find?: VideoPostFinder['find'];
    start?: number;
  }) {
    const feeds = signal<{ id: string; title: string; enabled: boolean }[]>([]);
    const subs = {
      feeds,
      add: vi.fn((id: string, title: string) => feeds.set([{ id, title, enabled: true }])),
      remove: vi.fn(() => feeds.set([])),
    };
    const youtube = {
      canReadDetails: () => !!options.native,
      details: vi.fn(async () => ({
        id: 'abcdefghijk',
        title: 'How lamps work',
        channelId,
        channelTitle: 'Technology Connections',
        durationSeconds: 754,
        description: '',
        familySafe: true,
        live: false,
        chapters: [],
        ...options.details,
      })),
      resolve: options.resolve ?? vi.fn(),
    };
    const finder = { available: () => true, find: options.find ?? vi.fn(() => of([])) };
    TestBed.configureTestingModule({
      imports: [WatchVideoPanel],
      providers: [
        provideRouter([]),
        { provide: YoutubeFeeds, useValue: youtube },
        { provide: VideoSubscriptions, useValue: subs },
        { provide: VideoPostFinder, useValue: finder },
        { provide: Server, useValue: { baseUrl: signal('https://home.test') } },
        { provide: Auth, useValue: { isBlueskyPrimary: false, isAnonymous: false } },
        { provide: BlueskySession, useValue: { linked: () => false } },
      ],
    });
    TestBed.overrideComponent(WatchVideoPanel, {
      remove: { imports: [Compose] },
      add: { imports: [ComposeStub] },
    });
    fixture = TestBed.createComponent(WatchVideoPanel);
    fixture.componentRef.setInput('source', source(options.start));
    fixture.componentRef.setInput('status', options.status ?? null);
    fixture.detectChanges();
    return { subs, youtube, finder };
  }

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (label: string) =>
    [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLElement) =>
      b.textContent?.includes(label),
    ) as HTMLButtonElement | undefined;
  const text = () => fixture.nativeElement.textContent as string;

  it('on Native, subscribes to the channel from the video details and shows chapters', async () => {
    const { subs } = mount({
      native: true,
      details: {
        familySafe: false,
        chapters: [
          { seconds: 0, title: 'Intro' },
          { seconds: 90, title: 'Middle' },
          { seconds: 605, title: 'End' },
        ],
      },
    });
    await settle();
    button('Subscribe to Technology Connections')!.click();
    fixture.detectChanges();
    expect(subs.add).toHaveBeenCalledWith(channelId, 'Technology Connections');
    expect(button('Subscribed to Technology Connections')).toBeDefined();
    expect(text()).toContain('Length 12:34');
    expect(text()).toContain('not suitable for all ages');
    const cue = [...fixture.nativeElement.querySelectorAll('.chapters a')].map(
      (a: HTMLAnchorElement) => a.getAttribute('href'),
    );
    expect(cue[1]).toContain('t=90');
  });

  it('on the web, resolves the channel from the post’s link card when asked', async () => {
    const resolve = vi.fn(async () => ({ id: channelId, title: 'TC' }));
    const status = {
      id: '1',
      url: 'https://home.test/@a/1',
      card: {
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        author_name: 'Technology Connections',
        author_url: 'https://www.youtube.com/@TechnologyConnections',
      },
    } as unknown as Status;
    const { subs } = mount({ status, resolve });
    expect(button('About')).toBeUndefined();
    button('Subscribe to Technology Connections')!.click();
    await settle();
    expect(resolve).toHaveBeenCalledWith('https://www.youtube.com/@TechnologyConnections');
    expect(subs.add).toHaveBeenCalledWith(channelId, 'Technology Connections');
  });

  it('offers no Subscribe when nothing names the channel', () => {
    mount({});
    expect(button('Subscribe')).toBeUndefined();
  });

  it('finds posts sharing a bare video and links to watching with their replies', async () => {
    const post = {
      id: '7',
      url: 'https://home.test/@kat/7',
      content: '<p>Look</p>',
      account: { id: 'k', username: 'kat', acct: 'kat', display_name: 'Kat' },
    } as unknown as Status;
    const find = vi.fn(() => of([post]));
    mount({ find });
    button('Find posts about this video')!.click();
    await settle();
    expect(find).toHaveBeenCalledWith('abcdefghijk');
    const link = fixture.nativeElement.querySelector('.found a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('post=7');
    expect(link.getAttribute('href')).toContain('youtube=abcdefghijk');
  });

  it('does not offer Find posts when the video already has its post', () => {
    mount({ status: { id: '1', url: 'https://home.test/@a/1' } as Status });
    expect(button('Find posts')).toBeUndefined();
  });

  it('shares the video at its cue with the party tag, and quotes YouTube comments', () => {
    mount({ start: 90 });
    fixture.componentRef.setInput('partyTag', 'Show');
    button('Share')!.click();
    fixture.detectChanges();
    const compose = () =>
      fixture.debugElement.query((el) => el.name === 'app-compose')?.componentInstance as
        ComposeStub | undefined;
    expect(compose()!.initialText()).toBe(
      'How lamps work\n\nhttps://youtu.be/abcdefghijk?t=90\n\n#Show',
    );
    fixture.componentInstance.quote({
      id: 'c',
      author: '@viewer',
      published: '',
      likes: '',
      text: 'So good',
      replies: '',
      byCreator: false,
    });
    fixture.detectChanges();
    expect(compose()!.initialText()).toContain('“So good” — @viewer, on YouTube');
  });
});
