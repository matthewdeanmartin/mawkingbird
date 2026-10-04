import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RecentFeeds } from './recent-feeds';
import { scopedKey } from './account-scope';
import { isKeyExportable } from './storage-registry';

const feed = (id: string) => ({ url: `/client-lists/${id}`, label: id });

describe('RecentFeeds', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('keeps five distinct shortcuts, most recently visited first', () => {
    const store = TestBed.inject(RecentFeeds);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) store.visit(feed(id));
    expect(store.entries().map((entry) => entry.label)).toEqual(['f', 'e', 'd', 'c', 'b']);
    store.visit(feed('d'));
    expect(store.entries().map((entry) => entry.label)).toEqual(['d', 'f', 'e', 'c', 'b']);
  });

  it('preserves pinned positions as other slots rotate, including all five pinned', () => {
    const store = TestBed.inject(RecentFeeds);
    for (const id of ['a', 'b', 'c', 'd', 'e']) store.visit(feed(id));
    store.togglePin(feed('d').url);
    store.togglePin(feed('b').url);
    store.visit(feed('f'));
    expect(store.entries().map((entry) => entry.label)).toEqual(['f', 'd', 'e', 'b', 'c']);
    store.visit(feed('d'));
    expect(store.entries()[1].label).toBe('d');
    for (const entry of store.entries()) if (!entry.pinned) store.togglePin(entry.url);
    store.visit(feed('g'));
    expect(store.entries().map((entry) => entry.label)).toEqual(['f', 'd', 'e', 'b', 'c']);
    store.togglePin(feed('d').url);
    store.visit(feed('g'));
    expect(store.entries().map((entry) => entry.label)).toEqual(['f', 'g', 'e', 'b', 'c']);
  });

  it('restores pins after reload and isolates account history', () => {
    const store = TestBed.inject(RecentFeeds);
    localStorage.setItem('mastodon_mock_token', 'alice');
    store.visit(feed('a'));
    store.togglePin(feed('a').url);
    const reloaded = new RecentFeeds();
    reloaded.refresh();
    expect(reloaded.entries()[0].pinned).toBe(true);
    localStorage.setItem('mastodon_mock_token', 'bob');
    store.refresh();
    expect(store.entries()).toEqual([]);
    localStorage.setItem('mastodon_mock_token', 'alice');
    store.refresh();
    expect(store.entries()[0].label).toBe('a');
    expect(isKeyExportable(scopedKey('mockingbird_recent_feeds'), 'shareable')).toBe(false);
  });

  it('rejects categories and removes previously saved category pins on load', () => {
    localStorage.setItem(
      scopedKey('mockingbird_recent_feeds'),
      JSON.stringify([
        { url: '/feeds?section=client-lists', label: 'Private lists', pinned: true },
        { url: '/feeds/tags', label: 'Tags', pinned: true },
        { ...feed('newspapers'), pinned: true },
      ]),
    );
    const store = TestBed.inject(RecentFeeds);
    store.refresh();
    expect(store.entries()).toEqual([{ ...feed('newspapers'), pinned: true }]);
    store.visit({ url: '/feeds?section=rss', label: 'RSS feeds' });
    expect(store.entries()).toHaveLength(1);
  });

  it('tolerates malformed or unavailable storage', () => {
    localStorage.setItem(scopedKey('mockingbird_recent_feeds'), '{broken');
    const store = TestBed.inject(RecentFeeds);
    store.refresh();
    expect(store.entries()).toEqual([]);
    store.visit(feed('a'));
    expect(store.entries()).toHaveLength(1);
  });
});
