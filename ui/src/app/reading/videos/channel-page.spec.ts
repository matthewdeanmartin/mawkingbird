import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelPage } from './channel-page';
import { YoutubeFeeds } from './youtube-feeds';
import { VideoSubscriptions } from './video-subscriptions';
import { CreatorLink, CreatorLinks } from './creator-links';
import { FollowButton } from '../../accounts/follow-button/follow-button';
import { Account } from '../../platform/api/models';
import { parseFeed } from '../../../lib/rss/rss-parser';
import { YoutubeChannelInfo } from './youtube-details';

@Component({
  selector: 'app-follow-button',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: 'follow',
})
class FollowStub {
  readonly accountId = input('');
  readonly handle = input('');
  readonly foreign = input<Account | null>(null);
}

const id = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
const rss = parseFeed(
  `<feed xmlns="http://www.w3.org/2005/Atom"><title>Technology Connections</title>` +
    `<entry><title>Lamps</title><link href="https://www.youtube.com/watch?v=aaaaaaaaaaa"/><published>2026-11-01T00:00:00Z</published></entry>` +
    `<entry><title>Switches</title><link href="https://www.youtube.com/watch?v=bbbbbbbbbbb"/><published>2026-10-01T00:00:00Z</published></entry></feed>`,
);

describe('ChannelPage', () => {
  let fixture: ComponentFixture<ChannelPage>;
  afterEach(() => fixture?.destroy());

  function mount(options: {
    channelId?: string;
    native?: YoutubeChannelInfo | null;
    creator?: CreatorLink | null;
    feedFails?: boolean;
  }) {
    const feeds = signal<{ id: string; title: string; enabled: boolean }[]>([]);
    const subs = {
      feeds,
      add: vi.fn((cid: string, title: string) => feeds.set([{ id: cid, title, enabled: true }])),
      remove: vi.fn(() => feeds.set([])),
    };
    const youtube = {
      feed: vi.fn(async () => {
        if (options.feedFails) throw new Error('down');
        return rss;
      }),
      canReadDetails: () => options.native !== undefined,
      channel: vi.fn(async () => {
        if (!options.native) throw new Error('blocked');
        return options.native;
      }),
    };
    const creators = { forChannel: vi.fn(async () => options.creator ?? null) };
    TestBed.configureTestingModule({
      imports: [ChannelPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(
              convertToParamMap({ channelId: options.channelId ?? id }),
            ),
          },
        },
        { provide: YoutubeFeeds, useValue: youtube },
        { provide: VideoSubscriptions, useValue: subs },
        { provide: CreatorLinks, useValue: creators },
      ],
    });
    TestBed.overrideComponent(ChannelPage, {
      remove: { imports: [FollowButton] },
      add: { imports: [FollowStub] },
    });
    fixture = TestBed.createComponent(ChannelPage);
    fixture.detectChanges();
    return { subs, youtube, creators };
  }

  const settle = async () => {
    // The page chains plain promises (feed, then the creator lookup): let each settle.
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };
  const text = () => fixture.nativeElement.textContent as string;
  const watchLinks = () =>
    [...fixture.nativeElement.querySelectorAll('.uploads a.name')].map((a: HTMLAnchorElement) =>
      a.getAttribute('href'),
    );

  it('shows a channel’s uploads from its feed to anyone, and subscribes to it', async () => {
    const { subs, creators } = mount({});
    await settle();
    expect(text()).toContain('Technology Connections');
    expect(watchLinks()).toEqual(['/watch?youtube=aaaaaaaaaaa', '/watch?youtube=bbbbbbbbbbb']);
    expect(creators.forChannel).toHaveBeenCalledWith({ id, handle: null, links: [] });
    expect(text()).toContain('No Mastodon account is linked to this channel yet.');
    const subscribe = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLElement) => b.textContent?.trim() === 'Subscribe',
    ) as HTMLButtonElement;
    subscribe.click();
    fixture.detectChanges();
    expect(subs.add).toHaveBeenCalledWith(id, 'Technology Connections');
    expect(text()).toContain('Subscribed');
  });

  it('on Native adds the handle, About links and older uploads, and finds the creator', async () => {
    const more = vi.fn(async () => ({
      videos: [
        { videoId: 'ccccccccccc', title: 'Older', age: '3 years ago', views: '', duration: '9:00' },
      ],
      more: null,
    }));
    const { creators } = mount({
      native: {
        id,
        title: 'Technology Connections',
        handle: '@TechnologyConnections',
        description: '',
        subscribers: '2.4M subscribers',
        links: [{ title: 'Mastodon', url: 'https://mas.to/@TechConnectify' }],
        uploads: {
          videos: [
            {
              videoId: 'aaaaaaaaaaa',
              title: 'Lamps',
              age: '2 weeks ago',
              views: '1M views',
              duration: '23:01',
            },
          ],
          more,
        },
      },
      creator: {
        acct: 'TechConnectify@mas.to',
        sources: ['channel', 'wikidata'],
        confirmed: false,
        account: { id: '9', acct: 'TechConnectify', display_name: 'Alec' } as Account,
      },
    });
    await settle();
    expect(text()).toContain('@TechnologyConnections · 2.4M subscribers');
    expect(text()).toContain('23:01');
    expect(creators.forChannel).toHaveBeenCalledWith({
      id,
      handle: '@TechnologyConnections',
      links: [{ title: 'Mastodon', url: 'https://mas.to/@TechConnectify' }],
    });
    expect(text()).toContain('Linked from their YouTube channel and listed on Wikidata.');
    expect(text()).toContain("so check it's really them");
    const follow = fixture.debugElement.query((el) => el.name === 'app-follow-button')
      .componentInstance as FollowStub;
    expect(follow.foreign()).toMatchObject({
      acct: 'TechConnectify@mas.to',
      username: 'TechConnectify',
    });

    (
      [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLElement) =>
        b.textContent?.includes('Older videos'),
      ) as HTMLButtonElement
    ).click();
    await settle();
    expect(watchLinks()).toEqual(['/watch?youtube=aaaaaaaaaaa', '/watch?youtube=ccccccccccc']);
  });

  it('says plainly when a profile links back', async () => {
    mount({
      creator: { acct: 'a@b.example', sources: ['wikidata'], confirmed: true, account: null },
    });
    await settle();
    expect(text()).toContain('Linked both ways');
    expect(text()).not.toContain('check it');
  });

  it('rejects a link that is not a channel ID, asking nothing', async () => {
    const { youtube, creators } = mount({ channelId: 'not-a-channel' });
    await settle();
    expect(text()).toContain("This isn't a YouTube channel link.");
    expect(youtube.feed).not.toHaveBeenCalled();
    expect(creators.forChannel).not.toHaveBeenCalled();
  });

  it('reports a channel whose videos could not be loaded', async () => {
    mount({ feedFails: true });
    await settle();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load this channel's videos.",
    );
  });
});
