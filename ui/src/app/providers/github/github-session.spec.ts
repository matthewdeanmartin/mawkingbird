import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubSession } from './github-session';
import { gitHubConnectionStored, storedGitHubToken } from '../../testing/seed-storage';

const USER = {
  login: 'octocat',
  avatar_url: 'https://avatars.example/octocat',
  html_url: 'https://github.com/octocat',
  name: 'The Octocat',
};

describe('GitHubSession', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('validates and stores a classic token without exposing it through public state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(USER), { status: 200 }),
    );
    const session = TestBed.inject(GitHubSession);

    await session.connect(' ghp_secret ');

    expect(session.connected()).toBe(true);
    expect(session.user()?.login).toBe('octocat');
    expect(storedGitHubToken()).toBe('ghp_secret');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_secret' }),
      }),
    );
  });

  it('does not store a token rejected by GitHub', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }),
    );
    const session = TestBed.inject(GitHubSession);

    await expect(session.connect('bad-token')).rejects.toThrow('GitHub rejected that token');

    expect(session.connected()).toBe(false);
    expect(gitHubConnectionStored()).toBe(false);
  });

  it('proves notification and following API calls work directly from the browser', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(USER), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'notification-1' }]), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([USER]), { status: 200 }));
    const session = TestBed.inject(GitHubSession);
    await session.connect('ghp_secret');

    await session.runProof();

    expect(session.notifications()).toHaveLength(1);
    expect(session.following()?.[0].login).toBe('octocat');
  });

  it('loads followed-user profile clues through one GraphQL page', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(USER), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                following: {
                  nodes: [
                    {
                      login: 'friend',
                      name: 'Friend',
                      avatarUrl: 'https://avatars.example/friend',
                      url: 'https://github.com/friend',
                      bio: null,
                      websiteUrl: 'https://social.example/@friend',
                      socialAccounts: { nodes: [] },
                    },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: 'next-page' },
                },
              },
            },
          }),
          { status: 200 },
        ),
      );
    const session = TestBed.inject(GitHubSession);
    await session.connect('ghp_secret');

    const page = await session.followedUsers(null);

    expect(page.users[0].login).toBe('friend');
    expect(page).toMatchObject({ hasNextPage: true, endCursor: 'next-page' });
    expect(fetch).toHaveBeenLastCalledWith(
      'https://api.github.com/graphql',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"cursor":null'),
      }),
    );
  });

  it('loads only repository owners from starred repositories', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(USER), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                starredRepositories: {
                  nodes: [
                    {
                      nameWithOwner: 'owner/project',
                      url: 'https://github.com/owner/project',
                      description: 'A useful project',
                      owner: {
                        login: 'owner',
                        name: 'Owner',
                        avatarUrl: 'https://avatars.example/owner',
                        url: 'https://github.com/owner',
                        bio: null,
                        websiteUrl: 'https://social.example/@owner',
                        socialAccounts: { nodes: [] },
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: 'next-stars' },
                },
              },
            },
          }),
          { status: 200 },
        ),
      );
    const session = TestBed.inject(GitHubSession);
    await session.connect('ghp_secret');

    const page = await session.starredRepositoryOwners(null);

    expect(page.owners.map((owner) => owner.profile.login)).toEqual(['owner']);
    expect(page.owners[0].repositories).toEqual([
      {
        nameWithOwner: 'owner/project',
        url: 'https://github.com/owner/project',
        description: 'A useful project',
      },
    ]);
    expect(page).toMatchObject({
      repositoryCount: 1,
      hasNextPage: true,
      endCursor: 'next-stars',
    });
    const request = vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit;
    expect(request.body).toContain('starredRepositories');
    expect(request.body).toContain('owner');
    expect(request.body).not.toContain('contributors');
  });

  it('disconnects and forgets all proof data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(USER), { status: 200 }),
    );
    const session = TestBed.inject(GitHubSession);
    await session.connect('ghp_secret');

    session.disconnect();

    expect(session.connected()).toBe(false);
    expect(session.user()).toBeNull();
    expect(gitHubConnectionStored()).toBe(false);
  });
});
