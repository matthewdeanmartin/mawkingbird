import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBase64 } from './hugo-contents';
import { HugoPosts } from './hugo-posts';
import { HugoRepo, HugoSettings } from './hugo-settings';

const REPO: HugoRepo = {
  owner: 'mistersql',
  repo: 'my-blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: null,
  includeInProfile: false,
};

function dirEntry(name: string, sha = `sha-${name}`) {
  return { name, path: `content/posts/${name}`, sha, size: 10, type: 'file' as const };
}

function file(text: string, sha: string): Response {
  return new Response(JSON.stringify({ content: encodeBase64(text), sha }), { status: 200 });
}

function post(title: string, date = '2026-08-05T00:00:00Z', draft = false): string {
  return `+++\ntitle = "${title}"\ndate = ${date}\ndraft = ${draft}\n+++\n\nThe body of ${title}.\n`;
}

/** Route each GitHub URL to a canned response, so order does not matter. */
function routeGitHub(routes: { dir?: unknown; files?: Record<string, Response> }): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith('https://api.github.com/')) {
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    for (const [name, response] of Object.entries(routes.files ?? {})) {
      if (url.includes(name)) {
        return Promise.resolve(response.clone());
      }
    }
    return Promise.resolve(new Response(JSON.stringify(routes.dir ?? []), { status: 200 }));
  });
}

function fileReads(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map((call) => String(call[0]))
    .filter((url) => url.includes('/contents/content/posts/') && url.endsWith('?ref=main'));
}

function connect(): HugoPosts {
  TestBed.inject(HugoSettings).connect('tok', REPO);
  return TestBed.inject(HugoPosts);
}

describe('HugoPosts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // restoreAllMocks puts the original `fetch` back but does not clear the
    // call log of a spy a previous test installed on it. Both are needed, or
    // call counts leak forward between tests.
    vi.clearAllMocks();
  });

  it('lists only the markdown posts, newest first', async () => {
    routeGitHub({
      dir: [
        dirEntry('2020-01-01-old.md'),
        dirEntry('hero.png'),
        dirEntry('_index.md'),
        dirEntry('2026-01-01-new.md'),
      ],
      files: {
        'old.md': file(post('Old post', '2020-01-01T00:00:00Z'), 'sha-old'),
        'new.md': file(post('New post', '2026-01-01T00:00:00Z'), 'sha-new'),
      },
    });
    const posts = connect();

    await posts.load();

    expect(posts.rows().map((row) => row.title)).toEqual(['New post', 'Old post']);
  });

  it('reads front matter for the listed posts and marks them hydrated', async () => {
    routeGitHub({
      dir: [dirEntry('hello-world.md')],
      files: { 'hello-world.md': file(post('A Much Better Title'), 'blob-1') },
    });
    const posts = connect();

    await posts.load();

    expect(posts.rows()[0]).toMatchObject({
      title: 'A Much Better Title',
      source: 'front-matter',
      sha: 'blob-1',
    });
  });

  it('never opens more than the hydration budget in one pass', async () => {
    const entries = Array.from({ length: 100 }, (_, i) => dirEntry(`post-${i}.md`));
    routeGitHub({ dir: entries, files: { 'post-': file(post('X'), 'blob') } });
    const posts = connect();

    await posts.load();

    // A 400-post blog must not fire 400 requests to draw one page.
    expect(fileReads()).toHaveLength(20);
    expect(posts.hasMoreToHydrate()).toBe(true);
  });

  it('opens the next batch on demand', async () => {
    const entries = Array.from({ length: 30 }, (_, i) => dirEntry(`post-${i}.md`));
    routeGitHub({ dir: entries, files: { 'post-': file(post('X'), 'blob') } });
    const posts = connect();
    await posts.load();

    await posts.hydrate();

    expect(fileReads()).toHaveLength(30);
    expect(posts.hasMoreToHydrate()).toBe(false);
  });

  it('keeps a row on its filename guess when that one file cannot be read', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/contents/content/posts/broken.md')) {
        return Promise.resolve(
          new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
        );
      }
      if (url.includes('/contents/content/posts/fine.md')) {
        return Promise.resolve(file(post('Fine post'), 'blob'));
      }
      return Promise.resolve(
        new Response(JSON.stringify([dirEntry('broken.md'), dirEntry('fine.md')]), { status: 200 }),
      );
    });
    const posts = connect();

    await posts.load();

    // One unreadable post does not blank out a working list, and does not
    // become a page-level error.
    expect(posts.error()).toBeNull();
    expect(
      posts
        .rows()
        .map((r) => r.source)
        .sort(),
    ).toEqual(['filename', 'front-matter']);
  });

  it('reports a missing content folder as a page error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
    );
    const posts = connect();

    await posts.load();

    expect(posts.rows()).toHaveLength(0);
    expect(posts.error()).toContain('cannot find');
  });

  it('refuses to list with no repository connected', async () => {
    const posts = TestBed.inject(HugoPosts);

    await posts.load();

    expect(posts.error()).toContain('Settings');
  });

  describe('open', () => {
    it('re-reads the file and returns the current sha', async () => {
      routeGitHub({
        dir: [dirEntry('hello.md', 'stale-sha')],
        files: { 'hello.md': file(post('Hello'), 'fresh-sha') },
      });
      const posts = connect();
      await posts.load();

      const opened = await posts.open('content/posts/hello.md');

      expect(opened.sha).toBe('fresh-sha');
      expect(opened.parsed.title).toBe('Hello');
      expect(opened.parsed.body).toBe('The body of Hello.');
      // The row is corrected too, so a later edit does not send a sha we
      // already know is out of date.
      expect(posts.rows()[0].sha).toBe('fresh-sha');
    });

    it('surfaces a read failure rather than returning a half-post', async () => {
      routeGitHub({
        dir: [dirEntry('hello.md')],
        files: {
          'hello.md': new Response(JSON.stringify({ message: 'Conflict' }), { status: 409 }),
        },
      });
      const posts = connect();
      await posts.load();

      await expect(posts.open('content/posts/hello.md')).rejects.toThrow(/changed on GitHub/);
    });
  });

  it('forgets everything on reset', async () => {
    routeGitHub({ dir: [dirEntry('hello.md')], files: { 'hello.md': file(post('Hello'), 'b') } });
    const posts = connect();
    await posts.load();

    posts.reset();

    expect(posts.rows()).toHaveLength(0);
    expect(posts.error()).toBeNull();
  });
});
