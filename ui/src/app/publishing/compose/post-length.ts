import { findUrls, postLength as weightedLength, type PostUrl } from '../../../lib/thread-text';
export { findUrls, type PostUrl } from '../../../lib/thread-text';

/** Mastodon's fallback reserved width for a URL. */
export const DEFAULT_URL_WEIGHT = 23;

export function postLength(text: string, urlWeight = DEFAULT_URL_WEIGHT): number {
  return weightedLength(text, urlWeight);
}

/**
 * How many characters shortening every long URL would save.
 *
 * Zero when there is nothing to gain, which is the common case and is why the
 * composer's shorten affordance stays out of the way until it would help: a URL
 * already at or under the reserved width costs the same shortened, so offering
 * to shorten it is busywork that spends a link from the user's monthly quota.
 *
 * Note this is about the *displayed* text, not the count. A 700-character URL
 * already costs only 23 against the limit — the reason to shorten it is that it
 * looks awful in the box and in the post, not that it saves budget.
 */
export function longUrls(text: string, urlWeight: number = DEFAULT_URL_WEIGHT): PostUrl[] {
  return findUrls(text).filter((entry) => Array.from(entry.url).length > urlWeight);
}
