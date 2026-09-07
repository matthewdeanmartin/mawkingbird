import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HugoRepo, HugoSettings } from './hugo-settings';
import { HugoValidate } from './hugo-validate';

const CANDIDATE: HugoRepo = {
  owner: 'mistersql',
  repo: 'my-blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: null,
  includeInProfile: false,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const BRANCH_OK = () => json({ name: 'main' });
const POSTS = () =>
  json([
    { name: 'a.md', path: 'content/posts/a.md', sha: 's', size: 1, type: 'file' },
    { name: 'b.md', path: 'content/posts/b.md', sha: 's', size: 1, type: 'file' },
    { name: 'img.png', path: 'content/posts/img.png', sha: 's', size: 1, type: 'file' },
  ]);
const ROOT_WITH_CONFIG = () =>
  json([{ name: 'hugo.toml', path: 'hugo.toml', sha: 's', size: 1, type: 'file' }]);
const NOT_FOUND = () => json({ message: 'Not Found' }, 404);

describe('HugoValidate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // restoreAllMocks puts the original `fetch` back but does not clear the
    // call log of a spy a previous test installed on it. Both are needed, or
    // call counts leak forward between tests.
    vi.clearAllMocks();
  });

  it('accepts a good repo and counts only the markdown posts', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(BRANCH_OK())
      .mockResolvedValueOnce(POSTS())
      .mockResolvedValueOnce(ROOT_WITH_CONFIG());

    const result = await TestBed.inject(HugoValidate).check('tok', CANDIDATE);

    expect(result.ok).toBe(true);
    expect(result.problem).toBeNull();
    expect(result.postCount).toBe(2);
    expect(result.looksLikeHugo).toBe(true);
  });

  it('names the branch when the branch is what is wrong', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(NOT_FOUND());

    const result = await TestBed.inject(HugoValidate).check('tok', {
      ...CANDIDATE,
      branch: 'gh-pages',
    });

    expect(result.ok).toBe(false);
    expect(result.problem).toContain('gh-pages');
  });

  it('names the folder when the content path is what is wrong', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(BRANCH_OK())
      .mockResolvedValueOnce(NOT_FOUND());

    const result = await TestBed.inject(HugoValidate).check('tok', {
      ...CANDIDATE,
      contentPath: 'content/articles',
    });

    expect(result.ok).toBe(false);
    expect(result.problem).toContain('content/articles');
    expect(result.problem).toContain('content/posts');
  });

  it('connects with a warning when no Hugo config is visible', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(BRANCH_OK())
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(
        json([{ name: 'readme.md', path: 'readme.md', sha: 's', size: 1, type: 'file' }]),
      );

    const result = await TestBed.inject(HugoValidate).check('tok', CANDIDATE);

    expect(result.ok).toBe(true);
    expect(result.looksLikeHugo).toBe(false);
    expect(result.postCount).toBe(0);
  });

  it('recognizes a config/ directory as a Hugo layout', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(BRANCH_OK())
      .mockResolvedValueOnce(POSTS())
      .mockResolvedValueOnce(
        json([{ name: 'config', path: 'config', sha: 's', size: 0, type: 'dir' }]),
      );

    const result = await TestBed.inject(HugoValidate).check('tok', CANDIDATE);

    expect(result.looksLikeHugo).toBe(true);
  });

  it('leaves nothing stored when validation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(NOT_FOUND());
    const settings = TestBed.inject(HugoSettings);

    await TestBed.inject(HugoValidate).check('tok', CANDIDATE);

    expect(settings.connected()).toBe(false);
    expect(settings.repo()).toBeNull();
    expect(localStorage.getItem('mockingbird_hugo_credentials')).toBeNull();
  });

  it('restores the previous connection when validating a different repo fails', async () => {
    const settings = TestBed.inject(HugoSettings);
    settings.connect('old-token', CANDIDATE);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(NOT_FOUND());

    await TestBed.inject(HugoValidate).check('new-token', {
      ...CANDIDATE,
      repo: 'other-blog',
    });

    expect(settings.repo()?.repo).toBe('my-blog');
    expect(settings.token()).toBe('old-token');
  });
});
