import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppModeService } from '../platform/build/app-mode';
import { RailWidget, RailWidgets, railShows } from './rail-widgets';

const DISCOVERY: RailWidget[] = [
  'whoToFollow',
  'trends',
  'blueskyTrends',
  'justMyServer',
  'feedLinks',
];
const KEPT: RailWidget[] = ['profile', 'houseAds', 'serverCard', 'blueskyService', 'plus'];
const BLOG_ONLY: RailWidget[] = ['blogAuthor', 'blogMore', 'blogRecent'];

describe('railShows', () => {
  it.each(['blog', 'explore', 'radio', 'video'] as const)(
    'drops the finders of posts, feeds and accounts in %s, keeping profile, ads and server',
    (mode) => {
      for (const widget of DISCOVERY) expect(railShows(mode, widget)).toBe(false);
      for (const widget of KEPT) expect(railShows(mode, widget)).toBe(true);
    },
  );

  it.each(['mastodon', 'rss', 'forum'] as const)('keeps every finder in %s', (mode) => {
    for (const widget of DISCOVERY) expect(railShows(mode, widget)).toBe(true);
  });

  it('shows the blog widgets in Blog only', () => {
    for (const widget of BLOG_ONLY) {
      expect(railShows('blog', widget)).toBe(true);
      expect(railShows('mastodon', widget)).toBe(false);
      expect(railShows('video', widget)).toBe(false);
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
    expect(rail.shows('blogRecent')).toBe(false);
    mode.set('blog');
    expect(rail.shows('trends')).toBe(false);
    expect(rail.shows('blogRecent')).toBe(true);
    expect(rail.shows('houseAds')).toBe(true);
  });
});
