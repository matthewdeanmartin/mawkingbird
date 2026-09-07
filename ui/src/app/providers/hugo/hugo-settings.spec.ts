import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HugoRepo, HugoSettings, normalizeSiteUrl, parseRepoInput } from './hugo-settings';

const REPO: HugoRepo = {
  owner: 'mistersql',
  repo: 'my-blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: 'https://mistersql.github.io/my-blog/',
  includeInProfile: false,
};

describe('HugoSettings', () => {
  beforeEach(() => localStorage.clear());

  it('splits the token from the repo coordinates across two keys', () => {
    const settings = TestBed.inject(HugoSettings);
    settings.connect('github_pat_secret', REPO);

    expect(settings.connected()).toBe(true);
    expect(settings.slug()).toBe('mistersql/my-blog');
    expect(localStorage.getItem('mockingbird_hugo_credentials')).toContain('github_pat_secret');
    // The exportable half must never carry the secret.
    expect(localStorage.getItem('mockingbird_hugo_repo')).not.toContain('github_pat_secret');
  });

  it('normalizes the content path on the way in', () => {
    const settings = TestBed.inject(HugoSettings);
    settings.connect('t', { ...REPO, contentPath: '/content/posts/' });

    expect(settings.repo()?.contentPath).toBe('content/posts');
  });

  it('derives the Hugo default feed URL from the site address', () => {
    const settings = TestBed.inject(HugoSettings);
    settings.connect('t', REPO);

    expect(settings.feedUrl()).toBe('https://mistersql.github.io/my-blog/index.xml');
  });

  it('prefers a discovered feed URL over the Hugo default', () => {
    const settings = TestBed.inject(HugoSettings);
    settings.connect('t', REPO);

    settings.setFeedUrl('https://mistersql.github.io/my-blog/feed.xml');

    // A theme can move the feed, so what a probe actually found beats the guess.
    expect(settings.feedUrl()).toBe('https://mistersql.github.io/my-blog/feed.xml');
    expect(settings.repo()?.owner).toBe('mistersql');
  });

  it('falls back to the default when no probe has run yet', () => {
    const settings = TestBed.inject(HugoSettings);
    settings.connect('t', REPO);

    expect(settings.feedUrl()).toBe('https://mistersql.github.io/my-blog/index.xml');
  });

  it('has no feed URL when the site address was left blank', () => {
    const settings = TestBed.inject(HugoSettings);
    settings.connect('t', { ...REPO, siteUrl: null });

    expect(settings.feedUrl()).toBeNull();
    // Publishing must still be possible without one.
    expect(settings.connected()).toBe(true);
  });

  it('rejects an empty token', () => {
    const settings = TestBed.inject(HugoSettings);

    expect(() => settings.connect('   ', REPO)).toThrow(/token/i);
  });

  it('toggles the profile opt-in without touching the credential', () => {
    const settings = TestBed.inject(HugoSettings);
    settings.connect('github_pat_secret', REPO);
    settings.setIncludeInProfile(true);

    expect(settings.includeInProfile()).toBe(true);
    expect(settings.token()).toBe('github_pat_secret');
  });

  it('reads a repo with no token back as not connected', () => {
    localStorage.setItem('mockingbird_hugo_repo', JSON.stringify(REPO));
    const settings = TestBed.inject(HugoSettings);

    expect(settings.repo()).not.toBeNull();
    expect(settings.connected()).toBe(false);
    expect(settings.token()).toBeNull();
  });

  it('defaults a stored repo that predates the branch and path fields', () => {
    localStorage.setItem('mockingbird_hugo_repo', JSON.stringify({ owner: 'a', repo: 'b' }));
    const settings = TestBed.inject(HugoSettings);

    expect(settings.repo()?.branch).toBe('main');
    expect(settings.repo()?.contentPath).toBe('content/posts');
  });

  it('drops only the token when the credential ages out, keeping the repo', () => {
    localStorage.setItem('mockingbird_credential_lifetime', '30d');
    localStorage.setItem('mockingbird_hugo_repo', JSON.stringify(REPO));
    localStorage.setItem(
      'mockingbird_hugo_credentials',
      JSON.stringify({ accessToken: 't', connectedAt: Date.now() - 40 * 24 * 60 * 60 * 1000 }),
    );

    const settings = TestBed.inject(HugoSettings);
    settings.enforceLifetime();

    expect(settings.token()).toBeNull();
    expect(settings.connected()).toBe(false);
    expect(settings.repo()?.owner).toBe('mistersql');
  });

  it('forgets both halves on disconnect', () => {
    const settings = TestBed.inject(HugoSettings);
    settings.connect('t', REPO);
    settings.disconnect();

    expect(settings.connected()).toBe(false);
    expect(localStorage.getItem('mockingbird_hugo_repo')).toBeNull();
    expect(localStorage.getItem('mockingbird_hugo_credentials')).toBeNull();
  });
});

describe('parseRepoInput', () => {
  it('accepts owner/repo', () => {
    expect(parseRepoInput('mistersql/my-blog')).toEqual({ owner: 'mistersql', repo: 'my-blog' });
  });

  it('accepts a pasted browser URL', () => {
    expect(parseRepoInput('https://github.com/mistersql/my-blog')).toEqual({
      owner: 'mistersql',
      repo: 'my-blog',
    });
  });

  it('accepts a URL with extra path segments and a .git suffix', () => {
    expect(parseRepoInput('https://github.com/mistersql/my-blog/tree/main')).toEqual({
      owner: 'mistersql',
      repo: 'my-blog',
    });
    expect(parseRepoInput('git@github.com:mistersql/my-blog.git')).toEqual({
      owner: 'mistersql',
      repo: 'my-blog',
    });
  });

  it('returns null for something that is not a repo', () => {
    expect(parseRepoInput('my-blog')).toBeNull();
    expect(parseRepoInput('')).toBeNull();
  });
});

describe('normalizeSiteUrl', () => {
  it('returns null for blank, because the field is optional', () => {
    expect(normalizeSiteUrl('  ')).toBeNull();
  });

  it('adds a scheme and a trailing slash', () => {
    expect(normalizeSiteUrl('mistersql.github.io/my-blog')).toBe(
      'https://mistersql.github.io/my-blog/',
    );
  });

  it('strips query and fragment but keeps the path', () => {
    expect(normalizeSiteUrl('https://example.com/blog/?utm=1#top')).toBe(
      'https://example.com/blog/',
    );
  });

  it('rejects a non-http scheme', () => {
    expect(() => normalizeSiteUrl('ftp://example.com')).toThrow(/https/);
  });
});
