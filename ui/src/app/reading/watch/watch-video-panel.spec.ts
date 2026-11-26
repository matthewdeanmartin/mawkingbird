import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
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
import { CreatorLink, CreatorLinks } from '../videos/creator-links';
import { SponsorBlock, SponsorSegments } from '../videos/sponsor-block';

@Component({
  selector: 'app-compose',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
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
    creator?: CreatorLink | null;
    creatorByName?: CreatorLink | null;
    sponsor?: SponsorSegments;
  }) {
    const sponsorBlock = {
      segments: vi.fn(async () => options.sponsor ?? { segments: [], duration: null }),
    };
    const creators = {
      lookupChannel: vi.fn(async () => options.creator ?? null),
      lookupName: vi.fn(async () => options.creatorByName ?? null),
    };
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
        chapterSource: null,
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
        { provide: CreatorLinks, useValue: creators },
        { provide: SponsorBlock, useValue: sponsorBlock },
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
    return { subs, youtube, finder, creators };
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
      start: 120,
      details: {
        chapterSource: 'auto',
        familySafe: false,
        chapters: [
          { seconds: 0, title: 'Intro' },
          { seconds: 90, title: 'Middle' },
          { seconds: 605, title: 'End' },
        ],
      },
    });
    await settle();
    button('Subscribe (RSS)')!.click();
    fixture.detectChanges();
    expect(subs.add).toHaveBeenCalledWith(channelId, 'Technology Connections');
    expect(button('Subscribed (RSS)')).toBeDefined();
    expect(text()).toContain('Length 12:34');
    expect(text()).toContain('not suitable for all ages');
    // Chapters show without opening anything, say where they came from, and
    // mark the chapter the player is cued in.
    const section = fixture.nativeElement.querySelector('section.chapters') as HTMLElement;
    expect(section.closest('mb-disclosure')).toBeNull();
    expect(section.textContent).toContain('Chapters (3)');
    expect(section.textContent).toContain('made automatically by YouTube');
    expect(section.querySelector('[aria-current="true"]')?.textContent).toContain('Middle');
    // Once the player reports its time, that decides the current chapter.
    fixture.componentRef.setInput('playhead', 700);
    fixture.detectChanges();
    expect(section.querySelector('[aria-current="true"]')?.textContent).toContain('End');
  });

  it('seeks the loaded player from a chapter, else cues the video there', async () => {
    mount({
      native: true,
      details: {
        chapterSource: 'creator',
        chapters: [
          { seconds: 0, title: 'Intro' },
          { seconds: 90, title: 'Middle' },
          { seconds: 605, title: 'End' },
        ],
      },
    });
    await settle();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const chapter = (title: string) =>
      [...fixture.nativeElement.querySelectorAll('button.chapter')].find((b: HTMLElement) =>
        b.textContent?.includes(title),
      ) as HTMLButtonElement;

    const seeker = vi.fn(() => true);
    fixture.componentRef.setInput('seeker', seeker);
    fixture.detectChanges();
    chapter('Middle').click();
    expect(seeker).toHaveBeenCalledWith(90);
    expect(navigate).not.toHaveBeenCalled();

    seeker.mockReturnValue(false);
    chapter('End').click();
    expect(navigate).toHaveBeenCalledWith(['/watch'], {
      queryParams: { t: 605 },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('marks SponsorBlock segments and offers Skip only while one plays, never skipping alone', async () => {
    mount({
      sponsor: {
        segments: [{ start: 90, end: 120, category: 'sponsor' }],
        duration: 600,
      },
    });
    await settle();
    const seeker = vi.fn(() => true);
    fixture.componentRef.setInput('seeker', seeker);
    fixture.detectChanges();
    const segment = fixture.nativeElement.querySelector('.strip .segment') as HTMLElement;
    expect(segment.style.left).toBe('15%');
    expect(segment.style.width).toBe('5%');
    expect(text()).toContain('SponsorBlock: 1 part to skip.');
    expect(button('Skip')).toBeUndefined();

    fixture.componentRef.setInput('playhead', 95);
    fixture.detectChanges();
    expect(seeker).not.toHaveBeenCalled();
    button('Skip sponsor (0:30)')!.click();
    expect(seeker).toHaveBeenCalledWith(120);
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
    button('Subscribe (RSS)')!.click();
    await settle();
    expect(resolve).toHaveBeenCalledWith('https://www.youtube.com/@TechnologyConnections');
    expect(subs.add).toHaveBeenCalledWith(channelId, 'Technology Connections');
  });

  it('links the channel page and its creator’s profile once the channel is known', async () => {
    const { creators } = mount({
      native: true,
      creator: {
        acct: 'TechConnectify@mas.to',
        sources: ['channel'],
        confirmed: true,
        account: null,
      },
    });
    await settle();
    await settle();
    expect(creators.lookupChannel).toHaveBeenCalledWith(channelId);
    const creator = [...fixture.nativeElement.querySelectorAll('a')].find((a: HTMLElement) =>
      a.textContent?.includes('Creator:'),
    ) as HTMLAnchorElement;
    expect(creator.textContent?.trim()).toBe('Creator: @TechConnectify@mas.to');
    expect(creator.title).toContain('Their profile links this channel');
    expect(creator.getAttribute('href')).toContain('TechConnectify');
    const channel = [...fixture.nativeElement.querySelectorAll('a')].find(
      (a: HTMLElement) => a.textContent?.trim() === 'Channel',
    ) as HTMLAnchorElement;
    expect(channel.getAttribute('href')).toBe(`/videos/channel/${channelId}`);
  });

  it('likes and boosts through the post’s own card, and links whoever posted the video', async () => {
    mount({});
    const card = {
      display: {
        favourited: false,
        reblogged: false,
        account: { acct: 'fan@mas.to', display_name: 'A Fan :verified:' },
      } as unknown as Status,
      caps: { favourite: true },
      accountLink: ['/accounts', '9'],
      actionError: signal<string | null>(null),
      hasRepostControl: () => true,
      toggleFavourite: vi.fn(),
      openRepost: vi.fn(),
      promptSignIn: vi.fn(),
    };
    fixture.componentRef.setInput('post', card);
    fixture.detectChanges();

    button('Like')!.click();
    expect(card.toggleFavourite).toHaveBeenCalledOnce();
    button('Boost')!.click();
    expect(card.openRepost).toHaveBeenCalledOnce();
    const poster = [...fixture.nativeElement.querySelectorAll('a')].find((a: HTMLElement) =>
      a.textContent?.includes('Video posted by A Fan'),
    ) as HTMLAnchorElement;
    expect(poster.textContent?.trim()).toBe('Video posted by A Fan');
    expect(poster.getAttribute('href')).toBe('/accounts/9');

    // The card, with its own error line, is often off screen.
    card.actionError.set('Could not like this post.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not like this post.',
    );
  });

  it('offers neither Like nor a poster for a bare video', () => {
    mount({});
    expect(button('Like')).toBeUndefined();
    expect(fixture.nativeElement.textContent).not.toContain('Video posted by');
  });

  it('links YouTube’s own subscribe prompt and the video, with no YouTube script', async () => {
    mount({ native: true });
    await settle();
    const hrefs = [...fixture.nativeElement.querySelectorAll('a')].map((a: HTMLAnchorElement) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toContain(`https://www.youtube.com/channel/${channelId}?sub_confirmation=1`);
    expect(hrefs).toContain('https://www.youtube.com/watch?v=abcdefghijk');
    expect(fixture.nativeElement.querySelector('script, iframe')).toBeNull();
  });

  it('adds the video to the queue and takes it out again', () => {
    localStorage.clear();
    mount({});
    fixture.componentRef.setInput('entry', {
      key: 'youtube:abcdefghijk',
      title: 'How lamps work',
      params: { youtube: 'abcdefghijk' },
    });
    fixture.detectChanges();
    button('Add to queue')!.click();
    fixture.detectChanges();
    expect(button('In queue')!.getAttribute('aria-pressed')).toBe('true');
    button('In queue')!.click();
    fixture.detectChanges();
    expect(button('Add to queue')).toBeDefined();
  });

  const cardFor = (authorUrl: string) =>
    ({
      id: '1',
      url: 'https://home.test/@a/1',
      card: {
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        author_name: 'Technology Connections',
        author_url: authorUrl,
      },
    }) as unknown as Status;

  it('names the creator on the web from the channel’s name, and says it was by name', async () => {
    const { creators } = mount({
      status: cardFor('https://www.youtube.com/@TechnologyConnections'),
      creatorByName: {
        acct: 'TechConnectify@mas.to',
        sources: ['kitName'],
        confirmed: false,
        account: null,
      },
    });
    await settle();
    expect(creators.lookupName).toHaveBeenCalledWith('Technology Connections');
    expect(creators.lookupChannel).not.toHaveBeenCalled();
    const link = fixture.nativeElement.querySelector('a[title*="A channel of this name"]');
    expect(link?.textContent).toContain('@TechConnectify@mas.to');
  });

  it('reads the channel ID out of a /channel/ link, with no request to resolve it', async () => {
    const { creators, youtube } = mount({
      status: cardFor(`https://www.youtube.com/channel/${channelId}`),
    });
    await settle();
    expect(creators.lookupChannel).toHaveBeenCalledWith(channelId);
    expect(youtube.resolve).not.toHaveBeenCalled();
  });

  it('says so once when whoever posted the video is its creator', async () => {
    mount({
      native: true,
      creator: { acct: 'Fan@mas.to', sources: ['kit'], confirmed: false, account: null },
    });
    fixture.componentRef.setInput('post', {
      display: {
        account: { acct: 'fan@mas.to', display_name: 'Kat', url: 'https://mas.to/@fan' },
      } as unknown as Status,
      caps: { favourite: false },
      accountLink: ['/accounts', '9'],
      actionError: () => null,
      hasRepostControl: () => false,
    });
    await settle();
    await settle();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Video posted by its creator, Kat');
    expect(text).not.toContain('Creator:');
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
