import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import { Account, Status } from '../../platform/api/models';
import { Profile } from './profile';

describe('Native archived person page', () => {
  it('pages locally and only fetches older history after an explicit action', async () => {
    localStorage.clear();
    const status = (id: number) =>
      ({ id: String(id), account: { id: '900' }, content: `post ${id}` }) as Status;
    const accountPosts = vi.fn(async (_handle: string, _remoteId: string, offset: number) => {
      const rows =
        offset === 0
          ? Array.from({ length: 40 }, (_, i) => status(i + 1))
          : offset === 40
            ? [status(41)]
            : [status(42)];
      return rows.map((post, index) => ({
        localId: offset + index + 1,
        status: post,
        isRead: false,
      }));
    });
    const fetchAccountPage = vi.fn(async () => 1);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NATIVE_PROFILES, useValue: { accountPosts, fetchAccountPage } },
      ],
    });
    TestBed.overrideComponent(Profile, { set: { template: '' } });
    TestBed.inject(Auth).setToken('native-mastodon:test');
    const page = TestBed.createComponent(Profile).componentInstance as unknown as {
      account: { set: (account: Account) => void };
      statuses: () => Status[];
      exhausted: () => boolean;
      loadStatuses: (id: string) => void;
      loadMore: () => void;
      fetchArchivePage: (older: boolean) => Promise<void>;
    };
    page.account.set({ id: '900', username: 'reader' } as Account);
    page.loadStatuses('900');
    await vi.waitFor(() => expect(page.statuses()).toHaveLength(40));
    expect(accountPosts).toHaveBeenCalledWith('native-mastodon:test', '900', 0);
    expect(fetchAccountPage).not.toHaveBeenCalled();
    page.loadMore();
    await vi.waitFor(() => expect(page.statuses()).toHaveLength(41));
    expect(page.exhausted()).toBe(true);
    await page.fetchArchivePage(true);
    await vi.waitFor(() => expect(page.statuses()).toHaveLength(42));
    expect(fetchAccountPage).toHaveBeenCalledWith('native-mastodon:test', '900', true);
    expect(accountPosts).toHaveBeenLastCalledWith('native-mastodon:test', '900', 41);
    TestBed.inject(HttpTestingController).expectNone((request) =>
      request.url.includes('/statuses'),
    );
    localStorage.clear();
  });

  it('discards a late archive page from the previous identity', async () => {
    localStorage.clear();
    let finishFirst!: (rows: { localId: number; status: Status; isRead: boolean }[]) => void;
    const first = new Promise<{ localId: number; status: Status; isRead: boolean }[]>((resolve) => {
      finishFirst = resolve;
    });
    const accountPosts = vi.fn((handle: string) =>
      handle === 'native-mastodon:first'
        ? first
        : Promise.resolve([{ localId: 2, status: { id: 'second' } as Status, isRead: false }]),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NATIVE_PROFILES, useValue: { accountPosts } },
      ],
    });
    TestBed.overrideComponent(Profile, { set: { template: '' } });
    const auth = TestBed.inject(Auth);
    auth.setToken('native-mastodon:first');
    const page = TestBed.createComponent(Profile).componentInstance as unknown as {
      statuses: () => Status[];
      loadStatuses: (id: string) => void;
    };
    page.loadStatuses('900');
    auth.setToken('native-mastodon:second');
    page.loadStatuses('900');
    await vi.waitFor(() => expect(page.statuses()[0]?.id).toBe('second'));
    finishFirst([{ localId: 1, status: { id: 'first' } as Status, isRead: false }]);
    await Promise.resolve();
    expect(page.statuses().map((post) => post.id)).toEqual(['second']);
    localStorage.clear();
  });
});
