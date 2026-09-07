import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../../models';
import { Auth } from '../../auth';
import { LocalModeration } from '../../local-moderation';
import { AnonymousFollows } from '../../providers/anonymous/anonymous-follows';
import { AnonymousMastodonProvider } from '../../providers/anonymous/anonymous-mastodon-provider';
import { FeedAggregator } from '../../providers/feed-aggregator';
import { FeedDoctorPage } from './feed-doctor-page';

function account(id: string): Account {
  return {
    id,
    username: `u${id}`,
    acct: `u${id}@example.social`,
    statuses_count: 500,
    last_status_at: new Date().toISOString(),
    fields: [],
  } as unknown as Account;
}

function post(id: string, authorId: string): Status {
  return {
    id,
    account: account(authorId),
    content: '',
    created_at: new Date().toISOString(),
    favourites_count: 0,
    reblogs_count: 0,
    replies_count: 0,
    tags: [],
    media_attachments: [],
    mentions: [],
  } as unknown as Status;
}

describe('FeedDoctorPage', () => {
  let fixture: ComponentFixture<FeedDoctorPage>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
  });

  /** Drive the page with a provider stubbed to return a known feed and diagnosis. */
  function open(posts: Status[], outcomes: { handle: string; ending: string; fetched: number }[]) {
    const provider = TestBed.inject(AnonymousMastodonProvider);
    // One full page, then empties — which is how sampleFeed knows to stop.
    let served = false;
    vi.spyOn(provider, 'fetchPage').mockImplementation(() => {
      const page = served ? [] : posts;
      served = true;
      return of(page);
    });
    // Stubbed so `reset()` does not rebuild cursors from an empty follow store and
    // wipe the outcomes the test just staged.
    vi.spyOn(provider, 'reset').mockImplementation(() => undefined);
    provider.lastOutcomes.set(outcomes as never);

    fixture = TestBed.createComponent(FeedDoctorPage);
    fixture.detectChanges();
    return fixture;
  }

  function text(): string {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('names a flooding account and offers a mute', async () => {
    const posts = [
      ...Array.from({ length: 10 }, (_, i) => post(`l${i}`, 'loud')),
      ...Array.from({ length: 10 }, (_, i) => post(`q${i}`, `quiet${i}`)),
    ];
    open(posts, [{ handle: '@loud', ending: 'ok', fetched: 20 }]);

    await vi.waitFor(() => expect(text()).toContain('uloud@example.social'));
    expect(text()).toContain('50%');
    expect(text()).toContain('Mute for 8 hours');
  });

  it('states the sample size rather than implying it read the whole feed', async () => {
    open([post('1', 'a')], [{ handle: '@a', ending: 'ok', fetched: 1 }]);
    await vi.waitFor(() => expect(text()).toContain('last 1 posts'));
  });

  it('reports filters as the reason a feed ended early', async () => {
    open(
      [post('1', 'a')],
      [
        { handle: '@a', ending: 'ok', fetched: 1 },
        { handle: '@b', ending: 'filtered', fetched: 0 },
        { handle: '@c', ending: 'filtered', fetched: 0 },
      ],
    );

    await vi.waitFor(() => expect(text()).toContain('filters'));
    expect(text()).toContain('cut short by your filters');
  });

  it('mutes locally when asked, and only when asked', async () => {
    const posts = Array.from({ length: 12 }, (_, i) => post(`l${i}`, 'loud'));
    open(posts, [{ handle: '@loud', ending: 'ok', fetched: 12 }]);
    const moderation = TestBed.inject(LocalModeration);

    await vi.waitFor(() => expect(text()).toContain('Mute for 8 hours'));
    // Nothing has happened yet: the Doctor never acts on its own.
    expect(moderation.isMuted(account('loud'))).toBe(false);

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => b.textContent?.includes('Mute for 8 hours'));
    button!.click();
    fixture.detectChanges();

    expect(moderation.isMuted(account('loud'))).toBe(true);
    expect(text()).toContain('Muted for 8 hours');
  });

  it('unfollows locally without any write request', async () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('loud'), 'https://mastodon.social');
    const posts = Array.from({ length: 12 }, (_, i) => post(`l${i}`, 'loud'));
    open(posts, [{ handle: '@loud', ending: 'ok', fetched: 12 }]);

    await vi.waitFor(() => expect(text()).toContain('Unfollow'));
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => b.textContent?.trim() === 'Unfollow');
    button!.click();
    fixture.detectChanges();

    expect(follows.count()).toBe(0);
    expect(text()).toContain('Unfollowed');
  });

  /**
   * Signed-in Home is a different feed, not the anonymous one with a login on top:
   * `FeedAggregator` merges Mastodon with Bluesky, Twitter and RSS. The page used
   * to print a paragraph explaining why it had nothing to say here, which was both
   * an excuse and wrong — the aggregator knows exactly which source gave what.
   */
  it('diagnoses the aggregated feed when signed in', async () => {
    TestBed.inject(Auth).setToken('a-token');
    const aggregator = TestBed.inject(FeedAggregator);
    vi.spyOn(aggregator, 'reset').mockImplementation(() => undefined);

    const now = Date.now();
    const fresh = Array.from({ length: 30 }, (_, i) => ({
      ...post(`m${i}`, `author${i % 6}`),
      created_at: new Date(now - i * 60_000).toISOString(),
    }));
    // Bluesky stalled four days ago — the failure a connected account actually hits.
    const stale = Array.from({ length: 10 }, (_, i) => ({
      ...post(`b${i}`, `bsky${i}`),
      provider: 'bluesky',
      created_at: new Date(now - 96 * 3_600_000 - i * 60_000).toISOString(),
    }));

    let served = false;
    vi.spyOn(aggregator, 'nextPage').mockImplementation(() => {
      const page = served ? [] : [...fresh, ...stale];
      served = true;
      return of(page as Status[]);
    });

    fixture = TestBed.createComponent(FeedDoctorPage);
    fixture.detectChanges();

    await vi.waitFor(() => expect(text()).toContain('Bluesky'));
    // Names the lagging source rather than shrugging at the signed-in reader.
    expect(text()).toContain('behind the rest of your feed');
    // And no per-follow verdict, which signed-in Home genuinely cannot answer.
    expect(text()).not.toContain('Every follow returned posts');
  });

  it('stays calm about a healthy feed', async () => {
    const posts = Array.from({ length: 20 }, (_, i) => post(`p${i}`, `author${i % 8}`));
    open(posts, [
      { handle: '@a', ending: 'ok', fetched: 10 },
      { handle: '#tag', ending: 'ok', fetched: 10 },
    ]);

    await vi.waitFor(() => expect(text()).toContain('No one is dominating'));
    expect(text()).toContain('Every follow returned posts');
    expect(text()).not.toContain('Mute for');
  });
});
