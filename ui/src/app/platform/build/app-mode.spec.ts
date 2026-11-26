import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModeService, modeForUrl } from './app-mode';

@Component({ template: '' })
class Blank {}

describe('modeForUrl', () => {
  it.each([
    ['/home', 'mastodon'],
    ['/home?x=1', 'mastodon'],
    ['/notifications', 'mastodon'],
    ['/feeds/lists', 'mastodon'],
    ['/statuses/123', 'mastodon'],
    ['/rss', 'rss'],
    ['/rss?view=kits', 'rss'],
    ['/rss?feed=https%3A%2F%2Fa.example%2Ff.xml', 'rss'],
    ['/settings/rss', 'rss'],
    ['/videos', 'video'],
    ['/videos?channel=abc', 'video'],
    ['/videos/queue', 'video'],
    ['/forum', 'forum'],
    ['/forum?filter=asked&source=tag:rust', 'forum'],
    ['/forum/d/123', 'forum'],
    ['/singles', 'radio'],
    ['/singles/find?acct=a%40b.example', 'radio'],
    ['/playlists', 'radio'],
    ['/playlists/abc', 'radio'],
    ['/listen?post=1', 'radio'],
    ['/blog', 'blog'],
    ['/blog/me', 'blog'],
    ['/blog/@alice@far.example', 'blog'],
    ['/settings/blog', 'blog'],
  ] as const)('%s is %s', (url, mode) => {
    expect(modeForUrl(url)).toBe(mode);
  });

  it.each([
    '/bookmarks?tab=read-later',
    '/bookmarks?view=video',
    '/read/rss:abc',
    '/statuses/rss:abc',
    '/accounts/rss:https%3A%2F%2Fa.example%2Ff.xml',
    '/settings',
    '/settings/appearance',
    '/write',
    '/write?draft=1',
    '/drafts',
  ])('%s keeps the current mode', (url) => {
    expect(modeForUrl(url)).toBeNull();
  });

  it('does not mistake a lookalike path for a mode', () => {
    expect(modeForUrl('/rssfeeds')).toBe('mastodon');
    expect(modeForUrl('/videosfoo')).toBe('mastodon');
    expect(modeForUrl('/forums')).toBe('mastodon');
    expect(modeForUrl('/blogfoo')).toBe('mastodon');
    expect(modeForUrl('/writer')).toBe('mastodon');
    expect(modeForUrl('/unbirds')).toBe('mastodon');
  });

  it('puts Explore tabs in Explore, but leaves the signed-out /explore landing in Fedi', () => {
    expect(modeForUrl('/explore/feed')).toBe('explore');
    expect(modeForUrl('/explore/people?q=a')).toBe('explore');
    expect(modeForUrl('/explore')).toBe('mastodon');
    expect(modeForUrl('/explore/')).toBe('mastodon');
    expect(modeForUrl('/explorer')).toBe('mastodon');
  });

  it.each(['/collections/starter/catalog-en-technology', '/collections/abc', '/tags/gardening'])(
    '%s keeps the mode it was opened from (kits and tags open from Explore too)',
    (url) => {
      expect(modeForUrl(url)).toBeNull();
    },
  );

  it('puts Watch in Video, wherever it was opened from', () => {
    expect(modeForUrl('/watch')).toBe('video');
    expect(modeForUrl('/watch?youtube=abc')).toBe('video');
  });

  it('puts Unbird pages in the Unbird mode', () => {
    expect(modeForUrl('/unbird')).toBe('unbird');
    expect(modeForUrl('/unbird/people?x=1')).toBe('unbird');
  });
});

describe('AppModeService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('follows navigation, and shared pages keep the mode they were reached in', async () => {
    const router = TestBed.inject(Router);
    const mode = TestBed.inject(AppModeService);
    expect(mode.mode()).toBe('mastodon');

    await router.navigateByUrl('/rss');
    expect(mode.mode()).toBe('rss');
    await router.navigateByUrl('/read/rss:abc');
    expect(mode.mode()).toBe('rss');
    await router.navigateByUrl('/settings/appearance');
    expect(mode.mode()).toBe('rss');

    await router.navigateByUrl('/videos');
    await router.navigateByUrl('/watch?youtube=abc');
    expect(mode.mode()).toBe('video');

    // Home is the way back out of every mode.
    await router.navigateByUrl('/home');
    expect(mode.mode()).toBe('mastodon');
  });

  it('remembers the mode for the tab', async () => {
    TestBed.inject(AppModeService);
    await TestBed.inject(Router).navigateByUrl('/videos');
    expect(sessionStorage.getItem('mockingbird_app_mode')).toBe('video');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    // A fresh app on a shared page picks the tab's mode back up.
    expect(TestBed.inject(AppModeService).mode()).toBe('video');
  });

  it('ignores a stored value that is not a mode', () => {
    sessionStorage.setItem('mockingbird_app_mode', 'twitter');
    expect(TestBed.inject(AppModeService).mode()).toBe('mastodon');
  });

  it('works when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const mode = TestBed.inject(AppModeService);
    expect(mode.mode()).toBe('mastodon');
    await TestBed.inject(Router).navigateByUrl('/rss');
    expect(mode.mode()).toBe('rss');
  });
});
