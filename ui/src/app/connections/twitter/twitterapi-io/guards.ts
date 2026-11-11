import { TwitterApiError } from '../twitter-errors';
import { WireEnvelope, WireFollowing, WireTimelineData, WireTweet, WireUser } from './wire-types';

/**
 * Runtime validation of TwitterAPI.io responses.
 *
 * Hand-written type guards rather than Zod or Valibot. The spec (§10.2) asks for
 * runtime validation and names those libraries; the reason not to take one here
 * is that this app ships to a browser and has exactly one provider needing
 * validation. A schema library would be the largest new dependency in
 * `providers/` in exchange for guards that are, as it turns out, four lines
 * each.
 *
 * ## What "valid" means, and why it is so permissive
 *
 * Only what makes an object *identifiable* is required: a post needs an id and
 * an author, a profile needs an id and a username. Everything else may be
 * missing, and the normalizers substitute a null or a sensible default.
 *
 * That is not laziness — it is the correct failure mode for an unofficial
 * scraper of a service that changes without notice. If X drops `viewCount`
 * tomorrow, a strict validator turns every post in the timeline into an error,
 * while a permissive one renders the timeline with no view counts. The second
 * is obviously better for a reader, and the spec agrees (§10.2: "allow partial
 * rendering when nonessential fields are missing").
 *
 * The identity fields are the exception because a post with no id cannot be
 * deduplicated, linked to, or told apart from another — there is nothing to
 * render *as*.
 */

/** Thrown shape for a response whose structure is no longer recognisable. */
function changed(endpoint: string, missing: string[]): TwitterApiError {
  return new TwitterApiError(
    'PROVIDER_CHANGED',
    `TwitterAPI.io's response for ${endpoint} is missing ${missing.join(', ')}. ` +
      'The service may have changed its API — this is not something you can fix from here.',
    'twitterapi-io',
    undefined,
    undefined,
    // Deliberately no response body: it can be large, and §10.2 forbids putting
    // raw provider payloads into diagnostics.
    `missing: ${missing.join(', ')}`,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Pull `data` out of the envelope, or explain what was wrong with it.
 *
 * Provider-level errors inside an HTTP 200 are *not* handled here — the
 * transport already checked for those before this runs. By this point the
 * envelope claims success, so a missing `data` is a schema change rather than
 * an error response.
 */
export function unwrap<T>(body: unknown, endpoint: string): { data: T; envelope: WireEnvelope<T> } {
  if (!isObject(body)) {
    throw changed(endpoint, ['a JSON object body']);
  }
  const envelope = body as WireEnvelope<T>;
  if (envelope.data === undefined || envelope.data === null) {
    throw changed(endpoint, ['data']);
  }
  return { data: envelope.data, envelope };
}

/** Whether a value is usable as a profile. */
export function isWireUser(value: unknown): value is WireUser {
  if (!isObject(value)) {
    return false;
  }
  // An account with no id and no handle cannot be linked to or told apart from
  // any other; there is nothing to render.
  return typeof value['id'] === 'string' || typeof value['userName'] === 'string';
}

/** Whether a value is usable as a post. */
export function isWireTweet(value: unknown): value is WireTweet {
  if (!isObject(value)) {
    return false;
  }
  return typeof value['id'] === 'string' && isWireUser(value['author']);
}

/**
 * Validate a `/twitter/tweets` (batch post lookup) response.
 *
 * A *third* envelope shape from the same API, measured 2026-08-01: `tweets`
 * sits at the top level here, with no `data` wrapper at all — unlike the
 * timeline endpoints, which nest it under `data`, and unlike `user/info`, which
 * puts a single object there. Reusing the timeline parser threw
 * `PROVIDER_CHANGED` on a perfectly good response.
 *
 * Exactly the reason each endpoint gets its own guard rather than one shared
 * "unwrap and hope".
 */
export function parsePostsResponse(body: unknown): WireTweet[] {
  if (!isObject(body)) {
    throw changed('/twitter/tweets', ['a JSON object body']);
  }
  const raw: unknown = body['tweets'];
  if (!Array.isArray(raw)) {
    throw changed('/twitter/tweets', ['tweets']);
  }
  return raw.filter(isWireTweet);
}

/** Validate a `/twitter/user/info` response. */
export function parseUserResponse(body: unknown): WireUser {
  const { data } = unwrap<unknown>(body, '/twitter/user/info');
  if (!isWireUser(data)) {
    throw changed('/twitter/user/info', ['a user id or userName']);
  }
  return data;
}

/**
 * Validate a timeline response.
 *
 * Individual malformed posts are *dropped* rather than failing the page, and
 * the count is returned so the caller can mention it. One unrenderable post in
 * a page of twenty should cost the reader that post, not the page — and the
 * common cause is a genuinely odd post (a deleted quote, a withheld account)
 * rather than a schema change.
 */
export function parseTimelineResponse(body: unknown): {
  tweets: WireTweet[];
  pinned: WireTweet | null;
  cursor: string | null;
  hasMore: boolean;
  skipped: number;
} {
  if (!isObject(body)) {
    throw changed('user timeline', ['a JSON object body']);
  }
  const envelope = body as WireEnvelope<WireTimelineData>;

  // Two nestings in the wild, both measured 2026-08-01:
  //
  //   user/last_tweets, user/tweet_timeline  ->  { data: { tweets: [...] } }
  //   tweet/replies                          ->  { tweets: [...] }
  //
  // Same conceptual payload, different envelope, from one API. Accepting either
  // here is not laxity — it is the only way one function can serve both without
  // the caller having to know which endpoint nests and which does not.
  const nested: unknown = (envelope.data as WireTimelineData | undefined)?.tweets;
  const flat: unknown = (body as Record<string, unknown>)['tweets'];
  const rawTweets: unknown = Array.isArray(nested) ? nested : flat;
  if (!Array.isArray(rawTweets)) {
    throw changed('user timeline', ['tweets or data.tweets']);
  }

  const tweets = rawTweets.filter(isWireTweet);
  const pinnedCandidate = (envelope.data as WireTimelineData | undefined)?.pin_tweet;
  const cursor = typeof envelope.next_cursor === 'string' ? envelope.next_cursor : null;

  return {
    tweets,
    pinned: isWireTweet(pinnedCandidate) ? (pinnedCandidate as WireTweet) : null,
    // An empty-string cursor is "no more pages", not a usable cursor. Passing
    // one back would re-request page one forever (spec §8.6, rule 2).
    cursor: cursor && cursor.length > 0 ? cursor : null,
    hasMore: envelope.has_next_page === true,
    skipped: rawTweets.length - tweets.length,
  };
}

/**
 * Validate a `/twitter/user/followings` response.
 *
 * A **sixth** envelope shape from this API, measured 2026-08-01: `followings`
 * at the top level, beside `has_next_page`/`next_cursor`, holding snake_case
 * users. Neither the timeline parser nor the batch one recognises it.
 *
 * Entries with no handle are dropped rather than failing the page — the same
 * rule as timelines, for the same reason: an account with no handle cannot be
 * followed, linked to, or told apart, so it is unrenderable rather than
 * evidence of a schema change.
 */
export function parseFollowingsResponse(body: unknown): {
  users: WireFollowing[];
  cursor: string | null;
  hasMore: boolean;
} {
  if (!isObject(body)) {
    throw changed('/twitter/user/followings', ['a JSON object body']);
  }
  const raw: unknown = body['followings'];
  if (!Array.isArray(raw)) {
    throw changed('/twitter/user/followings', ['followings']);
  }
  const users = (raw as unknown[]).filter(
    (value): value is WireFollowing =>
      isObject(value) &&
      (typeof value['screen_name'] === 'string' || typeof value['userName'] === 'string'),
  );
  const cursor = typeof body['next_cursor'] === 'string' ? body['next_cursor'] : null;
  return {
    users,
    // An empty cursor is "no more pages", not a usable cursor (§8.6 rule 2).
    cursor: cursor && cursor.length > 0 ? cursor : null,
    hasMore: body['has_next_page'] === true,
  };
}
