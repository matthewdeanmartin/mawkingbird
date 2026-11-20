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
