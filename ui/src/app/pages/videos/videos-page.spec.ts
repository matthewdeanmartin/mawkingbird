import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideosPage } from './videos-page';
import { VideoSubscriptions } from '../../providers/videos/video-subscriptions';
import { YoutubeFeeds } from '../../providers/videos/youtube-feeds';
import { SupporterStatus } from '../../providers/account/supporter-status';
import { parseFeed } from '../../providers/rss/rss-parser';

const first = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
const second = 'UCLA_DiR1FfKNvjuUpBHmylQ';
const parsed = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title>
  <entry><id>older</id><title>Older</title><link href="https://youtube.com/watch?v=0KoeY54M5VA"/><published>2026-01-01T10:00:00Z</published></entry>
  <entry><id>newer</id><title>Newer</title><link href="https://youtube.com/watch?v=uMhdcq2rqUU"/><published>2026-01-02T10:00:00Z</published></entry>
</feed>`);
describe('Video feeds reader', () => {
  const youtube = { feed: vi.fn(), resolve: vi.fn(), search: vi.fn() };
  beforeEach(() => {
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
});
