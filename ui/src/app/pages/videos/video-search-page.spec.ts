import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, input } from '@angular/core';
import { Status } from '../../models';
import { SupporterStatus } from '../../providers/account/supporter-status';
import { VideoSearch } from '../../providers/videos/video-search';
import { YoutubeFeeds } from '../../providers/videos/youtube-feeds';
import { StatusCard } from '../../status-card/status-card';
import { VideoPlayer } from '../../video-player/video-player';
import { VideoSearchPage } from './video-search-page';

@Component({ selector: 'app-status-card', template: '<p class="card">{{ status().id }}</p>' })
class CardStub {
  readonly status = input.required<Status>();
}

@Component({ selector: 'app-video-player-controls', template: '' })
class PlayerStub {
  readonly source = input<unknown>();
  readonly inline = input(false);
}

describe('VideoSearchPage', () => {
  let fixture: ComponentFixture<VideoSearchPage>;
  let posts: ReturnType<typeof vi.fn>;
  let youtube: { search: ReturnType<typeof vi.fn> };
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    open = vi.fn();
    vi.stubGlobal('open', open);
    posts = vi.fn(() => of([{ id: 'p1' } as Status]));
    youtube = {
      search: vi.fn(async () => [
        { id: 'y1', title: 'Tape', channelId: null, channelTitle: 'Ch', videoId: 'aaaaaaaaaaa' },
      ]),
    };
    TestBed.configureTestingModule({
      imports: [VideoSearchPage],
      providers: [
        provideRouter([]),
        { provide: VideoSearch, useValue: { posts, tagsFor: (q: string) => q.split(' ') } },
        { provide: YoutubeFeeds, useValue: youtube },
      ],
    });
    TestBed.overrideComponent(VideoSearchPage, {
      remove: { imports: [StatusCard, VideoPlayer] },
      add: { imports: [CardStub, PlayerStub] },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function mount(q?: string): Promise<HTMLElement> {
    if (q) await TestBed.inject(Router).navigate([], { queryParams: { q } });
    fixture = TestBed.createComponent(VideoSearchPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('waits for a query before searching anything', async () => {
    const host = await mount();
    expect(host.textContent).toContain('Search fediverse posts and YouTube for video');
    expect(posts).not.toHaveBeenCalled();
    expect(youtube.search).not.toHaveBeenCalled();
  });

  it('searches fediverse posts from ?q= and offers YouTube with Plus only', async () => {
    const host = await mount('tape');
    expect(posts).toHaveBeenCalledWith('tape');
    expect(host.querySelector('.card')?.textContent).toBe('p1');
    expect(youtube.search).not.toHaveBeenCalled();
    expect(host.textContent).toContain('YouTube search is included with Mawkingbird Plus');
  });

  it('searches YouTube for Plus subscribers, with Watch links', async () => {
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    const host = await mount('site:youtube.com tape');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('.video-result h3')?.textContent).toBe('Tape');
    });
    expect(youtube.search).toHaveBeenCalledWith('tape', 'video');
    expect(host.querySelector('.video-result a')?.getAttribute('href')).toBe(
      '/watch?youtube=aaaaaaaaaaa',
    );
  });

  it('puts a new search in the URL and ignores the answer to an older one', async () => {
    const slow = new Subject<Status[]>();
    posts.mockReturnValueOnce(slow);
    const host = await mount('old');
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = 'new';
    input.dispatchEvent(new Event('input'));
    (host.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/?q=new');
    slow.next([{ id: 'stale' } as Status]);
    fixture.detectChanges();
    expect(host.querySelector('.card')?.textContent).toBe('p1');
  });

  it('keeps Google and all-post search as hand-offs, without site: for posts', async () => {
    const host = await mount('site:youtube.com tape machines');
    const all = [...host.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Search all posts'),
    )!;
    expect(all.getAttribute('href')).toBe('/search?q=tape%20machines');
    const google = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Google'),
    )!;
    google.click();
    expect(open).toHaveBeenCalledWith(
      'https://www.google.com/search?q=site%3Ayoutube.com%20tape%20machines',
      '_blank',
      'noopener',
    );
  });
});
