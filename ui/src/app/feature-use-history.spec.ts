import { TestBed } from '@angular/core/testing';
import { DefaultUrlSerializer, NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_USE_KEY, FeatureUseHistory } from './feature-use-history';
import { portableKeys } from './portable-config';
import { classifyStorageKey } from './storage-registry';

describe('Local feature-use history', () => {
  let events: Subject<NavigationEnd>;
  beforeEach(() => {
    localStorage.clear();
    events = new Subject();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            url: '/bookmarks',
            events,
            parseUrl: (url: string) => new DefaultUrlSerializer().parse(url),
          },
        },
      ],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  it('remembers normal visits and the initial route using only feature IDs', () => {
    const history = TestBed.inject(FeatureUseHistory);
    expect(history.has('bookmarks')).toBe(true);
    events.next(new NavigationEnd(1, '/analytics', '/analytics?private=never-store-me'));
    expect(history.has('analytics')).toBe(true);
    expect(JSON.parse(localStorage.getItem(FEATURE_USE_KEY)!)).toEqual(['bookmarks', 'analytics']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            url: '/',
            events: new Subject(),
            parseUrl: (url: string) => new DefaultUrlSerializer().parse(url),
          },
        },
      ],
    });
    expect(TestBed.inject(FeatureUseHistory).has('analytics')).toBe(true);
  });
  it('distinguishes destinations sharing a route and does not mark all Plus pitches', () => {
    const history = TestBed.inject(FeatureUseHistory);
    events.next(new NavigationEnd(1, '', '/bundled-starter-kits?kind=packs'));
    expect(history.has('starter-packs')).toBe(true);
    expect(history.has('collections')).toBe(false);
    events.next(new NavigationEnd(2, '', '/settings/mawkingbird-plus'));
    expect(history.has('plus-feeds')).toBe(false);
    history.mark('plus-feeds');
    expect(history.has('plus-feeds')).toBe(true);
    expect(history.has('plus-lists')).toBe(false);
  });
  it('survives corrupt or blocked storage and never exports or syncs its history', () => {
    localStorage.setItem(FEATURE_USE_KEY, '{broken');
    const history = TestBed.inject(FeatureUseHistory);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    history.mark('rss');
    expect(history.has('rss')).toBe(true);
    history.mark('unknown-feature');
    expect(history.has('unknown-feature')).toBe(false);
    expect(classifyStorageKey(FEATURE_USE_KEY)?.sensitivity).toBe('cache');
    expect(portableKeys('standard')).not.toContain(FEATURE_USE_KEY);
    expect(portableKeys('private')).not.toContain(FEATURE_USE_KEY);
  });
});
