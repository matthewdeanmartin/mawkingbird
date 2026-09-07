import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { ParsedFeed } from './rss-parser';
import { RssFetch } from './rss-fetch';
import { RssStarterKit } from './rss-starter-kits';
import { RssStarterKitInstall } from './rss-starter-kit-install';
import { RssSubscriptions } from './rss-subscriptions';

function parsed(title: string): ParsedFeed {
  return { title, link: null, items: [] };
}

const KIT: RssStarterKit = {
  slug: 'test',
  title: 'Test kit',
  blurb: 'b',
  icon: '🧪',
  folder: 'Test folder',
  feeds: [
    { url: 'https://a.example/feed', title: 'A' },
    { url: 'https://b.example/feed', title: 'B' },
  ],
};

describe('RssStarterKitInstall', () => {
  /** URLs that succeed on a direct fetch. */
  let direct: Set<string>;
  /** URLs that succeed only through the proxy. */
  let viaProxy: Set<string>;
  let proxyUsable: boolean;
  let missingEntitled: boolean;
  let adoptSupporterProxy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    direct = new Set(KIT.feeds.map((f) => f.url));
    viaProxy = new Set();
    proxyUsable = false;
    missingEntitled = false;
    adoptSupporterProxy = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: RssFetch,
          useValue: {
            fetchFeed: vi.fn((url: string, options: { useProxy?: boolean }) => {
              const ok = options.useProxy ? viaProxy.has(url) : direct.has(url);
              return ok ? of(parsed(url)) : throwError(() => new Error('CORS'));
            }),
          },
        },
        {
          provide: CorsProxySettings,
          useValue: {
            usable: () => proxyUsable,
            missingEntitledProxy: () => missingEntitled,
            adoptSupporterProxy,
          },
        },
      ],
    });
  });

  it('subscribes every feed and files them under the kit folder', async () => {
    const installer = TestBed.inject(RssStarterKitInstall);
    const subs = TestBed.inject(RssSubscriptions);

    const report = await installer.install(KIT);

    expect(report.added).toBe(2);
    expect(report.failed).toEqual([]);
    expect(subs.feeds().map((f) => f.folder)).toEqual(['Test folder', 'Test folder']);
    expect(subs.folders()).toEqual(['Test folder']);
  });

  it('retries through the proxy when a direct fetch fails', async () => {
    direct.delete('https://b.example/feed');
    viaProxy.add('https://b.example/feed');
    proxyUsable = true;

    const report = await TestBed.inject(RssStarterKitInstall).install(KIT);

    expect(report.added).toBe(2);
    // Only the feed that needed it is marked as proxied — never the whole kit.
    const subs = TestBed.inject(RssSubscriptions);
    expect(subs.usesProxy('https://a.example/feed', false)).toBe(false);
    expect(subs.usesProxy('https://b.example/feed', false)).toBe(true);
  });

  it('reports a feed that fails both ways, and still installs the rest', async () => {
    direct.delete('https://b.example/feed');
    proxyUsable = true; // proxy is available but also fails for this URL

    const report = await TestBed.inject(RssStarterKitInstall).install(KIT);

    expect(report.added).toBe(1);
    expect(report.failed.map((f) => f.title)).toEqual(['B']);
    expect(TestBed.inject(RssSubscriptions).has('https://a.example/feed')).toBe(true);
  });

  it('reports failure once, not once per attempt', async () => {
    direct.clear();
    proxyUsable = true;

    const report = await TestBed.inject(RssStarterKitInstall).install(KIT);

    expect(report.failed).toHaveLength(2);
  });

  it('counts feeds already subscribed instead of re-adding them', async () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://a.example/feed', 'A already');

    const report = await TestBed.inject(RssStarterKitInstall).install(KIT);

    expect(report.alreadySubscribed).toBe(1);
    expect(report.added).toBe(1);
    // The pre-existing subscription keeps its own title and stays unfiled —
    // installing a kit must not reorganise feeds the user already had.
    expect(subs.feeds().find((f) => f.url === 'https://a.example/feed')?.title).toBe('A already');
    expect(subs.feeds().find((f) => f.url === 'https://a.example/feed')?.folder).toBeUndefined();
  });

  it('stops at the subscription limit and says how many were skipped', async () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.setLimit(1);

    const report = await TestBed.inject(RssStarterKitInstall).install(KIT);

    expect(report.added).toBe(1);
    expect(report.skippedForLimit).toBe(1);
    expect(subs.feeds()).toHaveLength(1);
  });

  it('adopts an entitled but unconfigured proxy before giving up on CORS', async () => {
    direct.clear();
    missingEntitled = true;

    await TestBed.inject(RssStarterKitInstall).install(KIT);

    expect(adoptSupporterProxy).toHaveBeenCalled();
  });

  it('clears progress and exposes the report when finished', async () => {
    const installer = TestBed.inject(RssStarterKitInstall);
    expect(installer.progress()).toBeNull();

    await installer.install(KIT);

    expect(installer.progress()).toBeNull();
    expect(installer.report()?.kitSlug).toBe('test');
  });

  it('knows when a kit is fully installed', async () => {
    const installer = TestBed.inject(RssStarterKitInstall);
    expect(installer.installed(KIT)).toBe(false);
    expect(installer.remaining(KIT)).toBe(2);

    await installer.install(KIT);

    expect(installer.installed(KIT)).toBe(true);
    expect(installer.remaining(KIT)).toBe(0);
  });
});
