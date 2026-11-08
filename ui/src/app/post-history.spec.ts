import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scopedKey } from './account-scope';
import { ClientPrefs } from './client-prefs';
import { Status } from './models';
import { portableKeys } from './portable-config';
import {
  historyEntryFor,
  historyMatches,
  POST_HISTORY_LIMIT,
  POST_HISTORY_SNIPPET,
  PostHistory,
} from './post-history';
import { Server } from './server';
import { classifyStorageKey } from './storage-registry';

const HOME = 'https://home.example';

const status = (id = '1', extra: Partial<Status> = {}) =>
  ({
    id,
    url: `https://home.example/@pizza/${id}`,
    content: '<p>Pizza <b>forever</b></p><p>and ever</p>',
    spoiler_text: '',
    account: { acct: 'pizza@example.org', display_name: 'Pizza Fan' },
    reblog: null,
    ...extra,
  }) as Status;

describe('historyEntryFor', () => {
  it('records a home Mastodon post by server and id, with author and plain-text snippet', () => {
    const entry = historyEntryFor(status('7'), HOME, 1000)!;
    expect(entry).toEqual({
      key: `mastodon|${HOME}|7`,
      network: 'mastodon',
      server: HOME,
      id: '7',
      url: 'https://home.example/@pizza/7',
      author: 'pizza@example.org',
      name: 'Pizza Fan',
      text: 'Pizza forever and ever',
      seen: 1000,
    });
  });

  it('records the boosted post, not the boost wrapper', () => {
    const entry = historyEntryFor(status('wrapper', { reblog: status('orig') }), HOME)!;
    expect(entry.id).toBe('orig');
  });

  it('keeps only the first 150 characters', () => {
    const long = status('1', { content: `<p>${'x'.repeat(400)}</p>` });
    expect(historyEntryFor(long, HOME)!.text).toHaveLength(POST_HISTORY_SNIPPET);
  });

  it('addresses Anonymous posts by their own server and raw id', () => {
    const anon = status('anonymous-mastodon:other.example:55', {
      provider: 'anonymous-mastodon',
      providerRef: { server: 'https://other.example', statusId: '55', accountId: '9' },
    });
    const entry = historyEntryFor(anon, HOME)!;
    expect(entry).toMatchObject({
      network: 'anonymous-mastodon',
      server: 'https://other.example',
      id: '55',
    });
  });

  it('addresses Bluesky posts by at:// uri', () => {
    const bsky = status('bluesky:x', {
      provider: 'bluesky',
      providerRef: { uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'c' },
    });
    expect(historyEntryFor(bsky, HOME)).toMatchObject({
      network: 'bluesky',
      server: null,
      id: 'at://did:plc:a/app.bsky.feed.post/1',
    });
  });

  it('skips posts that cannot be fetched again (RSS, synthetic ids)', () => {
    expect(historyEntryFor(status('rss:1', { provider: 'rss' }), HOME)).toBeNull();
    expect(historyEntryFor(status('local:1'), HOME)).toBeNull();
  });

  it('matches a filter against author, name and text, ignoring case', () => {
    const entry = historyEntryFor(status(), HOME)!;
    expect(historyMatches(entry, 'FOREVER')).toBe(true);
    expect(historyMatches(entry, '@pizza@')).toBe(true);
    expect(historyMatches(entry, 'pizza fan')).toBe(true);
    expect(historyMatches(entry, 'pasta')).toBe(false);
    expect(historyMatches(entry, '  ')).toBe(true);
  });
});

describe('PostHistory', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('puts the newest sighting first and moves a re-seen post back to the top', () => {
    const history = TestBed.inject(PostHistory);
    history.record(status('1'));
    history.record(status('2'));
    history.record(status('1'));
    expect(
      history
        .current()!
        .entries()
        .map((e) => e.id),
    ).toEqual(['1', '2']);
  });

  it(`keeps at most ${POST_HISTORY_LIMIT}`, () => {
    const history = TestBed.inject(PostHistory);
    for (let i = 0; i < POST_HISTORY_LIMIT + 5; i++) history.record(status(String(i)));
    const entries = history.current()!.entries();
    expect(entries).toHaveLength(POST_HISTORY_LIMIT);
    expect(entries[0].id).toBe(String(POST_HISTORY_LIMIT + 4));
  });

  it('records nothing while the Privacy switch is off', () => {
    TestBed.inject(ClientPrefs).setPostHistory(false);
    const history = TestBed.inject(PostHistory);
    history.record(status('1'));
    expect(history.current()!.entries()).toEqual([]);
  });

  it('is separate per account, Anonymous included, and survives a reload', () => {
    vi.useFakeTimers();
    const history = TestBed.inject(PostHistory);
    history.record(status('1'));
    vi.advanceTimersByTime(1500);
    localStorage.setItem('mastodon_mock_token', 'bob');
    expect(history.current()!.entries()).toEqual([]);
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    expect(history.current()).not.toBeNull();
    expect(history.current()!.entries()).toEqual([]);
    localStorage.removeItem('mastodon_mock_account_mode');
    localStorage.setItem('mastodon_mock_token', 'alice');
    TestBed.resetTestingModule();
    expect(
      TestBed.inject(PostHistory)
        .current()!
        .entries()
        .map((e) => e.id),
    ).toEqual(['1']);
  });

  it('clears everything, in memory and in storage', () => {
    const history = TestBed.inject(PostHistory);
    history.record(status('1'));
    history.current()!.persistNow();
    history.current()!.clear();
    expect(history.current()!.entries()).toEqual([]);
    expect(localStorage.getItem(scopedKey('mockingbird_post_history'))).toBeNull();
  });

  it('is private, per-account storage that never leaves in an export', () => {
    expect(classifyStorageKey(scopedKey('mockingbird_post_history'))?.sensitivity).toBe('private');
    expect(portableKeys('standard')).not.toContain('mockingbird_post_history');
  });

  it('fetches home posts in one batched request and falls back per id on old servers', async () => {
    const history = TestBed.inject(PostHistory);
    const home = TestBed.inject(Server).baseUrl();
    const entries = ['1', '2'].map((id) => historyEntryFor(status(id), home)!);
    const pending = history.fetch(entries);
    const batch = http.expectOne((r) => r.url === '/api/v1/statuses');
    expect(batch.request.params.getAll('id[]')).toEqual(['1', '2']);
    batch.flush({}, { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/v1/statuses/1').flush(status('1'));
    http.expectOne('/api/v1/statuses/2').flush({}, { status: 404, statusText: 'Gone' });
    const found = await pending;
    expect([...found.keys()]).toEqual([entries[0].key]);
  });
});
