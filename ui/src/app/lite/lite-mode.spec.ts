import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HISTORY_BUCKET_MS,
  emptyHistory,
  noteVerdict,
} from '../platform/network/connection-history';
import { LITE_KEY, LiteMode, fullUrlFor, isLiteUrl, liteUrlFor, sustainedBad } from './lite-mode';

describe('Lite address mapping', () => {
  it('maps full-app screens that Lite has to their /m/ twins', () => {
    expect(liteUrlFor('/home')).toBe('/m/home');
    expect(liteUrlFor('/notifications')).toBe('/m/notifications');
    expect(liteUrlFor('/statuses/123')).toBe('/m/statuses/123');
    expect(liteUrlFor('/accounts/42')).toBe('/m/accounts/42');
    expect(liteUrlFor('/accounts/@alice@example.social')).toBe('/m/accounts/@alice@example.social');
    expect(liteUrlFor('/search?q=birds')).toBe('/m/search?q=birds');
    expect(liteUrlFor('/feeds/lists')).toBe('/m/lists');
    expect(liteUrlFor('/lists/7')).toBe('/m/lists/7');
    expect(liteUrlFor('/tags/birds')).toBe('/m/tags/birds');
    expect(liteUrlFor('/videos/queue')).toBe('/m/videos');
    expect(liteUrlFor('/conversations')).toBe('/m/conversations');
  });

  it('leaves screens Lite does not have in the full app', () => {
    expect(liteUrlFor('/')).toBeNull();
    expect(liteUrlFor('/settings/profile')).toBeNull();
    expect(liteUrlFor('/statuses/123/analytics')).toBeNull();
    expect(liteUrlFor('/forum')).toBeNull();
    expect(liteUrlFor('/radio/studio')).toBeNull();
  });

  it('maps back for the Full app link', () => {
    expect(fullUrlFor('/m/home')).toBe('/home');
    expect(fullUrlFor('/m/compose')).toBe('/home');
    expect(fullUrlFor('/m/lists')).toBe('/feeds/lists');
    expect(fullUrlFor('/m/lists/7')).toBe('/lists/7');
    expect(fullUrlFor('/m/search?q=birds')).toBe('/search?q=birds');
    expect(fullUrlFor('/m/videos')).toBe('/videos/queue');
    expect(fullUrlFor('/m/statuses/9')).toBe('/statuses/9');
  });

  it('recognises Lite addresses', () => {
    expect(isLiteUrl('/m')).toBe(true);
    expect(isLiteUrl('/m/home')).toBe(true);
    expect(isLiteUrl('/media')).toBe(false);
  });
});

describe('sustainedBad', () => {
  const now = 10 * HISTORY_BUCKET_MS + 30_000;

  it('needs every recent complete minute to be bad', () => {
    const h = emptyHistory();
    noteVerdict(h, now - 2 * HISTORY_BUCKET_MS, 'slow');
    expect(sustainedBad(h, now)).toBe(false);
    noteVerdict(h, now - HISTORY_BUCKET_MS, 'flaky');
    expect(sustainedBad(h, now)).toBe(true);
  });

  it('is not fooled by a good minute in between', () => {
    const h = emptyHistory();
    noteVerdict(h, now - 2 * HISTORY_BUCKET_MS, 'slow');
    noteVerdict(h, now - HISTORY_BUCKET_MS, 'good');
    expect(sustainedBad(h, now)).toBe(false);
  });
});

@Component({ template: '' })
class Blank {}

describe('LiteMode', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  function setUp(): { router: Router; lite: LiteMode } {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'm/home', component: Blank },
          { path: 'm/statuses/:id', component: Blank },
          { path: 'home', component: Blank },
          { path: 'statuses/:id', component: Blank },
          { path: 'settings', component: Blank },
        ]),
      ],
    });
    const lite = TestBed.inject(LiteMode);
    lite.start();
    return { router: TestBed.inject(Router), lite };
  }

  it('turns on when the reader enters /m/', async () => {
    const { router, lite } = setUp();
    await router.navigateByUrl('/m/home');
    expect(lite.on()).toBe(true);
    expect(localStorage.getItem(LITE_KEY)).toBe('on');
  });

  it('opens full-app links as their Lite twin while on, and leaves the rest alone', async () => {
    localStorage.setItem(LITE_KEY, 'on');
    const { router } = setUp();
    await router.navigateByUrl('/statuses/5');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.url).toBe('/m/statuses/5');
    await router.navigateByUrl('/settings');
    expect(router.url).toBe('/settings');
  });

  it('does nothing while off', async () => {
    const { router } = setUp();
    await router.navigateByUrl('/statuses/5');
    expect(router.url).toBe('/statuses/5');
  });

  it('turns off with the Full app link and opens the matching screen', async () => {
    const { router, lite } = setUp();
    await router.navigateByUrl('/m/statuses/5');
    lite.leave(router.url);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lite.on()).toBe(false);
    expect(router.url).toBe('/statuses/5');
  });

  it('remembers "Not now" for this tab', () => {
    const { lite } = setUp();
    lite.dismissOffer();
    expect(lite.offerDismissed()).toBe(true);
    expect(sessionStorage.getItem('mockingbird_lite_offer_dismissed')).toBe('1');
  });
});
