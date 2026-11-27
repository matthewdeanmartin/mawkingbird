import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';

/** `https://www.example.com/a/b/?x=1#y` → `example.com/a/b`; '' when not a URL. */
export function bareLink(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return '';
  }
}

/**
 * Posts found by searching for a link: the full URL, then (only if that finds
 * nothing) the bare `host/path`, closer to how Mastodon shows links in post
 * text. At most two calls. A failing search counts as nothing found.
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
  const queries = [...new Set([url, bareLink(url)].filter(Boolean))].map((q) => prefix + q);
  const search = (q: string) =>
    api.search(q, 'statuses', { limit: opts.limit ?? 20, homeServer: !!prefix }).pipe(
      map((results) => results.statuses ?? []),
      catchError(() => of([] as Status[])),
    );
  if (!queries.length) return of([]);
  return search(queries[0]).pipe(
    switchMap((found) => (found.length || queries.length < 2 ? of(found) : search(queries[1]))),
  );
}
