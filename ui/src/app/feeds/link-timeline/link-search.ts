import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';
import { youtubeSource } from '../../reading/video-player/media-source';

/** Query parameters that only track where a click came from. */
const TRACKING_PARAM = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|igshid|si)$/i;

/**
 * `https://www.example.com/a/b/?utm_source=x#y` → `example.com/a/b`; a query
 * that names the page (`?id=5`) is kept, minus tracking parameters. '' when not
 * a URL.
 */
export function bareLink(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    const query = [...parsed.searchParams]
      .filter(([key]) => !TRACKING_PARAM.test(key))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    return `${parsed.hostname.replace(/^www\./, '')}${path}${query ? `?${query}` : ''}`;
  } catch {
    return '';
  }
}

/**
 * What a post must contain to be about `url`: a YouTube video's id (its links
 * come as youtu.be/<id>, watch?v=<id>, shorts/<id>), otherwise the bare link.
 */
export function linkNeedle(url: string): string {
  return youtubeSource(url)?.videoId ?? bareLink(url);
}

/** Whether a post links to the page: in its text or its preview card. */
export function mentionsLink(status: Status, needle: string): boolean {
  if (!needle) return false;
  const lower = needle.toLowerCase();
  const target = status.reblog ?? status;
  const haystacks = [target.content, target.card?.url];
  // Post HTML escapes & in hrefs; compare the text as written.
  return haystacks.some((text) =>
    (text ?? '').replace(/&amp;/g, '&').toLowerCase().includes(lower),
  );
}

/**
 * Posts found by searching for a link: the full URL, then (only if that finds
 * nothing) the needle ({@link linkNeedle}), closer to how Mastodon shows links
 * in post text. At most two calls. Mastodon search matches words loosely, so
 * results that don't actually contain the link are dropped. A failing search
 * counts as nothing found.
 *
 * `prefix` narrows the query (`from:me ` for the reader's own posts); those
 * searches go to the home server, since a separate search server is anonymous.
 */
export function searchPostsForLink(
  api: Api,
  url: string,
  opts: { prefix?: string; limit?: number } = {},
): Observable<Status[]> {
  const prefix = opts.prefix ?? '';
  const needle = linkNeedle(url);
  const queries = [...new Set([url, needle].filter(Boolean))].map((q) => prefix + q);
  const search = (q: string) =>
    api.search(q, 'statuses', { limit: opts.limit ?? 20, homeServer: !!prefix }).pipe(
      map((results) => (results.statuses ?? []).filter((s) => mentionsLink(s, needle))),
      catchError(() => of([] as Status[])),
    );
  if (!queries.length) return of([]);
  return search(queries[0]).pipe(
    switchMap((found) => (found.length || queries.length < 2 ? of(found) : search(queries[1]))),
  );
}
