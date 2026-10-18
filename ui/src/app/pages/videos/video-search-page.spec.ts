import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VIDEO_SEARCH_PREFIX, VideoSearchPage, withoutSiteOperators } from './video-search-page';

describe('withoutSiteOperators', () => {
  it('drops site: and -site: operators for searches that cannot use them', () => {
    expect(withoutSiteOperators('site:youtube.com cats')).toBe('cats');
    expect(withoutSiteOperators('cats -site:tiktok.com  dogs')).toBe('cats dogs');
    expect(withoutSiteOperators(VIDEO_SEARCH_PREFIX)).toBe('');
  });
});

describe('VideoSearchPage', () => {
  let fixture: ComponentFixture<VideoSearchPage>;
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    open = vi.fn();
    vi.stubGlobal('open', open);
    TestBed.configureTestingModule({
      imports: [VideoSearchPage],
      providers: [provideRouter([])],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function mount(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(VideoSearchPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function type(host: HTMLElement, value: string): void {
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('starts prefilled for YouTube on Google and waits for something to search', async () => {
    const host = await mount();
    expect((host.querySelector('input') as HTMLInputElement).value).toBe(VIDEO_SEARCH_PREFIX);
    expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('hands the search to Google in a new tab and keeps it in the URL', async () => {
    const host = await mount();
    type(host, 'site:youtube.com tape machines');
    (host.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(open).toHaveBeenCalledWith(
      'https://www.google.com/search?q=site%3Ayoutube.com%20tape%20machines',
      '_blank',
      'noopener',
    );
    expect(TestBed.inject(Router).url).toBe('/?q=site:youtube.com%20tape%20machines');
  });

  it('offers the same words to the regular post search, without site:', async () => {
    const host = await mount();
    type(host, 'site:youtube.com tape machines');
    const posts = [...host.querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Search posts'),
    )!;
    expect(posts.getAttribute('href')).toBe('/search?q=tape%20machines');
  });

  it('restores a search from the URL', async () => {
    await TestBed.inject(Router).navigate([], { queryParams: { q: 'site:vimeo.com jazz' } });
    const host = await mount();
    expect((host.querySelector('input') as HTMLInputElement).value).toBe('site:vimeo.com jazz');
  });
});
