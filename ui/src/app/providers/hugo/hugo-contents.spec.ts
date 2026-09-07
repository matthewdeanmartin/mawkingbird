import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeBase64, encodeBase64, HugoApiError, HugoContents } from './hugo-contents';
import { HugoRepo, HugoSettings } from './hugo-settings';

const REPO: HugoRepo = {
  owner: 'mistersql',
  repo: 'my-blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: 'https://mistersql.github.io/my-blog/',
  includeInProfile: false,
};

/** Non-ASCII on purpose: this is what `btoa(string)` alone would break on. */
const TRICKY = 'An em—dash, an emoji 🎉, and 日本語 all in one line.';

function connect(): HugoContents {
  TestBed.inject(HugoSettings).connect('github_pat_secret', REPO);
  return TestBed.inject(HugoContents);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/**
 * Only the calls this connector made, optionally narrowed to one method.
 *
 * TestBed construction fires unrelated fetches of its own, and reads share the
 * mock with writes, so a bare positional index into `mock.calls` is unstable.
 */
function githubCalls(method?: string): [string, RequestInit][] {
  return vi
    .mocked(fetch)
    .mock.calls.filter(
      (call): call is [string, RequestInit] =>
        typeof call[0] === 'string' &&
        call[0].startsWith('https://api.github.com/') &&
        (!method || (call[1] as RequestInit | undefined)?.method === method),
    );
}

describe('base64 helpers', () => {
  it('round-trips characters above U+00FF that btoa alone would reject', () => {
    expect(decodeBase64(encodeBase64(TRICKY))).toBe(TRICKY);
  });

  it('decodes the 60-column-wrapped base64 GitHub actually returns', () => {
    const wrapped = encodeBase64(TRICKY).replace(/(.{20})/g, '$1\n');

    expect(decodeBase64(wrapped)).toBe(TRICKY);
  });
});

describe('HugoContents', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // restoreAllMocks puts the original `fetch` back but does not clear the
    // call log of a spy a previous test installed on it. Both are needed, or
    // call counts leak forward between tests.
    vi.clearAllMocks();
  });

  it('refuses to call GitHub with no token stored', async () => {
    const contents = TestBed.inject(HugoContents);

    await expect(contents.readFile('content/posts/a.md')).rejects.toThrow(/Settings/);
  });

  it('reads a file, decoding its content and keeping the sha', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ content: encodeBase64(TRICKY), sha: 'blob-sha' }),
    );
    const contents = connect();

    const file = await contents.readFile('content/posts/hello.md');

    expect(file.text).toBe(TRICKY);
    expect(file.sha).toBe('blob-sha');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/mistersql/my-blog/contents/content/posts/hello.md?ref=main',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer github_pat_secret' }),
      }),
    );
  });

  it('creates a file without a sha, and names the branch in the body not the query', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        content: {
          path: 'content/posts/hello.md',
          sha: 'new-blob',
          html_url: 'https://github.com/x',
        },
        commit: { sha: 'commit-abc' },
      }),
    );
    const contents = connect();

    const result = await contents.putFile({
      path: 'content/posts/hello.md',
      text: TRICKY,
      message: 'Publish: Hello',
    });

    expect(result).toEqual({
      path: 'content/posts/hello.md',
      contentSha: 'new-blob',
      commitSha: 'commit-abc',
      htmlUrl: 'https://github.com/x',
    });

    const [url, init] = githubCalls('PUT')[0];
    expect(url).not.toContain('?ref=');
    const body = JSON.parse(init.body as string);
    expect(body.branch).toBe('main');
    expect(body.sha).toBeUndefined();
    expect(decodeBase64(body.content)).toBe(TRICKY);
  });

  it('sends the sha back when updating', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ content: { sha: 's' }, commit: { sha: 'c' } }),
    );
    const contents = connect();

    await contents.putFile({ path: 'a.md', text: 'x', message: 'm', sha: 'old-blob' });

    const [, init] = githubCalls('PUT')[0];
    expect(JSON.parse(init.body as string).sha).toBe('old-blob');
  });

  it('lists a directory', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        { name: 'a.md', path: 'content/posts/a.md', sha: 's', size: 10, type: 'file' },
      ]),
    );
    const contents = connect();

    await expect(contents.listDirectory('content/posts')).resolves.toHaveLength(1);
  });

  it('explains that the content path points at a file, not a folder', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ content: 'x', sha: 's' }));
    const contents = connect();

    await expect(contents.listDirectory('content/posts.md')).rejects.toThrow(/not a folder/);
  });

  it('reports a missing branch as false rather than throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ message: 'Not Found' }, 404));
    const contents = TestBed.inject(HugoContents);

    await expect(contents.branchExists('o', 'r', 'nope', 't')).resolves.toBe(false);
  });

  describe('error messages', () => {
    // Labelled rather than keyed by status alone: 403 covers two genuinely
    // different problems and each needs its own message.
    const cases: [string, number, unknown, RegExp][] = [
      ['a rejected token', 401, { message: 'Bad credentials' }, /rejected that token/],
      [
        'a token missing write permission',
        403,
        { message: 'Resource not accessible' },
        /Contents: Read and write/,
      ],
      ['a rate limit', 403, { message: 'API rate limit exceeded' }, /rate-limited/],
      ['a missing repository', 404, { message: 'Not Found' }, /cannot find that repository/],
      ['a concurrent edit', 409, { message: 'Conflict' }, /changed on GitHub/],
    ];

    for (const [label, status, body, expected] of cases) {
      it(`explains ${label} (HTTP ${status})`, async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body, status));
        const contents = connect();

        await expect(contents.readFile('a.md')).rejects.toThrow(expected);
      });
    }

    it('carries the status through so callers can branch on it', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ message: 'sha wasn’t supplied' }, 422),
      );
      const contents = connect();

      await expect(contents.readFile('a.md')).rejects.toBeInstanceOf(HugoApiError);
      await contents.readFile('a.md').catch((error: HugoApiError) => {
        expect(error.status).toBe(422);
      });
    });
  });
});
