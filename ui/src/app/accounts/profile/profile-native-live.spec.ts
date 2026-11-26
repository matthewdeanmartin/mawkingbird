import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import { Account, Status } from '../../platform/api/models';
import { Profile } from './profile';

describe('A profile in Native', () => {
  // One profile is one ordinary request. The archive is for jobs that would
  // take thousands; offline, the read cache falls back to it by itself.
  it('reads the server, and pages it, without asking the archive', () => {
    localStorage.clear();
    const accountPosts = vi.fn();
    const fetchAccountPage = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NATIVE_PROFILES, useValue: { accountPosts, fetchAccountPage } },
      ],
    });
    TestBed.overrideComponent(Profile, { set: { template: '' } });
    TestBed.inject(Auth).setToken('native-mastodon:test');
    const http = TestBed.inject(HttpTestingController);
    const page = TestBed.createComponent(Profile).componentInstance as unknown as {
      account: { set: (account: Account) => void };
      statuses: () => Status[];
      loadStatuses: (id: string) => void;
      loadMore: () => void;
    };
    const posts = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: String(from - i),
        account: { id: '900' },
        content: '',
      }));
    page.account.set({ id: '900', username: 'reader' } as Account);
    page.loadStatuses('900');
    http.expectOne((r) => r.url === '/api/v1/accounts/900/statuses').flush(posts(100, 20));
    expect(page.statuses()).toHaveLength(20);

    page.loadMore();
    const older = http.expectOne((r) => r.url === '/api/v1/accounts/900/statuses');
    expect(older.request.params.get('max_id')).toBe('81');
    older.flush(posts(80, 20));
    expect(page.statuses()).toHaveLength(40);
    expect(accountPosts).not.toHaveBeenCalled();
    expect(fetchAccountPage).not.toHaveBeenCalled();
    localStorage.clear();
  });
});
