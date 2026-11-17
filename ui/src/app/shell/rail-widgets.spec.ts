import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_MODES, AppModeService } from '../platform/build/app-mode';
import { RailWidgets, railShows } from './rail-widgets';

describe('railShows', () => {
  it('drops Just My Server and hashtags in Blog, keeping badges, ads and the server card', () => {
    expect(railShows('blog', 'justMyServer')).toBe(false);
    expect(railShows('blog', 'trends')).toBe(false);
    for (const kept of ['profile', 'plus', 'houseAds', 'serverCard'] as const) {
      expect(railShows('blog', kept)).toBe(true);
    }
  });

  it('leaves every other mode unchanged for now', () => {
    for (const mode of APP_MODES.filter((m) => m !== 'blog')) {
      expect(railShows(mode, 'trends')).toBe(true);
      expect(railShows(mode, 'justMyServer')).toBe(true);
    }
  });
});

describe('RailWidgets', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('follows the current mode', () => {
    const rail = TestBed.inject(RailWidgets);
    const mode = TestBed.inject(AppModeService);
    mode.set('mastodon');
    expect(rail.shows('trends')).toBe(true);
    mode.set('blog');
    expect(rail.shows('trends')).toBe(false);
    expect(rail.shows('houseAds')).toBe(true);
  });
});
