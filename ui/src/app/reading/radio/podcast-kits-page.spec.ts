import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowState } from '../../accounts/follow-state';
import { parseAnonymousStatusRouteRef } from '../../accounts/anonymous/anonymous-route-ref';
import { Auth } from '../../platform/session/auth';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { PodcastIndex, PodcastKits, PodcastPack, podcastPackLanguage } from './podcast-kits';
import { PodcastKitsPage } from './podcast-kits-page';

const index: PodcastIndex = {
  version: 2,
  generatedAt: '2026-11-19',
  languages: { ca: 1, de: 1, en: 1 },
  packs: [
    {
      category: 'history',
      lang: 'ca',
      size: 1,
      path: 'ca/history.json',
      title: { en: 'History' },
      icon: '📜',
    },
    {
      category: 'technology',
      lang: 'de',
      size: 1,
      path: 'de/technology.json',
      title: { en: 'Technology' },
      icon: '💻',
    },
    {
      category: 'science',
      lang: 'en',
      size: 1,
      path: 'en/science.json',
      title: { en: 'Science' },
      icon: '🔬',
    },
  ],
};
const pack: PodcastPack = {
  version: 2,
  kind: 'podcasts',
  category: 'science',
  lang: 'en',
  title: { en: 'Science' },
  icon: '🔬',
  generatedAt: '2026-11-19',
  members: [
    {
      acct: 'show@example.social',
      url: 'https://example.social/@show',
      displayName: 'Science Show',
      avatar: null,
      bot: false,
      bio: 'A podcast about science.',
      showUrl: null,
      observedAt: '2026-11-19',
      media: [
        {
          kind: 'native',
          source: 'mastodon',
          mediaType: 'audio',
          postUrl: 'https://example.social/@show/1',
          seenAt: '2026-11-19',
        },
        {
          kind: 'outgoing',
          source: 'youtube',
          mediaType: null,
          postUrl: 'https://example.social/@show/2',
          seenAt: '2026-11-19',
        },
      ],
      recentPosts: [
        {
          statusId: '1',
          server: 'https://example.social',
          postUrl: 'https://example.social/@show/1',
          createdAt: '2026-11-19',
          text: 'New episode of Science Show',
          spoilerText: '',
          sensitive: false,
          sources: [
            {
              kind: 'native',
              source: 'mastodon',
              url: 'https://files.example/episode.mp3',
              mediaType: 'audio',
            },
          ],
        },
        {
          statusId: '2',
          server: 'https://example.social',
          postUrl: 'https://example.social/@show/2',
          createdAt: '2026-11-18',
          text: 'Watch our latest episode',
          spoilerText: '',
          sensitive: false,
          sources: [
            {
              kind: 'outgoing',
              source: 'youtube',
              url: 'https://youtube.com/watch?v=abcdefghijk',
              mediaType: null,
            },
          ],
        },
      ],
    },
  ],
};

describe('PodcastKitsPage', () => {
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    localStorage.clear();
    query = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query },
        },
        {
          provide: PodcastKits,
          useValue: {
            index: vi.fn().mockResolvedValue(index),
            pack: vi.fn().mockResolvedValue(pack),
          },
        },
        {
          provide: Auth,
          useValue: {
            isAnonymous: true,
            account: signal(null),
            kind: signal('anonymous'),
            token: signal(null),
          },
        },
        { provide: FollowState, useValue: { status: () => 'unknown', busyWith: () => false } },
      ],
    });
  });

  it('starts with subject kits and needs no memorized handle', async () => {
    const fixture = TestBed.createComponent(PodcastKitsPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Science');
    });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('a[href*="kit=science"]')).toBeTruthy();
    expect(root.textContent).toContain('Starter kits');
    expect(root.textContent).toContain('2026-11-19');
    expect(root.textContent).toContain('Pack languages');
    expect((root.querySelector('select') as HTMLSelectElement).value).toBe('auto');
    expect(TestBed.inject(PodcastKits).pack).not.toHaveBeenCalled();
  });

  it('shows two post previews with media and keeps both posts inside Mawkingbird', async () => {
    query.next(convertToParamMap({ kit: 'science' }));
    const fixture = TestBed.createComponent(PodcastKitsPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Science Show');
    });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('a[href*="play=https"]')).toBeTruthy();
    expect(root.querySelectorAll('.post')).toHaveLength(2);
    expect(root.querySelector('audio[src="https://files.example/episode.mp3"]')).toBeTruthy();
    expect(root.textContent).toContain('Watch our latest episode');
    expect(root.textContent).toContain('Play video');
    [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Play video'))!
      .click();
    fixture.detectChanges();
    expect(root.querySelector('app-video-player')).toBeTruthy();
    expect(root.querySelectorAll('.post a[href^="/statuses/"]')).toHaveLength(4);
    const postSegment = root
      .querySelector<HTMLAnchorElement>('.post a[href^="/statuses/"]')!
      .pathname.split('/')[2];
    expect(parseAnonymousStatusRouteRef(decodeURIComponent(postSegment))).toMatchObject({
      server: 'https://example.social',
      id: '1',
      originalUrl: 'https://example.social/@show/1',
    });
    expect(root.querySelectorAll('a[href*="play=https"]')).toHaveLength(1);
    const profile = [...root.querySelectorAll<HTMLAnchorElement>('a')].find((link) =>
      link.textContent?.includes('@show@example.social'),
    );
    expect(decodeURIComponent(new URL(profile!.href).pathname)).toBe(
      '/accounts/@show@example.social',
    );
    expect(profile?.target).toBe('');
  });

  it('puts an Apple Podcasts episode in the inline player', async () => {
    const apple = structuredClone(pack);
    apple.members[0].recentPosts[1].sources = [
      {
        kind: 'outgoing',
        source: 'apple-podcasts',
        url: 'https://podcasts.apple.com/us/podcast/a/id123?i=456',
        mediaType: null,
      },
    ];
    vi.mocked(TestBed.inject(PodcastKits).pack).mockResolvedValue(apple);
    query.next(convertToParamMap({ kit: 'science' }));
    const fixture = TestBed.createComponent(PodcastKitsPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-external-player')).toBeTruthy();
    });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Apple Podcasts');
    expect(root.querySelector('.post a[target="_blank"]')).toBeNull();
  });

  it('keeps a cached content warning closed until the reader reveals it', async () => {
    const covered = structuredClone(pack);
    covered.members[0].recentPosts[0].spoilerText = 'Episode spoilers';
    covered.members[0].recentPosts[0].sensitive = true;
    vi.mocked(TestBed.inject(PodcastKits).pack).mockResolvedValue(covered);
    query.next(convertToParamMap({ kit: 'science' }));
    const fixture = TestBed.createComponent(PodcastKitsPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Episode spoilers');
    });
    const first = (fixture.nativeElement as HTMLElement).querySelector('.post')!;
    expect(first.textContent).not.toContain('New episode of Science Show');
    expect(first.querySelector('audio')).toBeNull();
    (first.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(first.textContent).toContain('New episode of Science Show');
    expect(first.querySelector('audio')).toBeTruthy();
  });

  it('uses a browser language before catalogue order and respects a saved choice', () => {
    const available = ['ca', 'de', 'en'];
    expect(podcastPackLanguage(available, null, null, ['de-AT', 'en-US'])).toBe('de');
    expect(podcastPackLanguage(available, null, null, ['fr-FR'])).toBe('en');
    expect(podcastPackLanguage(available, null, 'ca', ['en-US'])).toBe('ca');
    expect(podcastPackLanguage(available, 'de', 'ca', ['en-US'])).toBe('de');
  });

  it('saves a language selected through the shared Pack languages control', async () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(PodcastKitsPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('select')).toBeTruthy();
    });
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'de';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(TestBed.inject(ClientPrefs).podcastPackLanguage()).toBe('de');
  });

  it('shows the persisted choice after async language options arrive', async () => {
    localStorage.setItem('mockingbird_client_prefs', JSON.stringify({ podcastPackLanguage: 'de' }));
    const fixture = TestBed.createComponent(PodcastKitsPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement)?.value).toBe(
        'de',
      );
    });
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('a[href*="kit=technology"]'),
    ).toBeTruthy();
  });
});
