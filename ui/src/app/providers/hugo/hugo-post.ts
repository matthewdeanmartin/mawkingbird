/**
 * Slugs, file paths and permalinks for Hugo posts, plus the local `Status` a
 * publish emits. Pure — the third sibling of `mataroa-status.ts` and
 * `blogger-status.ts`, with the path arithmetic that neither of those needs
 * because neither of those writes files.
 */

import { Account, Status } from '../../models';

/** Where a published post ended up, as the contents API reported it. */
export interface HugoCommitResult {
  /** Repo-relative path, e.g. `content/posts/hello-world.md`. */
  path: string;
  /** The blob sha of the file just written — what a later edit must send back. */
  contentSha: string;
  /** The commit sha, which sprint 4 matches against an Actions run. */
  commitSha: string;
  /** GitHub's own page for the file. Always correct, unlike a predicted permalink. */
  htmlUrl: string;
}

/**
 * Title → slug.
 *
 * Deliberately boring and predictable, because the result becomes a permanent
 * URL. Diacritics are folded rather than dropped (`Café` → `cafe`, not `caf`),
 * and the cap breaks on a word boundary so a truncated slug still reads.
 */
export function slugify(title: string, maxLength = 60): string {
  const folded = title
    .normalize('NFKD')
    // Combining marks left behind by the decomposition.
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (folded.length <= maxLength) {
    return folded;
  }
  const cut = folded.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  // Only break on a word boundary if doing so keeps a usable amount of slug.
  return (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

/**
 * A slug that is never empty.
 *
 * `slugify` returns '' for a title that is all emoji, or entirely non-Latin —
 * CJK titles are the common case here, not an edge case, and they must produce
 * something usable rather than failing the publish. The fallback is the date
 * plus a short random suffix, which is stable enough to read and unique enough
 * not to collide.
 */
export function postSlug(title: string, now = new Date(), random = Math.random): string {
  const slug = slugify(title);
  if (slug) {
    return slug;
  }
  const date = now.toISOString().slice(0, 10);
  const suffix = Math.floor(random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `${date}-${suffix}`;
}

/**
 * Normalize a user-typed content path to `a/b`, no leading or trailing slash.
 *
 * People paste `/content/posts/`, `content\posts` and `./content/posts`. All
 * three mean the same directory and the API accepts exactly one spelling.
 */
export function normalizeContentPath(value: string): string {
  const cleaned = value
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!cleaned) {
    throw new Error('Enter the folder your posts live in, for example content/posts.');
  }
  if (cleaned.split('/').includes('..')) {
    throw new Error('The content folder must be inside the repository.');
  }
  return cleaned;
}

/** `content/posts` + `hello` → `content/posts/hello.md`. */
export function postPath(contentPath: string, slug: string): string {
  return `${normalizeContentPath(contentPath)}/${slug}.md`;
}

/**
 * Add or bump a `-2` suffix, for retrying a slug GitHub says already exists.
 *
 * `hello` → `hello-2` → `hello-3`. Only a trailing counter is treated as one,
 * so a post legitimately titled "Part 2" starts at `part-2` and becomes
 * `part-2-2` rather than silently becoming `part-3` and overwriting nothing the
 * user meant.
 */
export function bumpSlug(slug: string, attempt: number): string {
  return attempt <= 1 ? slug : `${slug}-${attempt}`;
}

/**
 * The post's address on the built site, if we can know it.
 *
 * A *prediction*: Hugo's default permalink for a page in `content/<section>/` is
 * `<baseURL>/<section>/<slug>/`, but a theme or a `permalinks` config can change
 * that, and nothing in the repo tells us from here. Returns null when there is
 * no configured site URL, in which case callers link to the file on GitHub —
 * which is honest and always right.
 */
export function predictedPermalink(
  siteUrl: string | null,
  contentPath: string,
  slug: string,
): string | null {
  if (!siteUrl) {
    return null;
  }
  const section = normalizeContentPath(contentPath)
    .split('/')
    // `content/` is Hugo's root and never part of the URL.
    .filter((part, index) => !(index === 0 && part === 'content'))
    .join('/');
  try {
    const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
    return new URL(`${section ? `${section}/` : ''}${slug}/`, base).toString();
  } catch {
    return null;
  }
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
 * Immediate local representation of a post GitHub just accepted.
 *
 * Mirrors {@link mataroaStatus} — same `provider: 'blog'`, same namespaced id
 * shape — so the existing `✍️ Blog` badge and read-only capabilities apply with
 * no changes anywhere outside this folder.
 *
 * `url` prefers the predicted permalink and falls back to the file on GitHub.
 * The post is not actually live until Actions finishes building; sprint 4
 * replaces this optimism with a confirmed build.
 */
export function hugoStatus(
  commit: HugoCommitResult,
  title: string,
  body: string,
  account: Account,
  options: { slug: string; permalink: string | null; isDraft: boolean },
): Status {
  return {
    provider: 'blog',
    providerRef: {
      providerId: 'hugo',
      slug: options.slug,
      path: commit.path,
      contentSha: commit.contentSha,
      commitSha: commit.commitSha,
    },
    id: `blog:hugo:${options.slug}`,
    created_at: new Date().toISOString(),
    edited_at: null,
    content: `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(body).replaceAll('\n', '<br>')}`,
    spoiler_text: '',
    // A Hugo draft is committed but not built into the site, so it is not
    // public yet — the same distinction Blogger drafts get.
    visibility: options.isDraft ? 'private' : 'public',
    url: options.permalink ?? commit.htmlUrl,
    account,
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
    media_attachments: [],
    application: { name: 'Hugo', website: 'https://gohugo.io/' },
  };
}
