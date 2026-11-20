import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowState } from '../../accounts/follow-state';
import { Auth } from '../../platform/session/auth';
import { PodcastIndex, PodcastKits, PodcastPack } from './podcast-kits';
import { PodcastKitsPage } from './podcast-kits-page';

const index: PodcastIndex = {
  version: 1,
  generatedAt: '2026-11-19',
  languages: { en: 1 },
  packs: [
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
  version: 1,
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
          postUrl: 'https://example.social/@show/1',
          seenAt: '2026-11-19',
        },
        {
          kind: 'outgoing',
          source: 'youtube',
          postUrl: 'https://example.social/@show/2',
          seenAt: '2026-11-19',
        },
      ],
    },
  ],
};

describe('PodcastKitsPage', () => {
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
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
        { provide: Auth, useValue: { isAnonymous: true, account: signal(null) } },
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
    expect(TestBed.inject(PodcastKits).pack).not.toHaveBeenCalled();
  });

  it('offers Radio only for advancing media and opens other posts honestly', async () => {
    query.next(convertToParamMap({ kit: 'science' }));
    const fixture = TestBed.createComponent(PodcastKitsPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Science Show');
    });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('a[href*="play=https"]')).toBeTruthy();
    expect(root.querySelector('a[href="https://example.social/@show/2"]')).toBeTruthy();
    expect(root.querySelectorAll('a[href*="play=https"]')).toHaveLength(1);
  });
});
