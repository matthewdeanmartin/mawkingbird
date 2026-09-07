import { Observable } from 'rxjs';
import { Status } from './models';

/**
 * How a page gives a feed to the analytics and members views.
 *
 * Two shapes, because two kinds of feed exist in this client:
 *
 *  - **Paged feeds** are a real server timeline (a hashtag, a list) that can be
 *    walked backwards with `max_id`. These get a user-chosen sample size and
 *    cost one request per page.
 *  - **Supplied feeds** are synthetic — Home merges several providers, folds in
 *    local posts and Eliza, then sorts by time. Paging it means nothing: there
 *    is no cursor that reproduces the merge. So the page hands over the posts it
 *    already has, the sample is however many that is, and it costs no requests.
 */
interface FeedSourceBase {
  /** Feed kind, e.g. "hashtag", "list", "home" — shown in the provenance line. */
  type: string;
  /** What identifies this feed within its kind, e.g. "#angular". */
  query: string;
}

/** A server timeline that can be paged backwards. */
export interface PagedFeedSource extends FeedSourceBase {
  /** Posts per request. Mastodon caps timelines at 40; most default to 20. */
  pageSize: number;
  /** Fetch the page of posts older than `after` (null = newest page). */
  fetch(after: Status | null): Observable<Status[]>;
  posts?: undefined;
}

/** A synthetic feed, handed over whole. */
export interface SuppliedFeedSource extends FeedSourceBase {
  /** The posts already loaded, newest first. */
  posts: Status[];
}

export type FeedSource = PagedFeedSource | SuppliedFeedSource;

/** Whether a source hands over its posts rather than being paged. */
export function isSupplied(source: FeedSource): source is SuppliedFeedSource {
  return Array.isArray((source as SuppliedFeedSource).posts);
}

/** The outcome of collecting a sample. */
export interface FeedSample {
  /** Newest first, de-duplicated, trimmed to the requested size. */
  posts: Status[];
  /** How many requests it took. Always 0 for a supplied source. */
  apiCalls: number;
  /** True when a request failed before anything at all was collected. */
  failed: boolean;
}

/** Hard stop on paging, so a feed that pages forever can't burn the budget. */
export const MAX_PAGES = 20;

/**
 * Collect up to `size` posts from a feed, emitting once when done.
 *
 * A supplied source completes synchronously with what it was given. A paged one
 * walks backwards until it has enough, hits a short page, or hits
 * {@link MAX_PAGES}. Two behaviours matter to callers:
 *
 *  - **Overlapping pages are de-duplicated.** A feed that gains posts
 *    mid-collection will repeat some, and a repeated post would be
 *    double-counted in every metric downstream.
 *  - **A mid-collection failure still yields a sample.** Only a first-page
 *    failure is reported as `failed`; anything already collected is kept, since
 *    a smaller sample is far more useful than an error.
 */
export function sampleFeed(source: FeedSource, size: number): Observable<FeedSample> {
  return new Observable<FeedSample>((subscriber) => {
    if (isSupplied(source)) {
      subscriber.next({ posts: source.posts.slice(0, size), apiCalls: 0, failed: false });
      subscriber.complete();
      return;
    }

    let cancelled = false;
    let apiCalls = 0;

    const done = (posts: Status[], failed: boolean) => {
      if (cancelled) {
        return;
      }
      subscriber.next({ posts: posts.slice(0, size), apiCalls, failed });
      subscriber.complete();
    };

    const page = (acc: Status[], pages: number) => {
      source.fetch(acc.at(-1) ?? null).subscribe({
        next: (batch) => {
          if (cancelled) {
            return;
          }
          apiCalls += 1;
          const seen = new Set(acc.map((s) => s.id));
          const all = [...acc, ...batch.filter((s) => !seen.has(s.id))];
          const exhausted = batch.length < source.pageSize;
          if (exhausted || all.length >= size || pages + 1 >= MAX_PAGES) {
            done(all, false);
            return;
          }
          page(all, pages + 1);
        },
        error: () => done(acc, acc.length === 0),
      });
    };

    page([], 0);
    return () => {
      cancelled = true;
    };
  });
}
