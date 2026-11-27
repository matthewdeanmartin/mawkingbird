import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { Status } from '../../platform/api/models';
import { SupporterStatus } from '../../accounts/mawkingbird/supporter-status';
import { VideoSearch } from './video-search';
import { YoutubeFeeds } from './youtube-feeds';
import { StatusCard } from '../../posts/status-card/status-card';
import { VideoPlayer } from '../video-player/video-player';
import { AppModeService } from '../../platform/build/app-mode';
import { VideoSearchPage } from './video-search-page';

@Component({
  selector: 'app-status-card',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<p class="card">{{ status().id }}</p>',
})
class CardStub {
  readonly status = input.required<Status>();
}

@Component({
  selector: 'app-video-player-controls',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class PlayerStub {
  readonly source = input<unknown>();
  readonly inline = input(false);
  readonly showLinks = input(true);
  readonly showTitle = input(true);
}

describe('VideoSearchPage', () => {
  let fixture: ComponentFixture<VideoSearchPage>;
  let posts: ReturnType<typeof vi.fn>;
  let youtube: { canSearch: () => boolean; search: ReturnType<typeof vi.fn> };
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    open = vi.fn();
    vi.stubGlobal('open', open);
    posts = vi.fn(() => of([{ id: 'p1' } as Status]));
    youtube = {
      // The web rule: YouTube search needs Plus (Native is covered in youtube-feeds.spec).
      canSearch: () => TestBed.inject(SupporterStatus).isSupporter(),
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

  async function mount(q?: string, side?: 'fedi' | 'youtube'): Promise<HTMLElement> {
    if (q) await TestBed.inject(Router).navigate([], { queryParams: { q, in: side } });
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

  it('shows fediverse results alone, with a way to the YouTube ones', async () => {
    const host = await mount('tape');
    expect(posts).toHaveBeenCalledWith('tape');
    expect(host.querySelector('.card')?.textContent).toBe('p1');
    expect(youtube.search).not.toHaveBeenCalled();
    expect(host.querySelector('.video-result')).toBeNull();
    expect(host.textContent).not.toContain('Install Mawkingbird Native');
    const other = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Search YouTube for “tape” instead'),
    )!;
    other.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/?q=tape&in=youtube');
  });

  it('gives the YouTube side to the app on the web, saying so where the results go', async () => {
    const host = await mount('tape', 'youtube');
    expect(posts).not.toHaveBeenCalled();
    expect(youtube.search).not.toHaveBeenCalled();
    expect(host.querySelector('.card')).toBeNull();
    expect(host.textContent).toContain('Search YouTube from the Mawkingbird app');
    expect(host.textContent).not.toContain('Plus');
    const install = [...host.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Install Mawkingbird Native'),
    )!;
    expect(install.getAttribute('href')).toBe('/settings/app');
  });

  it('searches YouTube for Plus subscribers, with Watch links', async () => {
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    const host = await mount('site:youtube.com tape', 'youtube');
    expect(posts).not.toHaveBeenCalled();
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
    expect(TestBed.inject(Router).url).toBe('/?q=new&in=fedi');
    slow.next([{ id: 'stale' } as Status]);
    fixture.detectChanges();
    expect(host.querySelector('.card')?.textContent).toBe('p1');
  });

  it('searches YouTube from its own box', async () => {
    const host = await mount('tape');
    const box = host.querySelector('input[name="youtubeQ"]') as HTMLInputElement;
    box.value = 'cats';
    box.dispatchEvent(new Event('input'));
    (box.form as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/?q=cats&in=youtube');
  });

  it('opens on the side of the video app you are in, until ?in= says otherwise', async () => {
    await TestBed.inject(Router).navigate([], { queryParams: { q: 'tape' } });
    // After navigating: the test URL is `/`, which would read as Fedi.
    TestBed.inject(AppModeService).set('video');
    await mount();
    expect(posts).not.toHaveBeenCalled();
    await TestBed.inject(Router).navigate([], { queryParams: { q: 'tape', in: 'fedi' } });
    await fixture.whenStable();
    expect(posts).toHaveBeenCalledWith('tape');
  });

  it('lists Google and all-post search as hand-offs under Search elsewhere, without site: for posts', async () => {
    const host = await mount('site:youtube.com tape machines');
    const elsewhere = host.querySelector('nav.elsewhere')!;
    expect(elsewhere.querySelector('h2')?.textContent).toContain('Search elsewhere');
    const all = [...elsewhere.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('All posts, not only ones with video'),
    )!;
    expect(all.getAttribute('href')).toBe('/search?q=tape%20machines');
    const google = [...elsewhere.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('YouTube, on Google'),
    )!;
    google.click();
    expect(open).toHaveBeenCalledWith(
      'https://www.google.com/search?q=site%3Ayoutube.com%20tape%20machines',
      '_blank',
      'noopener',
    );
  });
});
