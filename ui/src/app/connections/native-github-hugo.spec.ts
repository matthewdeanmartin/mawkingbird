import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PLATFORM_CONNECTORS, PLATFORM_HUGO } from '../platform/http/platform-http';
import { GitHubSession } from './github/github-session';
import { HugoSettings } from './hugo/hugo-settings';
import { HugoContents, decodeBase64 } from './hugo/hugo-contents';
import { HugoPublish } from './hugo/hugo-publish';
import { VaultBridge } from './vault/vault-bridge';
import { Account } from '../platform/api/models';
const githubHandle = 'native-connector:' + 'g'.repeat(43);
const hugoHandle = 'native-hugo:' + 'h'.repeat(43);
const github = { connect: vi.fn(), request: vi.fn(), forget: vi.fn() };
const hugo = { connect: vi.fn(), request: vi.fn(), forget: vi.fn() };
const vault = {
  readThrough: vi.fn(),
  writeThrough: vi.fn(),
  removeThrough: vi.fn(),
  verdictFor: vi.fn(),
};
const repo = {
  owner: 'writer',
  repo: 'blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: 'https://example.com',
};
const response = (body: unknown, status = 200) => ({
  status,
  headers: {},
  body: JSON.stringify(body),
});
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('Browser fetch is forbidden in this test')),
  );
  github.connect.mockResolvedValue(githubHandle);
  github.forget.mockResolvedValue(undefined);
  github.request.mockImplementation(async (input: { url: string; body?: { operation: string } }) =>
    input.url.endsWith('/user')
      ? response({
          login: 'writer',
          name: 'Writer',
          avatar_url: '',
          html_url: 'https://github.com/writer',
        })
      : input.url.endsWith('/graphql')
        ? response({
            data: {
              viewer:
                input.body?.operation === 'following'
                  ? { following: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }
                  : {
                      starredRepositories: {
                        nodes: [],
                        pageInfo: { hasNextPage: false, endCursor: null },
                      },
                    },
            },
          })
        : response([]),
  );
  hugo.connect.mockResolvedValue({ handle: hugoHandle, looksLikeHugo: true, postCount: 1 });
  hugo.forget.mockResolvedValue(undefined);
  hugo.request.mockResolvedValue(
    response(
      {
        content: {
          path: 'content/posts/hello.md',
          sha: 'a'.repeat(40),
          html_url: 'https://github.com/writer/blog',
        },
        commit: { sha: 'b'.repeat(40) },
      },
      201,
    ),
  );
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_CONNECTORS, useValue: github },
      { provide: PLATFORM_HUGO, useValue: hugo },
      { provide: VaultBridge, useValue: vault },
    ],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('keeps the GitHub read credential in Rust and sends only fixed GraphQL operations', async () => {
  const session = TestBed.inject(GitHubSession);
  await session.connect('reader-secret');
  await session.runProof();
  await session.followedUsers('cursor');
  await session.starredRepositoryOwners();
  expect(github.request).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'github',
      method: 'POST',
      handle: githubHandle,
      body: { operation: 'following', cursor: 'cursor' },
    }),
  );
  expect(github.request).toHaveBeenCalledWith(
    expect.objectContaining({ body: { operation: 'starred', cursor: null } }),
  );
  expect(JSON.stringify(localStorage)).not.toContain('reader-secret');
  expect(JSON.stringify(localStorage)).toContain(githubHandle);
  expect(session.expiresAt()).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  await session.syncToVault();
  expect(vault.writeThrough).not.toHaveBeenCalled();
});
it('retains the GitHub connection on OS deletion failure and clears fetched data on success', async () => {
  const session = TestBed.inject(GitHubSession);
  await session.connect('reader-secret');
  await session.runProof();
  github.forget.mockRejectedValueOnce(new Error('OS locked'));
  await expect(session.disconnect()).rejects.toThrow('OS locked');
  expect(session.connected()).toBe(true);
  await session.disconnect();
  expect(session.connected()).toBe(false);
  expect(session.notifications()).toBeNull();
  expect(session.following()).toBeNull();
});
it('validates Hugo before storing only a handle, skips cloud expiry, and keeps POSSE deferred', async () => {
  const settings = TestBed.inject(HugoSettings);
  hugo.connect.mockRejectedValueOnce(new Error('Wrong branch'));
  await expect(settings.connectNative('blog-secret', repo)).rejects.toThrow('Wrong branch');
  expect(settings.connected()).toBe(false);
  await settings.connectNative('blog-secret', { ...repo, posse: true });
  expect(settings.token()).toBe(hugoHandle);
  expect(settings.posseEnabled()).toBe(false);
  expect(JSON.stringify(localStorage)).not.toContain('blog-secret');
  expect(settings.expiresAt()).toBeNull();
  await settings.syncToVault();
  await settings.reconcileVault();
  expect(vault.writeThrough).not.toHaveBeenCalled();
  expect(vault.readThrough).not.toHaveBeenCalled();
  hugo.forget.mockRejectedValueOnce(new Error('OS locked'));
  await expect(settings.disconnectNative()).rejects.toThrow('OS locked');
  expect(settings.connected()).toBe(true);
  await settings.disconnectNative();
  expect(settings.connected()).toBe(false);
});
it('passes Unicode Markdown and optimistic-update SHA through the native Contents boundary', async () => {
  await TestBed.inject(HugoSettings).connectNative('blog-secret', repo);
  const contents = TestBed.inject(HugoContents);
  const sha = 'a'.repeat(40);
  await contents.putFile({
    path: 'content/posts/hello.md',
    text: '# Hello 世界 👋',
    message: 'Update',
    sha,
  });
  const input = hugo.request.mock.lastCall![0];
  expect(input).toMatchObject({
    handle: hugoHandle,
    url: 'https://api.github.com/repos/writer/blog/contents/content/posts/hello.md',
    method: 'PUT',
    body: { branch: 'main', sha, message: 'Update' },
  });
  expect(decodeBase64(input.body.content)).toBe('# Hello 世界 👋');
  expect(JSON.stringify(input)).not.toContain('blog-secret');
  expect(fetch).not.toHaveBeenCalled();
  hugo.request.mockResolvedValue(response({ workflow_runs: [] }));
  await contents.recentRuns();
  expect(hugo.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'GET',
      url: 'https://api.github.com/repos/writer/blog/actions/runs?branch=main&per_page=10',
    }),
  );
});
it('does not repeat native Hugo creates on an HTTP 422 or uncertain network result', async () => {
  await TestBed.inject(HugoSettings).connectNative('blog-secret', repo);
  const publish = TestBed.inject(HugoPublish);
  const input = { title: 'Hello', body: 'Markdown', isDraft: false, account: {} as Account };
  hugo.request.mockResolvedValue(response({ message: 'Validation failed' }, 422));
  await expect(publish.publish(input)).rejects.toThrow();
  expect(hugo.request).toHaveBeenCalledTimes(1);
  hugo.request.mockClear().mockRejectedValue(new Error('Response lost'));
  await expect(publish.publish(input)).rejects.toThrow('Response lost');
  expect(hugo.request).toHaveBeenCalledTimes(1);
});
