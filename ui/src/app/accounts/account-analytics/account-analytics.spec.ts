import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../platform/api/models';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { AccountAnalytics } from './account-analytics';

const ME = { id: 'me', acct: 'me', username: 'me', display_name: 'Me' } as Account;

describe('AccountAnalytics load failure', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function statuses() {
    return http.expectOne((req) => req.url.endsWith('/api/v1/accounts/me/statuses'));
  }

  it('says why the posts did not load and retries on the spot', () => {
    const fixture = TestBed.createComponent(AccountAnalytics);
    fixture.componentRef.setInput('account', ME);
    fixture.detectChanges();
    http.match((req) => req.url.includes('/followers')).forEach((req) => req.flush([]));

    statuses().flush(null, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const alert = root.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Couldn't load posts.");
    expect(alert.textContent).toContain('limiting how fast it answers');
    expect(alert.textContent).not.toContain('try again later');

    alert.querySelector('button')!.click();
    fixture.detectChanges();
    statuses().flush([]);
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.textContent).toContain('Nothing to analyze yet');
  });

  it('names an unreachable server rather than a status code', () => {
    const fixture = TestBed.createComponent(AccountAnalytics);
    fixture.componentRef.setInput('account', ME);
    fixture.detectChanges();
    statuses().error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("couldn't be reached");
  });
});

describe('AccountAnalytics read from a public server', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** A page of raw statuses as far.example sends them, newest first. */
  function page(from: number, size = 40) {
    return Array.from({ length: size }, (_, i) => ({
      id: String(from - i),
      created_at: '2026-11-01T00:00:00Z',
      content: '<p>hi</p>',
      account: { id: '42', username: 'alice', acct: 'alice' },
      media_attachments: [],
      reblog: null,
    }));
  }

  it("pages past the first 40 posts by the server's own ids", () => {
    const fixture = TestBed.createComponent(AccountAnalytics);
    fixture.componentRef.setInput('account', {
      id: '42',
      acct: 'alice@far.example',
      username: 'alice',
      followers_count: 10,
      following_count: 5,
      statuses_count: 500,
    } as Account);
    fixture.componentRef.setInput('publicRef', { server: 'https://far.example', id: '42' });
    fixture.detectChanges();
    http.match((req) => req.url.includes('/followers')).forEach((req) => req.flush([]));

    const statuses = (req: { url: string }) =>
      req.url === 'https://far.example/api/v1/accounts/42/statuses';
    http.expectOne(statuses).flush(page(1000));
    // The cursor is far.example's id for the oldest post, not the namespaced
    // `anonymous-mastodon:far.example:961` the app keeps internally.
    const second = http.expectOne(statuses);
    expect(second.request.params.get('max_id')).toBe('961');
    second.flush(page(960));
    const third = http.expectOne(statuses);
    expect(third.request.params.get('max_id')).toBe('921');
    third.flush(page(920));
    fixture.detectChanges();

    // 120 posts, past the old dead end at 40 (the sample stops at 100+).
    expect(
      (fixture.componentInstance as unknown as { posts: () => unknown[] }).posts(),
    ).toHaveLength(120);
  });
});

describe('AccountAnalytics read from Bluesky', () => {
  function feedPage(start: number, cursor?: string) {
    return {
      cursor,
      feed: [
        ...Array.from({ length: 19 }, (_, i) => ({
          post: {
            uri: `at://did:plc:alice/app.bsky.feed.post/${start + i}`,
            cid: 'c',
            author: { did: 'did:plc:alice', handle: 'alice.bsky.social' },
            record: { $type: 'app.bsky.feed.post', text: 'hi', createdAt: '2026-11-01T00:00:00Z' },
            indexedAt: '2026-11-01T00:00:00Z',
          },
        })),
        // Someone else's post, reposted: not the author's own words.
        {
          post: {
            uri: `at://did:plc:bob/app.bsky.feed.post/r${start}`,
            cid: 'c',
            author: { did: 'did:plc:bob', handle: 'bob.bsky.social' },
            record: { $type: 'app.bsky.feed.post', text: 'yo', createdAt: '2026-11-01T00:00:00Z' },
            indexedAt: '2026-11-01T00:00:00Z',
          },
          reason: { $type: 'app.bsky.feed.defs#reasonRepost' },
        },
      ],
    };
  }

  it('pages the public author feed by its cursor, leaving reposts and followers out', () => {
    const getAuthorFeed = vi.fn(
      (_actor: string, cursor: string | null, _filter?: string, _publicOnly?: boolean) =>
        of(cursor === null ? feedPage(0, 'c1') : feedPage(100)),
    );
    const getFollowers = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: BlueskyApi, useValue: { getAuthorFeed, getFollowers } },
      ],
    });
    const fixture = TestBed.createComponent(AccountAnalytics);
    fixture.componentRef.setInput('account', {
      id: 'bsky:did:plc:alice',
      acct: 'alice.bsky.social',
      username: 'alice.bsky.social',
      followers_count: 10,
      following_count: 5,
      statuses_count: 50,
    } as Account);
    fixture.componentRef.setInput('blueskyActor', 'did:plc:alice');
    fixture.detectChanges();

    expect(getAuthorFeed.mock.calls.map((call) => call[1])).toEqual([null, 'c1']);
    // Public read, never the linked account's credentials.
    expect(getAuthorFeed.mock.calls.every((call) => call[3] === true)).toBe(true);
    const posts = (
      fixture.componentInstance as unknown as { posts: () => { id: string }[] }
    ).posts();
    expect(posts).toHaveLength(38);
    expect(posts.every((p) => p.id.startsWith('bsky:at://did:plc:alice/'))).toBe(true);
    expect(getFollowers).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('.audience-section')).toBeNull();
  });
});
