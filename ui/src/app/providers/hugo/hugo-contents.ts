import { inject, Injectable } from '@angular/core';
import { ActionsRun } from './hugo-deploy';
import { HugoSettings } from './hugo-settings';

/**
 * The GitHub contents API, which is the whole transport for this connector.
 *
 * No CORS proxy anywhere in this file, and that is the point: `api.github.com`
 * sends permissive CORS headers for writes as well as reads, unlike
 * mataroa.blog, whose every write has to be consented through a third party
 * (`mataroa-api.ts`). Publishing a Hugo post is a plain browser `fetch`.
 *
 * `fetch` rather than `HttpClient` to match `GitHubSession`, the other GitHub
 * caller — same headers, same error shape, and no interceptor is wanted on
 * these (they are neither Mastodon calls nor the metered external fetches the
 * `externalFetch()` context is for).
 */
const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';

/** One entry in a repo directory listing. */
export interface HugoDirEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
}

export interface HugoFile {
  text: string;
  /** The blob sha. An update must send this back or GitHub refuses it. */
  sha: string;
}

export interface HugoPutResult {
  path: string;
  contentSha: string;
  commitSha: string;
  htmlUrl: string;
}

/** A GitHub error carrying its status, so callers can branch on 409 vs 422. */
export class HugoApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HugoApiError';
  }
}

/**
 * Base64 for a UTF-8 string.
 *
 * `btoa(text)` throws on any character above U+00FF, so the first em-dash or
 * emoji in a post would break publishing. Encode to bytes first. This is the
 * single most likely thing in the connector to be quietly wrong, which is why
 * the spec covers an em-dash, an emoji and a CJK character.
 */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** The inverse. GitHub wraps its base64 at 60 columns, so strip whitespace. */
export function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

interface ContentsResponse {
  content?: string;
  sha?: string;
  html_url?: string;
}

interface PutResponse {
  content?: { path?: string; sha?: string; html_url?: string };
  commit?: { sha?: string };
}

@Injectable({ providedIn: 'root' })
export class HugoContents {
  private readonly settings = inject(HugoSettings);

  /**
   * List a directory in the configured repo.
   *
   * GitHub returns an object (not an array) when the path is a file, and 404s
   * when it does not exist — both are surfaced as errors naming the path,
   * because "your content folder is wrong" is the most common setup mistake.
   */
  async listDirectory(path: string): Promise<HugoDirEntry[]> {
    const body = await this.request<HugoDirEntry[] | ContentsResponse>(
      'GET',
      this.contentsUrl(path),
    );
    if (!Array.isArray(body)) {
      throw new HugoApiError(422, `${path} is a file, not a folder of posts.`);
    }
    return body;
  }

  async readFile(path: string): Promise<HugoFile> {
    const body = await this.request<ContentsResponse>('GET', this.contentsUrl(path));
    if (typeof body.content !== 'string' || typeof body.sha !== 'string') {
      throw new HugoApiError(422, `GitHub returned no content for ${path}.`);
    }
    return { text: decodeBase64(body.content), sha: body.sha };
  }

  /**
   * Create or update one file.
   *
   * Omitting `sha` means "create": GitHub 422s if the path already exists,
   * which is the collision signal the publish flow retries on. Supplying it
   * means "update": GitHub 409s if the file changed since it was read, which is
   * the concurrency signal sprint 2 surfaces. Both behaviours are GitHub's, and
   * neither is worth reimplementing as a read-then-write check that would race
   * anyway.
   */
  async putFile(args: {
    path: string;
    text: string;
    message: string;
    sha?: string;
  }): Promise<HugoPutResult> {
    const repo = this.repo();
    const body = await this.request<PutResponse>('PUT', this.contentsUrl(args.path, false), {
      message: args.message,
      content: encodeBase64(args.text),
      branch: repo.branch,
      ...(args.sha ? { sha: args.sha } : {}),
    });
    return {
      path: body.content?.path ?? args.path,
      contentSha: body.content?.sha ?? '',
      commitSha: body.commit?.sha ?? '',
      htmlUrl: body.content?.html_url ?? '',
    };
  }

  /**
   * Recent workflow runs on the configured branch.
   *
   * Ten is plenty: we are looking for one specific `head_sha` that was pushed
   * seconds ago, and anything that has fallen off a ten-run window on this
   * branch is older than the commit we are asking about.
   */
  async recentRuns(): Promise<ActionsRun[]> {
    const repo = this.repo();
    const url = `${API_ROOT}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/actions/runs?branch=${encodeURIComponent(repo.branch)}&per_page=10`;
    const body = await this.request<{ workflow_runs?: ActionsRun[] }>('GET', url);
    return body.workflow_runs ?? [];
  }

  /** Whether a branch exists, used by connect-time validation. */
  async branchExists(owner: string, repo: string, branch: string, token: string): Promise<boolean> {
    const response = await rawRequest(
      'GET',
      `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
      token,
    );
    if (response.status === 404) {
      return false;
    }
    await throwIfNotOk(response);
    return true;
  }

  private repo() {
    const repo = this.settings.repo();
    if (!repo) {
      throw new HugoApiError(0, 'Connect your Hugo repository in Settings first.');
    }
    return repo;
  }

  /**
   * `ref` selects the branch for reads. It must NOT be sent on a write — a
   * `PUT` takes `branch` in its body, and a stray `?ref=` there is ignored at
   * best and confusing at worst.
   */
  private contentsUrl(path: string, withRef = true): string {
    const repo = this.repo();
    const encodedPath = path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const base = `${API_ROOT}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${encodedPath}`;
    return withRef ? `${base}?ref=${encodeURIComponent(repo.branch)}` : base;
  }

  private async request<T>(method: 'GET' | 'PUT', url: string, body?: unknown): Promise<T> {
    const token = this.settings.token();
    if (!token) {
      throw new HugoApiError(401, 'Connect your Hugo repository in Settings first.');
    }
    const response = await rawRequest(method, url, token, body);
    await throwIfNotOk(response);
    return (await response.json()) as T;
  }
}

function rawRequest(method: string, url: string, token: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  throw new HugoApiError(response.status, await describeError(response));
}

/**
 * Turn a GitHub error into something a blogger can act on.
 *
 * Each status here is a distinct setup mistake with a distinct fix, and saying
 * "HTTP 422" instead of naming it is how a connector becomes unsupportable.
 */
async function describeError(response: Response): Promise<string> {
  let message = '';
  try {
    const body = (await response.json()) as { message?: string };
    message = body.message ?? '';
  } catch {
    // No JSON body; the status alone has to carry the explanation.
  }
  switch (response.status) {
    case 401:
      return 'GitHub rejected that token. Check it is active and has not expired.';
    case 403:
      return message.toLowerCase().includes('rate limit')
        ? 'GitHub rate-limited this browser. Wait a few minutes and try again.'
        : 'That token cannot write to this repository. It needs Contents: Read and write, and access to this repo.';
    case 404:
      return 'GitHub cannot find that repository, branch or folder — or the token cannot see it.';
    case 409:
      return 'This post changed on GitHub since it was opened.';
    case 422:
      return message || 'GitHub refused the change. A file with that name may already exist.';
    default:
      return message || `GitHub returned HTTP ${response.status}.`;
  }
}
