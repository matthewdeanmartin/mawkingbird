import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Marks a request as targeting a foreign host (an RSS feed, a Bluesky PDS, …)
 * rather than the selected Mastodon instance. The auth interceptor must not
 * attach the Mastodon bearer token to these (token leak), and the health
 * interceptor must not fail-whale when they error (a dead feed is not a dead
 * server).
 */
export const EXTERNAL_FETCH = new HttpContextToken<boolean>(() => false);

/** Convenience: `http.get(url, { context: externalFetch() })`. */
export function externalFetch(): HttpContext {
  return new HttpContext().set(EXTERNAL_FETCH, true);
}
