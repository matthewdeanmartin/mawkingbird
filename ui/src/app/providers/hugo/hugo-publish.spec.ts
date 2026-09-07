import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../models';
import { decodeBase64 } from './hugo-contents';
import { HugoEdit } from './hugo-edit-session';
import { parseFrontMatter } from './hugo-front-matter';
import { HugoPublish } from './hugo-publish';
import { HugoRepo, HugoSettings } from './hugo-settings';

const REPO: HugoRepo = {
  owner: 'mistersql',
  repo: 'my-blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: 'https://mistersql.github.io/my-blog/',
  includeInProfile: false,
};

const ACCOUNT = { id: '1', acct: 'mistersql', username: 'mistersql' } as Account;

function created(status = 200): Response {
  return new Response(
    JSON.stringify({
      content: { path: 'content/posts/x.md', sha: 'blob', html_url: 'https://github.com/file' },
      commit: { sha: 'commit-abc' },
    }),
    { status },
  );
}

function conflict(): Response {
  return new Response(JSON.stringify({ message: 'already exists' }), { status: 422 });
}

/**
 * Only the commits this connector made.
 *
 * Two things pollute a positional index into `mock.calls`: TestBed construction
 * fires unrelated fetches of its own (the bundled server list, joinmastodon's
 * directory), and reads share the mock with writes. Filtering to GitHub `PUT`s
 * is the stable way to ask "what did we actually publish".
 */
function githubCalls(): [string, RequestInit][] {
  return vi
    .mocked(fetch)
    .mock.calls.filter(
      (call): call is [string, RequestInit] =>
        typeof call[0] === 'string' &&
        call[0].startsWith('https://api.github.com/') &&
        (call[1] as RequestInit | undefined)?.method === 'PUT',
    );
}

/** The file body sent on the Nth GitHub call. */
function sentFile(call = 0): string {
  const [, init] = githubCalls()[call];
  return decodeBase64(JSON.parse(init.body as string).content);
}

function sentPath(call = 0): string {
  return githubCalls()[call][0];
}

function connect(): HugoPublish {
  TestBed.inject(HugoSettings).connect('github_pat_secret', REPO);
  return TestBed.inject(HugoPublish);
}

describe('HugoPublish', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // restoreAllMocks puts the original `fetch` back but does not clear the
    // call log of a spy a previous test installed on it, so counts leak
    // forward. Both are needed.
    vi.clearAllMocks();
  });

  it('commits a post with TOML front matter and returns a blog Status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
    const publish = connect();

    const result = await publish.publish({
      title: 'Hello World',
      body: 'First post. #hugo',
      isDraft: false,
      account: ACCOUNT,
    });

    const parsed = parseFrontMatter(sentFile());
    expect(parsed.format).toBe('toml');
    expect(parsed.title).toBe('Hello World');
    expect(parsed.draft).toBe(false);
    expect(parsed.tags).toEqual(['hugo']);
    expect(parsed.body).toBe('First post. #hugo');

    expect(sentPath()).toContain('/contents/content/posts/hello-world.md');
    expect(result.slug).toBe('hello-world');
    expect(result.renamed).toBe(false);
    // Exposed so the caller can watch the build without unpacking `status`.
    expect(result.commit.commitSha).toBe('commit-abc');
    expect(result.status.id).toBe('blog:hugo:hello-world');
    expect(result.status.provider).toBe('blog');
    expect(result.status.url).toBe('https://mistersql.github.io/my-blog/posts/hello-world/');
    expect(result.status.providerRef).toMatchObject({
      providerId: 'hugo',
      commitSha: 'commit-abc',
      contentSha: 'blob',
    });
  });

  it('marks a draft in front matter and keeps it out of public visibility', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
    const publish = connect();

    const result = await publish.publish({
      title: 'Half finished',
      body: 'Notes.',
      isDraft: true,
      account: ACCOUNT,
    });

    expect(parseFrontMatter(sentFile()).draft).toBe(true);
    expect(result.status.visibility).toBe('private');
  });

  it('links to the file on GitHub when no site address is configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
    TestBed.inject(HugoSettings).connect('t', { ...REPO, siteUrl: null });

    const result = await TestBed.inject(HugoPublish).publish({
      title: 'Hello',
      body: 'x',
      isDraft: false,
      account: ACCOUNT,
    });

    expect(result.status.url).toBe('https://github.com/file');
  });

  it('retries a colliding slug with a numbered suffix and says so', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(created());
    const publish = connect();

    const result = await publish.publish({
      title: 'Hello World',
      body: 'Again.',
      isDraft: false,
      account: ACCOUNT,
    });

    expect(sentPath(0)).toContain('hello-world.md');
    expect(sentPath(1)).toContain('hello-world-2.md');
    expect(result.slug).toBe('hello-world-2');
    expect(result.renamed).toBe(true);
  });

  it('gives up after three collisions rather than looping', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(conflict());
    const publish = connect();

    await expect(
      publish.publish({ title: 'Hello', body: 'x', isDraft: false, account: ACCOUNT }),
    ).rejects.toThrow(/already posts named/);

    expect(githubCalls()).toHaveLength(3);
  });

  it('does not retry an error that is not a collision', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }),
    );
    const publish = connect();

    await expect(
      publish.publish({ title: 'Hello', body: 'x', isDraft: false, account: ACCOUNT }),
    ).rejects.toThrow(/rejected that token/);

    expect(githubCalls()).toHaveLength(1);
  });

  it('refuses an empty title or body before making any request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
    const publish = connect();

    await expect(
      publish.publish({ title: '  ', body: 'x', isDraft: false, account: ACCOUNT }),
    ).rejects.toThrow(/title/i);
    await expect(
      publish.publish({ title: 'Hello', body: '  ', isDraft: false, account: ACCOUNT }),
    ).rejects.toThrow(/publish/i);

    expect(githubCalls()).toHaveLength(0);
  });

  it('refuses to publish with no repository connected', async () => {
    const publish = TestBed.inject(HugoPublish);

    await expect(
      publish.publish({ title: 'Hello', body: 'x', isDraft: false, account: ACCOUNT }),
    ).rejects.toThrow(/Settings/);
  });

  it('survives a title that slugifies to nothing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
    const publish = connect();

    const result = await publish.publish({
      title: '日本語のタイトル',
      body: 'Body.',
      isDraft: false,
      account: ACCOUNT,
    });

    expect(result.slug).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{4}$/);
    // The title itself survives intact in the front matter even though the
    // slug could not be derived from it.
    expect(parseFrontMatter(sentFile()).title).toBe('日本語のタイトル');
  });

  describe('update', () => {
    const EDIT: HugoEdit = {
      path: 'content/posts/hello-world.md',
      sha: 'blob-1',
      format: 'toml',
      date: '2020-03-04T05:06:07Z',
      extraLines: ['weight = 5', 'categories = ["dev"]', '[params]', 'hero = "img.png"'],
      originalTitle: 'Hello World',
    };

    it('writes back to the same path with the sha, and keeps the slug', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
      const publish = connect();

      const result = await publish.update({
        title: 'Hello World',
        body: 'Revised body.',
        isDraft: false,
        edit: EDIT,
      });

      expect(sentPath()).toContain('/contents/content/posts/hello-world.md');
      const [, init] = githubCalls()[0];
      expect(JSON.parse(init.body as string).sha).toBe('blob-1');
      expect(result.slug).toBe('hello-world');
    });

    it('does not move the file when the title changes, so the URL survives', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
      const publish = connect();

      const result = await publish.update({
        title: 'A Completely Different Title',
        body: 'x',
        isDraft: false,
        edit: EDIT,
      });

      // Renaming a live post breaks every link to it.
      expect(sentPath()).toContain('hello-world.md');
      expect(sentPath()).not.toContain('a-completely-different-title');
      expect(result.slug).toBe('hello-world');
      expect(parseFrontMatter(sentFile()).title).toBe('A Completely Different Title');
    });

    it('keeps the original publish date rather than restamping it', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
      const publish = connect();

      await publish.update({ title: 'Hello World', body: 'x', isDraft: false, edit: EDIT });

      // Restamping would reorder the whole blog on the next build.
      expect(parseFrontMatter(sentFile()).date).toBe('2020-03-04T05:06:07Z');
    });

    it('carries every unmodelled front-matter key through untouched', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
      const publish = connect();

      await publish.update({ title: 'Hello World', body: 'x', isDraft: false, edit: EDIT });

      const file = sentFile();
      for (const survivor of EDIT.extraLines) {
        expect(file).toContain(survivor);
      }
    });

    it('rewrites a YAML post as YAML, never converting it to TOML', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
      const publish = connect();

      await publish.update({
        title: 'Hello World',
        body: 'x',
        isDraft: false,
        edit: { ...EDIT, format: 'yaml', extraLines: ['layout: special'] },
      });

      const file = sentFile();
      expect(file.startsWith('---\n')).toBe(true);
      expect(file).not.toContain('+++');
      expect(file).toContain('layout: special');
    });

    it('can publish a draft by clearing the flag', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
      const publish = connect();

      await publish.update({ title: 'Hello World', body: 'x', isDraft: false, edit: EDIT });

      expect(parseFrontMatter(sentFile()).draft).toBe(false);
    });

    it('lets a 409 through so the caller can explain the concurrent edit', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'Conflict' }), { status: 409 }),
      );
      const publish = connect();

      await expect(
        publish.update({ title: 'Hello World', body: 'x', isDraft: false, edit: EDIT }),
      ).rejects.toThrow(/changed on GitHub/);

      // Never retried: retrying a 409 is how you overwrite someone's work.
      expect(githubCalls()).toHaveLength(1);
    });

    it('refuses an empty title or body before making any request', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(created());
      const publish = connect();

      await expect(
        publish.update({ title: ' ', body: 'x', isDraft: false, edit: EDIT }),
      ).rejects.toThrow(/title/i);
      await expect(
        publish.update({ title: 'Hello', body: ' ', isDraft: false, edit: EDIT }),
      ).rejects.toThrow(/publish/i);

      expect(githubCalls()).toHaveLength(0);
    });
  });
});
