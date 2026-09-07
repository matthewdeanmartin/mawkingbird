import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { Account, Status } from '../../models';
import { externalFetch } from '../external-fetch';
import { GistSettings } from './gist-settings';
import { PasteCreateInput, PasteCreated, PasteProvider, PasteRecentItem } from './paste-provider';

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const HTML_ROOT = 'https://gist.github.com';

/** Languages GitHub renders, keyed by the extension the filename needs. */
const LANGUAGES = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'plaintext', label: 'Plain text' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'shell', label: 'Shell' },
] as const;

const EXTENSIONS: Record<string, string> = {
  markdown: 'md',
  plaintext: 'txt',
  json: 'json',
  yaml: 'yml',
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  html: 'html',
  css: 'css',
  sql: 'sql',
  shell: 'sh',
};

const GIST_ACCOUNT: Account = {
  id: 'paste:gist',
  username: 'gist',
  acct: 'gist@github.com',
  display_name: 'GitHub Gist',
  note: 'Snippets and notes published as GitHub gists.',
  url: HTML_ROOT,
  avatar: 'https://github.githubassets.com/favicons/favicon.png',
  avatar_static: 'https://github.githubassets.com/favicons/favicon.png',
  header: '',
  followers_count: 0,
  following_count: 0,
  statuses_count: 0,
  bot: false,
  locked: false,
  discoverable: false,
  fields: [],
};

interface GistFile {
  filename?: string;
  content?: string;
  raw_url?: string;
  truncated?: boolean;
}

interface GistResponse {
  id?: string;
  html_url?: string;
  description?: string;
  public?: boolean;
  created_at?: string;
  updated_at?: string;
  files?: Record<string, GistFile | null>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * The filename a gist's single file gets.
 *
 * GitHub keys a gist's files by name and infers highlighting from the
 * extension, so the language picker has to become a filename — there is no
 * separate language field to set. A titled paste keeps its title in the name,
 * because that is what a gist listing shows.
 */
export function gistFilename(title: string, language: string): string {
  const extension = EXTENSIONS[language] ?? 'txt';
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'paste'}.${extension}`;
}

/** The one file in a gist, or null when there isn't exactly one worth reading. */
export function soleFile(gist: GistResponse): GistFile | null {
  const files = Object.values(gist.files ?? {}).filter((file): file is GistFile => !!file);
  return files.length === 1 ? files[0] : (files[0] ?? null);
}

/**
 * GitHub Gist as a paste provider.
 *
 * Modelled as a paste rather than as a draft kind of its own, and that is the
 * whole point: **every paste provider is already a draft source.** A gist
 * created here lands in `PasteHistory`, which means it appears in `/drafts` and
 * in the writing workspace's draft list without a single line of new code in
 * either — see `pasteDraftItem` and `DraftSources`.
 *
 * What it adds over the anonymous services is ownership. A Rentry page is held
 * by an edit code in this browser; a gist belongs to a GitHub account, is
 * versioned, and can be found and revoked from github.com by someone who has
 * lost this browser entirely. For anyone using pastes as real storage rather
 * than as a throwaway, that is the difference.
 *
 * Offered only when a token is connected, the same way the shortener entry is:
 * there is nothing to offer otherwise, and the anonymous providers already
 * cover the no-setup case.
 */
@Injectable({ providedIn: 'root' })
export class GistProvider implements PasteProvider {
  private http = inject(HttpClient);
  private settings = inject(GistSettings);

  readonly id = 'gist';
  readonly languages = LANGUAGES;
  /**
   * Gists do not expire. GitHub has no TTL and no burn-after-reading, and
   * claiming otherwise would be a promise this provider cannot keep.
   */
  readonly expiries = [{ value: 'never', label: 'Does not expire' }] as const;
  /**
   * A secret gist is unlisted, not private: anyone with the URL can read it.
   * `unlisted` is exactly what that means here, so the mapping is honest.
   */
  readonly visibilities = ['public', 'unlisted'] as const;

  /** True when a gist-scoped token is stored. */
  readonly available = computed(() => this.settings.connected());

  /**
   * Who a token belongs to, for naming the connection.
   *
   * Takes the token as an argument rather than reading it from settings,
   * because the connection page calls this *before* storing anything — a token
   * that turns out to be bad should never have been written down.
   */
  whoami(accessToken: string): Observable<{ login: string }> {
    return this.http.get<{ login: string }>(`${API_ROOT}/user`, {
      headers: new HttpHeaders({
        Authorization: `Bearer ${accessToken.trim()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
      }),
      context: externalFetch(),
    });
  }

  get label(): string {
    const login = this.settings.profile()?.login;
    return login ? `GitHub Gist (@${login})` : 'GitHub Gist';
  }

  create(input: PasteCreateInput): Observable<PasteCreated> {
    const headers = this.authorized();
    if (!headers) {
      return this.notConnected();
    }
    const filename = gistFilename(input.title, input.language);
    return this.http
      .post<GistResponse>(
        `${API_ROOT}/gists`,
        {
          description: input.title.trim(),
          // A "public" gist is listed on github.com; anything else is secret,
          // which is what `unlisted` means for every other provider here.
          public: input.visibility === 'public',
          files: { [filename]: { content: input.content } },
        },
        { headers, context: externalFetch() },
      )
      .pipe(map((gist) => this.created(gist, filename)));
  }

  update(
    slug: string,
    _editKey: string,
    input: Pick<PasteCreateInput, 'title' | 'content' | 'language'>,
  ): Observable<void> {
    const headers = this.authorized();
    if (!headers) {
      return this.notConnected();
    }
    // The account token is the authority, not a per-paste edit key — a gist has
    // no such thing. `editKey` is stored empty for the same reason the
    // shortener provider stores it empty.
    const filename = gistFilename(input.title, input.language);
    return this.http
      .patch<GistResponse>(
        `${API_ROOT}/gists/${encodeURIComponent(slug)}`,
        {
          description: input.title.trim(),
          files: { [filename]: { filename, content: input.content } },
        },
        { headers, context: externalFetch() },
      )
      .pipe(map(() => undefined));
  }

  delete(slug: string, _editKey: string): Observable<void> {
    const headers = this.authorized();
    if (!headers) {
      return this.notConnected();
    }
    return this.http
      .delete<void>(`${API_ROOT}/gists/${encodeURIComponent(slug)}`, {
        headers,
        context: externalFetch(),
      })
      .pipe(map(() => undefined));
  }

  /**
   * The account's own gists, newest first.
   *
   * Only gists with exactly one file are listed. A multi-file gist is a project
   * rather than a note, and flattening one into a single paste body would
   * misrepresent it — and, worse, an edit would then rewrite it to one file.
   */
  recent(): Observable<PasteRecentItem[]> {
    const headers = this.authorized();
    if (!headers) {
      return this.notConnected();
    }
    return this.http
      .get<GistResponse[]>(`${API_ROOT}/gists?per_page=30`, {
        headers,
        context: externalFetch(),
      })
      .pipe(
        map((gists) =>
          gists
            .filter((gist) => Object.values(gist.files ?? {}).filter(Boolean).length === 1)
            .map((gist) => this.recentItem(gist))
            .filter((item): item is PasteRecentItem => item !== null),
        ),
      );
  }

  status(item: PasteRecentItem): Status {
    const title = item.title?.trim();
    const content = title
      ? `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(item.preview)}`
      : escapeHtml(item.preview);
    return {
      provider: 'paste',
      providerRef: { providerId: this.id, slug: item.slug },
      id: `paste:${this.id}:${item.slug}`,
      created_at: item.createdAt,
      edited_at: null,
      content,
      spoiler_text: '',
      visibility: 'unlisted',
      url: item.url,
      account: GIST_ACCOUNT,
      reblog: null,
      quote: null,
      in_reply_to_id: null,
      replies_count: 0,
      reblogs_count: 0,
      favourites_count: 0,
      favourited: false,
      reblogged: false,
      bookmarked: false,
      muted: false,
      pinned: false,
      sensitive: false,
      poll: null,
      quote_approval_policy: null,
      language: item.language,
      media_attachments: [],
      application: { name: 'GitHub Gist', website: HTML_ROOT },
    };
  }

  /** How a created or updated gist reads back as a paste record. */
  private created(gist: GistResponse, filename: string): PasteCreated {
    if (!gist.id) {
      throw new Error('GitHub did not return a gist id.');
    }
    const file = soleFile(gist);
    return {
      slug: gist.id,
      url: gist.html_url ?? `${HTML_ROOT}/${gist.id}`,
      rawUrl: file?.raw_url ?? `${HTML_ROOT}/${gist.id}/raw/${filename}`,
      // A gist is owned by the account, so there is no per-paste secret. The
      // Pastes page reads an empty key as "this one is managed elsewhere".
      editKey: '',
    };
  }

  private recentItem(gist: GistResponse): PasteRecentItem | null {
    const file = soleFile(gist);
    if (!gist.id || !file) {
      return null;
    }
    const name = file.filename ?? '';
    const extension = name.split('.').pop()?.toLowerCase() ?? '';
    const language =
      Object.entries(EXTENSIONS).find(([, ext]) => ext === extension)?.[0] ?? 'plaintext';
    return {
      slug: gist.id,
      title: gist.description?.trim() || name || null,
      language,
      // The list endpoint omits file contents, so the filename is the honest
      // preview — fetching thirty gist bodies to fill a list would not be.
      preview: name,
      createdAt: gist.created_at ?? new Date().toISOString(),
      url: gist.html_url ?? `${HTML_ROOT}/${gist.id}`,
      rawUrl: file.raw_url ?? `${HTML_ROOT}/${gist.id}/raw`,
    };
  }

  private authorized(): HttpHeaders | null {
    const token = this.settings.token();
    return token
      ? new HttpHeaders({
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
        })
      : null;
  }

  private notConnected(): Observable<never> {
    return throwError(
      () =>
        new Error('No GitHub token for gists. Add one under Settings → Connections → GitHub Gist.'),
    );
  }
}
