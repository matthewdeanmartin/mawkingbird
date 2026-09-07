import { describe, expect, it } from 'vitest';
import { RSS_STARTER_KITS, rssStarterKit, rssStarterKitFeedCount } from './rss-starter-kits';

describe('RSS starter kits', () => {
  it('has no duplicate slugs', () => {
    const slugs = RSS_STARTER_KITS.map((kit) => kit.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('never lists the same feed URL twice, within or across kits', () => {
    // A duplicate would make one kit silently install fewer feeds than it
    // advertises, since the second add is a no-op on an existing subscription.
    const urls = RSS_STARTER_KITS.flatMap((kit) => kit.feeds.map((feed) => feed.url));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('uses absolute https URLs', () => {
    // These are fetched from a browser. An http URL would be blocked as mixed
    // content on a page served over https, which is every real deployment.
    for (const kit of RSS_STARTER_KITS) {
      for (const feed of kit.feeds) {
        expect(new URL(feed.url).protocol, `${kit.slug}/${feed.title}`).toBe('https:');
      }
    }
  });

  it('gives every kit a title, blurb, icon, folder and at least one feed', () => {
    for (const kit of RSS_STARTER_KITS) {
      expect(kit.title.trim(), kit.slug).not.toBe('');
      expect(kit.blurb.trim(), kit.slug).not.toBe('');
      expect(kit.icon.trim(), kit.slug).not.toBe('');
      expect(kit.folder.trim(), kit.slug).not.toBe('');
      expect(kit.feeds.length, kit.slug).toBeGreaterThan(0);
      for (const feed of kit.feeds) {
        expect(feed.title.trim(), `${kit.slug}/${feed.url}`).not.toBe('');
      }
    }
  });

  it('gives each kit a distinct folder, so two kits never merge on install', () => {
    const folders = RSS_STARTER_KITS.map((kit) => kit.folder);
    expect(new Set(folders).size).toBe(folders.length);
  });

  it('looks a kit up by slug', () => {
    expect(rssStarterKit('news')?.title).toBe('World news');
    expect(rssStarterKit('nope')).toBeNull();
  });

  it('counts every feed across all kits', () => {
    expect(rssStarterKitFeedCount()).toBe(
      RSS_STARTER_KITS.reduce((sum, kit) => sum + kit.feeds.length, 0),
    );
  });
});
