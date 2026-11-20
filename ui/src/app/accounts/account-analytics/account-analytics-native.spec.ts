import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import type { NativeAnalyticsApi } from '../../platform/session/native-analytics-types';
import { NATIVE_ANALYTICS } from '../../platform/session/platform-login';
import { AccountAnalytics } from './account-analytics';

const ME = {
  id: '1',
  acct: 'me',
  username: 'me',
  display_name: 'Me',
  followers_count: 100,
  following_count: 1,
} as Account;

function own(id: string, reblogs = 0): Status {
  return {
    id,
    created_at: '2026-11-01T00:00:00Z',
    content: '<p>hi</p>',
    account: ME,
    media_attachments: [],
    reblog: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: reblogs,
    favourites_count: 0,
  } as unknown as Status;
}

/** Let the promise chain in loadFromArchive settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AccountAnalytics in the native app', () => {
  let http: HttpTestingController;
  let native: { [K in keyof NativeAnalyticsApi]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    native = {
      catchUp: vi.fn(),
      posts: vi.fn(),
      boosters: vi.fn(),
      history: vi.fn(),
      postActivity: vi.fn(),
      engagers: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NATIVE_ANALYTICS, useValue: native },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).token.set('native-mastodon:a');
  });

  function render() {
    const fixture = TestBed.createComponent(AccountAnalytics);
    fixture.componentRef.setInput('account', ME);
    fixture.detectChanges();
    http.match((req) => req.url.includes('/followers')).forEach((req) => req.flush([]));
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows the archive, catches up, then fills in boosters from the archive', async () => {
    native.posts.mockResolvedValueOnce([own('2')]).mockResolvedValue([own('3', 1), own('2')]);
    native.catchUp.mockResolvedValue({ pages: 1, saved: 1, complete: true, rateLimited: false });
    native.boosters.mockResolvedValue([{ id: 'b', username: 'b', acct: 'b', followers_count: 7 }]);
    const { fixture, root } = render();
    await settle();
    await settle();
    fixture.detectChanges();

    expect(native.catchUp).toHaveBeenCalledWith('native-mastodon:a', '1');
    expect(native.posts).toHaveBeenCalledWith('native-mastodon:a', '1', 2000);
    expect(native.boosters).toHaveBeenCalledWith('native-mastodon:a', '3');
    // No web sampling and no web booster calls.
    expect(http.match((req) => req.url.includes('/statuses'))).toHaveLength(0);
    expect(root.textContent).toContain('From your archive, up to date.');
    expect(root.textContent).not.toContain('Refine reach');
    expect(root.querySelector('.load-more')).toBeNull();
    // Someone else's account (no signed-in account set): no follower history.
    expect(native.history).not.toHaveBeenCalled();
  });

  it('compares periods, lists months and shows your own follower history', async () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const older = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const ancient = new Date(Date.now() - 400 * 86_400_000).toISOString();
    native.posts.mockResolvedValue([
      { ...own('3'), created_at: recent, favourites_count: 4 },
      { ...own('2'), created_at: older, favourites_count: 2 },
      { ...own('1'), created_at: ancient },
    ]);
    native.catchUp.mockResolvedValue({ pages: 1, saved: 0, complete: true, rateLimited: false });
    native.history.mockResolvedValue({
      followers: [{ day: '2026-11-01', followers: 100, following: 5 }],
      followsByMonth: [{ month: '2026-11', count: 3 }],
      notificationHistoryComplete: false,
    });
    native.engagers.mockResolvedValue([
      {
        actor: '5',
        acct: 'fan@one.social',
        displayName: 'Fan',
        kind: 'favourite',
        month: '2026-11',
        count: 3,
      },
      {
        actor: '6',
        acct: 'pal@two.example',
        displayName: 'Pal',
        kind: 'reblog',
        month: '2026-11',
        count: 1,
      },
    ]);
    TestBed.inject(Auth).account.set(ME);
    const { fixture, root } = render();
    await settle();
    await settle();
    fixture.detectChanges();

    const history = root.querySelector('.history')!;
    expect(history.textContent).toContain('Last 30 days vs the 30 before');
    const favourites = [...history.querySelectorAll('.tile')].find((t) =>
      t.textContent?.includes('Favourites'),
    )!;
    expect(favourites.textContent).toContain('+100%');
    expect(favourites.textContent).toContain('before: 2');
    expect(history.querySelectorAll('.history-table')[0].querySelectorAll('tbody tr')).toHaveLength(
      12,
    );
    expect(history.textContent).toContain('Download CSV');
    expect(native.history).toHaveBeenCalledWith('native-mastodon:a');
    expect(history.textContent).toContain('Older follow notifications are still being collected');
    expect(native.engagers).toHaveBeenCalledWith('native-mastodon:a', 90);
    const people = root.querySelector('.people-section')!;
    expect(people.textContent).toContain('People');
    expect([...people.querySelectorAll('.counted-row')].map((r) => r.textContent)).toEqual([
      expect.stringContaining('fan@one.social'),
      expect.stringContaining('pal@two.example'),
    ]);
  });

  it('offers to continue when a catch-up stopped at its page cap', async () => {
    native.posts.mockResolvedValue([own('2')]);
    native.catchUp.mockResolvedValue({
      pages: 10,
      saved: 400,
      complete: false,
      rateLimited: false,
    });
    const { fixture, root } = render();
    await settle();
    await settle();
    fixture.detectChanges();
    expect(root.textContent).toContain('Some newer posts are not fetched yet.');
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Continue'))!.click();
    await settle();
    expect(native.catchUp).toHaveBeenCalledTimes(2);
  });

  it('falls back to the web sampler when the archive is empty and the server is unreachable', async () => {
    native.posts.mockResolvedValue([]);
    native.catchUp.mockRejectedValue({ kind: 'network' });
    render();
    await settle();
    await settle();
    expect(http.match((req) => req.url.endsWith('/api/v1/accounts/1/statuses'))).toHaveLength(1);
  });
});
