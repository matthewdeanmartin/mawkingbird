import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../platform/api/models';
import { Api } from '../platform/api/api';
import { Auth } from '../platform/session/auth';
import { AnonymousPublicApi } from '../accounts/anonymous/anonymous-public-api';
import { BlogSource, pagingId, parseBlogHandle } from './blog-source';

const alice = { id: '7', acct: 'alice', url: 'https://far.example/@alice' } as Account;

describe('parseBlogHandle', () => {
  it('needs a user and a server', () => {
    expect(parseBlogHandle('@alice@Far.Example')).toEqual({ user: 'alice', host: 'far.example' });
    expect(parseBlogHandle(' alice@far.example ')).toEqual({ user: 'alice', host: 'far.example' });
    expect(parseBlogHandle('@alice')).toBeNull();
    expect(parseBlogHandle('alice@localhost')).toBeNull();
    expect(parseBlogHandle('a@b@c.example')).toBeNull();
    expect(parseBlogHandle('alice@far.example/x')).toBeNull();
  });
});

describe('pagingId', () => {
  it("pages a home-server post by the server's own id", () => {
    const read = {
      id: 'anonymous-mastodon:far.example:99',
      provider: 'anonymous-mastodon',
      providerRef: { server: 'https://far.example', statusId: '99', accountId: '7' },
    } as Status;
    expect(pagingId(read)).toBe('99');
    expect(pagingId({ id: '42' } as Status)).toBe('42');
  });
});

describe('BlogSource', () => {
  const publicApi = {
    lookupAccount: vi.fn(),
    getAccountStatuses: vi.fn(),
    getStatus: vi.fn(),
    getContext: vi.fn(),
  };
  const api = {
    lookupAccount: vi.fn(),
    getAccountStatuses: vi.fn(),
    search: vi.fn(),
    getContext: vi.fn(),
  };
  let signedIn = false;

  beforeEach(() => {
    vi.resetAllMocks();
    signedIn = false;
    TestBed.configureTestingModule({
      providers: [
        { provide: AnonymousPublicApi, useValue: publicApi },
        { provide: Api, useValue: api },
        {
          provide: Auth,
          useValue: {
            get lacksMastodonToken() {
              return !signedIn;
            },
            account: signal<Account | null>({
              id: '1',
              acct: 'me',
              url: 'https://home.example/@me',
            } as Account),
          },
        },
      ],
    });
  });

  it("reads from the author's own server first", async () => {
    publicApi.lookupAccount.mockReturnValue(of(alice));
    publicApi.getAccountStatuses.mockReturnValue(of([]));
    const source = TestBed.inject(BlogSource);
    const author = await source.resolve('@alice@far.example');
    expect(publicApi.lookupAccount).toHaveBeenCalledWith('https://far.example', 'alice');
    expect(author).toMatchObject({ handle: 'alice@far.example', via: 'home' });
    expect(author.ref).toEqual({
      server: 'https://far.example',
      id: '7',
      originalUrl: 'https://far.example/@alice',
    });
    await source.page(author, '99');
    expect(publicApi.getAccountStatuses).toHaveBeenCalledWith(author.ref, {
      excludeReblogs: true,
      limit: 40,
      maxId: '99',
    });
    expect(api.getAccountStatuses).not.toHaveBeenCalled();
  });

  it('falls back to your own server when signed in', async () => {
    signedIn = true;
    publicApi.lookupAccount.mockReturnValue(throwError(() => new Error('401')));
    api.lookupAccount.mockReturnValue(of({ ...alice, id: '555' }));
    api.getAccountStatuses.mockReturnValue(of([]));
    const source = TestBed.inject(BlogSource);
    const author = await source.resolve('alice@far.example');
    expect(author.via).toBe('local');
    expect(api.lookupAccount).toHaveBeenCalledWith('alice@far.example');
    await source.page(author);
    expect(api.getAccountStatuses).toHaveBeenCalledWith('555', { excludeReblogs: true, limit: 40 });
  });

  it('gives up without a session when the home server refuses', async () => {
    publicApi.lookupAccount.mockReturnValue(throwError(() => new Error('401')));
    await expect(TestBed.inject(BlogSource).resolve('alice@far.example')).rejects.toThrow('401');
    expect(api.lookupAccount).not.toHaveBeenCalled();
  });

  it('refuses a handle without a server', async () => {
    await expect(TestBed.inject(BlogSource).resolve('@alice')).rejects.toThrow('not-a-handle');
  });

  it("reads a post's thread from the home server, in thread order", async () => {
    const ref = { server: 'https://far.example', id: '7' };
    const home = { handle: 'alice@far.example', account: alice, via: 'home' as const, ref };
    publicApi.getStatus.mockReturnValue(of({ id: 's' }));
    publicApi.getContext.mockReturnValue(
      of({ ancestors: [{ id: 'a' }], descendants: [{ id: 'd' }] }),
    );
    const { status, thread } = await TestBed.inject(BlogSource).thread(home, '113');
    expect(publicApi.getStatus).toHaveBeenCalledWith({ server: 'https://far.example', id: '113' });
    expect(status.id).toBe('s');
    expect(thread.map((s) => s.id)).toEqual(['a', 's', 'd']);
  });

  it('finds the post by its address on your own server', async () => {
    const local = { handle: 'alice@far.example', account: alice, via: 'local' as const };
    api.search.mockReturnValue(of({ statuses: [{ id: 'L1' }], accounts: [], hashtags: [] }));
    api.getContext.mockReturnValue(of({ ancestors: [], descendants: [] }));
    const { thread } = await TestBed.inject(BlogSource).thread(local, '113');
    expect(api.search).toHaveBeenCalledWith('https://far.example/@alice/113', 'statuses', {
      resolve: true,
      limit: 1,
    });
    expect(api.getContext).toHaveBeenCalledWith('L1');
    expect(thread.map((s) => s.id)).toEqual(['L1']);
  });

  it('remembers the last list per handle, ignoring case', () => {
    const source = TestBed.inject(BlogSource);
    expect(source.remembered('alice@far.example')).toBeNull();
    source.remember('Alice@Far.Example', []);
    expect(source.remembered('alice@far.example')).toEqual([]);
  });

  it('knows your own handle only with a Mastodon session', () => {
    const source = TestBed.inject(BlogSource);
    expect(source.ownHandle()).toBeNull();
    signedIn = true;
    expect(source.ownHandle()).toBe('me@home.example');
  });
});
