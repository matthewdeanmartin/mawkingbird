import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  folderPathToName,
  RSS_SUBSCRIPTION_LIMIT,
  RSS_SUBSCRIPTION_LIMIT_MAX,
  RssSubscriptions,
} from './rss-subscriptions';

describe('RssSubscriptions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds, toggles and removes feeds, persisting to localStorage', () => {
    const subs = TestBed.inject(RssSubscriptions);

    subs.add('https://a.example/feed', 'Feed A');
    subs.add('https://a.example/feed', 'duplicate ignored');
    subs.add('https://b.example/feed', 'Feed B');
    expect(subs.feeds().map((f) => f.title)).toEqual(['Feed A', 'Feed B']);
    expect(subs.enabledFeeds()).toHaveLength(2);

    subs.setEnabled('https://a.example/feed', false);
    expect(subs.enabledFeeds().map((f) => f.title)).toEqual(['Feed B']);

    subs.remove('https://b.example/feed');
    expect(subs.feeds().map((f) => f.title)).toEqual(['Feed A']);

    // A fresh service instance reads the persisted state back.
    const raw = JSON.parse(localStorage.getItem('mockingbird_rss_feeds')!);
    expect(raw).toEqual([{ url: 'https://a.example/feed', title: 'Feed A', enabled: false }]);
  });

  it('survives corrupt stored JSON', () => {
    localStorage.setItem('mockingbird_rss_feeds', '{nonsense');
    const subs = TestBed.inject(RssSubscriptions);
    expect(subs.feeds()).toEqual([]);
  });

  it('rejects subscriptions beyond the limit, and says where to change it', () => {
    const subs = TestBed.inject(RssSubscriptions);
    for (let index = 0; index < RSS_SUBSCRIPTION_LIMIT; index += 1) {
      expect(subs.add(`https://${index}.example/feed`, `Feed ${index}`)).toBeNull();
    }
    const error = subs.add('https://overflow.example/feed', 'Overflow');
    expect(error).toContain('limit of 10');
    expect(error).toContain('settings page');
    expect(subs.feeds()).toHaveLength(RSS_SUBSCRIPTION_LIMIT);
  });

  it('lets the reader set their own ceiling, and remembers it', () => {
    const subs = TestBed.inject(RssSubscriptions);

    subs.setLimit(40);
    for (let index = 0; index < 12; index += 1) {
      expect(subs.add(`https://${index}.example/feed`, `Feed ${index}`)).toBeNull();
    }

    expect(subs.feeds()).toHaveLength(12);
    expect(subs.remaining()).toBe(28);
    expect(localStorage.getItem('mockingbird_rss_feed_limit')).toBe('40');
  });

  it('clamps a nonsense limit rather than accepting it', () => {
    const subs = TestBed.inject(RssSubscriptions);

    subs.setLimit(0);
    expect(subs.limit()).toBe(RSS_SUBSCRIPTION_LIMIT);

    subs.setLimit(Number.NaN);
    expect(subs.limit()).toBe(RSS_SUBSCRIPTION_LIMIT);

    subs.setLimit(10_000);
    expect(subs.limit()).toBe(RSS_SUBSCRIPTION_LIMIT_MAX);
  });

  it('never deletes feeds when the limit is lowered under the current count', () => {
    // Moving a number down is not a request to throw away subscriptions.
    const subs = TestBed.inject(RssSubscriptions);
    subs.setLimit(20);
    for (let index = 0; index < 15; index += 1) {
      subs.add(`https://${index}.example/feed`, `Feed ${index}`);
    }

    subs.setLimit(5);

    expect(subs.feeds()).toHaveLength(15);
    expect(subs.remaining()).toBe(0);
    expect(subs.add('https://new.example/feed', 'New')).toContain('limit of 5');
  });

  it('files a feed under a folder and lists the folders in use', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://a.example/feed', 'A', false, undefined, 'Tech');
    subs.add('https://b.example/feed', 'B', false, undefined, 'news');
    subs.add('https://c.example/feed', 'C');

    // Case-insensitive sort: an ASCII sort would put "Tech" above "news".
    expect(subs.folders()).toEqual(['news', 'Tech']);
    expect(subs.feeds().find((f) => f.url === 'https://c.example/feed')?.folder).toBeUndefined();
  });

  it('unfiles a feed when the folder is cleared, dropping the key entirely', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://a.example/feed', 'A', false, undefined, 'Tech');

    subs.setFolder('https://a.example/feed', '');

    expect(subs.folders()).toEqual([]);
    expect('folder' in subs.feeds()[0]).toBe(false);
  });

  it('a folder stops existing once nothing is filed under it', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://a.example/feed', 'A', false, undefined, 'Tech');
    subs.remove('https://a.example/feed');

    expect(subs.folders()).toEqual([]);
  });

  it('renames a folder by moving every feed in it', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://a.example/feed', 'A', false, undefined, 'Tech');
    subs.add('https://b.example/feed', 'B', false, undefined, 'Tech');
    subs.add('https://c.example/feed', 'C', false, undefined, 'News');

    subs.renameFolder('Tech', 'Technology');

    expect(subs.folders()).toEqual(['News', 'Technology']);
    expect(subs.feeds().filter((f) => f.folder === 'Technology')).toHaveLength(2);
  });

  it('renaming onto an existing folder merges them', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://a.example/feed', 'A', false, undefined, 'Tech');
    subs.add('https://b.example/feed', 'B', false, undefined, 'News');

    subs.renameFolder('Tech', 'News');

    expect(subs.folders()).toEqual(['News']);
    expect(subs.feeds().filter((f) => f.folder === 'News')).toHaveLength(2);
  });

  it('preserves folders across adoptAll', () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://a.example/feed', 'A', false, undefined, 'Tech');

    subs.adoptAll([{ url: 'https://a.example/feed', title: 'A renamed' }]);

    expect(subs.feeds()[0].folder).toBe('Tech');
  });
});

describe('folderPathToName', () => {
  it('is undefined for a top-level feed', () => {
    expect(folderPathToName([])).toBeUndefined();
    expect(folderPathToName(['  '])).toBeUndefined();
  });

  it('joins a nested path for display', () => {
    expect(folderPathToName(['Tech', 'Rust'])).toBe('Tech / Rust');
  });

  it('folds a path past the depth cap into the last name rather than losing it', () => {
    expect(folderPathToName(['A', 'B', 'C', 'D'])).toBe('A / B / C — D');
  });
});
