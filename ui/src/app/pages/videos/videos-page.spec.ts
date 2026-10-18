import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Auth } from '../../auth';
import { Compose } from '../../compose/compose';
import { RssReadState } from '../../providers/rss/rss-read-state';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideosPage } from './videos-page';
import { VideoSubscriptions } from '../../providers/videos/video-subscriptions';
import { YoutubeFeeds } from '../../providers/videos/youtube-feeds';
import { SupporterStatus } from '../../providers/account/supporter-status';
import { parseFeed } from '../../providers/rss/rss-parser';
import { VideoSubscriptionsPanel } from './video-subscriptions-panel';

const first = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
const second = 'UCLA_DiR1FfKNvjuUpBHmylQ';
const parsed = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title>
  <entry><id>older</id><title>Older</title><link href="https://youtube.com/watch?v=0KoeY54M5VA"/><published>2026-01-01T10:00:00Z</published></entry>
  <entry><id>newer</id><title>Newer</title><link href="https://youtube.com/watch?v=uMhdcq2rqUU"/><published>2026-01-02T10:00:00Z</published></entry>
</feed>`);
describe('Video feeds reader', () => {
  const dialogMethods = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );
  const youtube = { feed: vi.fn(), resolve: vi.fn(), search: vi.fn() };
  beforeEach(() => {
    for (const [name] of dialogMethods) {
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
    }
    localStorage.clear();
    youtube.feed.mockReset().mockResolvedValue(parsed);
    youtube.resolve.mockReset().mockResolvedValue({ id: first, title: 'Example' });
    youtube.search
      .mockReset()
      .mockResolvedValue([
        { id: second, title: 'Other channel', channelId: second, channelTitle: 'Other channel' },
      ]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'videos', component: VideosPage }]),
        { provide: YoutubeFeeds, useValue: youtube },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of dialogMethods) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
  });
  it('shows free subscriptions on the left and newest-first cards without loading embeds', async () => {
    TestBed.inject(VideoSubscriptions).add(first, 'Example');
    const fixture = TestBed.createComponent(VideosPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance['loading']()).toBe(false);
    });
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('aside app-video-subscriptions-panel')).not.toBeNull();
    expect(
      [...host.querySelectorAll('.video-post h3')].map((element) => element.textContent?.trim()),
    ).toEqual(['Newer', 'Older']);
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.querySelector('.search-box form')).toBeNull();
    await fixture.componentInstance['search']();
    expect(youtube.search).not.toHaveBeenCalled();
  });
  it('sorts feed cards, switches saved/main views and surfaces one original link plus Watch Party', async () => {
    TestBed.inject(VideoSubscriptions).add(first, 'Example');
    const fixture = TestBed.createComponent(VideosPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance['items']()).toHaveLength(2);
    });
    const page = fixture.componentInstance;
    page['sort'].set('oldest');
    fixture.detectChanges();
    expect(page['visible']().map((item) => item.title)).toEqual(['Older', 'Newer']);
    const item = page['visible']()[0];
    TestBed.inject(RssReadState).toggleStarred(item.id);
    page['mainFeed'](true);
    fixture.detectChanges();
    expect(page['visible']()).toHaveLength(1);
    const card: HTMLElement = fixture.nativeElement.querySelector('.video-post');
    expect(
      [...card.querySelectorAll('a')].filter((a) => a.textContent?.includes('Open on YouTube')),
    ).toHaveLength(1);
    expect(card.querySelector('a[href^="/watch?"]')?.getAttribute('href')).toBe(
      '/watch?youtube=0KoeY54M5VA',
    );
    page['results'].set([]);
    page['mainFeed']();
    expect(page['results']()).toBeNull();
    expect(page['visible']()).toHaveLength(2);
  });

  for (const bluesky of [false, true]) {
    it(`opens an editable mini composer for ${bluesky ? 'Bluesky' : 'Mastodon'} responses`, async () => {
      TestBed.inject(VideoSubscriptions).add(first, 'Technology Connections');
      vi.spyOn(TestBed.inject(BlueskySession), 'linked').mockReturnValue(bluesky);
      TestBed.inject(Auth).kind.set(bluesky ? 'bluesky' : 'mastodon');
      const fixture = TestBed.createComponent(VideosPage);
      fixture.detectChanges();
      await fixture.whenStable();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(fixture.componentInstance['items']()).toHaveLength(2);
      });
      const page = fixture.componentInstance;
      const item = { ...page['items']()[0], channelTitle: 'Technology Connections' };
      page['postResponse'](item);
      fixture.detectChanges();
      const composer = fixture.debugElement.query(By.directive(Compose))
        .componentInstance as Compose;
      expect(composer.initialText()).toContain('#TechnologyConnections');
      expect(composer.initialText()).toContain(item.title);
      expect(composer.initialText()).toContain(item.source.url);
      expect(composer.compact()).toBe(false);
      expect(fixture.nativeElement.querySelector('dialog').getAttribute('data-size')).toBe('wide');
      expect(composer.initialTarget()).toBe(bluesky ? 'bsky' : 'fedi');
      expect(composer.initialVisibility()).toBe('public');
      expect(composer.draftContext()).toBe('video-response:' + item.id);
      composer.posted.emit({} as never);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-compose')).toBeNull();
    });
  }

  it('lets Plus users search, subscribe a result and return to the RSS view', async () => {
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    const fixture = TestBed.createComponent(VideosPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.search-box form')).not.toBeNull();
    fixture.componentInstance['query'] = 'Other channel';
    fixture.componentInstance['searchType'] = 'channel';
    await fixture.componentInstance['search']();
    fixture.detectChanges();
    expect(youtube.search).toHaveBeenCalledWith('Other channel', 'channel');
    const subscribe: HTMLButtonElement = fixture.nativeElement.querySelector('.video-post button');
    subscribe.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(VideoSubscriptions).has(second)).toBe(true);
    fixture.nativeElement.querySelector('aside nav > a').click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance['loading']()).toBe(false);
    });
    expect(fixture.nativeElement.querySelector('.video-post h3').textContent).toContain('Newer');
  });
  it('keeps healthy channels visible and failed subscriptions intact', async () => {
    const subs = TestBed.inject(VideoSubscriptions);
    subs.add(first, 'Healthy');
    subs.add(second, 'Unavailable');
    youtube.feed.mockImplementation((id: string) =>
      id === first ? Promise.resolve(parsed) : Promise.reject(new Error('404')),
    );
    const fixture = TestBed.createComponent(VideosPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance['loading']()).toBe(false);
    });
    expect(fixture.nativeElement.querySelectorAll('.video-post')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.feed-error').textContent).toContain('Unavailable');
    expect(subs.feeds()).toHaveLength(2);
  });
  it('supports subscribe and unsubscribe from the shared management panel', async () => {
    const fixture = TestBed.createComponent(VideosPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const form: HTMLFormElement = fixture.nativeElement.querySelector('aside form');
    const input: HTMLInputElement = form.querySelector('input')!;
    input.value = '@example';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(youtube.resolve).toHaveBeenCalledWith('@example');
    expect(TestBed.inject(VideoSubscriptions).has(first)).toBe(true);
    fixture.nativeElement.querySelector('aside .subscription button').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(VideoSubscriptions).feeds()).toHaveLength(0);
  });
  it('shows diagnostic details and retries the failed input without losing subscriptions', async () => {
    youtube.resolve.mockRejectedValueOnce(new Error('YouTube returned 404'));
    const fixture = TestBed.createComponent(VideosPage);
    fixture.detectChanges();
    const panel = fixture.debugElement.query(By.directive(VideoSubscriptionsPanel))
      .componentInstance as VideoSubscriptionsPanel;
    panel['channel'] = 'pdina';
    await panel['subscribe']();
    fixture.detectChanges();
    const dialog: HTMLElement = fixture.nativeElement.querySelector('mb-dialog');
    expect(dialog.textContent).toContain('YouTube returned 404');
    expect(dialog.querySelector('a')?.href).toBe('https://www.youtube.com/c/pdina');
    dialog.querySelector<HTMLButtonElement>('[mbDialogActions]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(youtube.resolve).toHaveBeenCalledTimes(2);
    expect(TestBed.inject(VideoSubscriptions).has(first)).toBe(true);
    expect(panel['failure']()).toBeNull();
  });
  it('ignores repeated subscribe clicks while a lookup is pending', async () => {
    let finish!: (value: { id: string; title: string }) => void;
    youtube.resolve.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const fixture = TestBed.createComponent(VideosPage);
    fixture.detectChanges();
    const panel = fixture.debugElement.query(By.directive(VideoSubscriptionsPanel))
      .componentInstance as VideoSubscriptionsPanel;
    panel['channel'] = 'pdina';
    const pending = panel['subscribe']();
    await panel['subscribe']();
    expect(youtube.resolve).toHaveBeenCalledTimes(1);
    expect(panel['busy']()).toBe(true);
    finish({ id: first, title: 'PDina' });
    await pending;
    expect(panel['busy']()).toBe(false);
  });
});
