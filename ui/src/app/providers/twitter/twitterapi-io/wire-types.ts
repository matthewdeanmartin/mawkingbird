/**
 * TwitterAPI.io's response shapes, as *observed* rather than as documented.
 *
 * Every field here was read off a real response on 2026-07-31 (fixtures in
 * `../fixtures/`). That matters, because the written spec this integration
 * started from guessed a number of these wrong — `followersCount` for
 * `followers`, `avatarUrl` for `profilePicture`, `pinnedPostIds` for
 * `pinnedTweetIds`. Wire types written from documentation would have compiled
 * cleanly and produced `undefined` at runtime for half the profile card.
 *
 * ## Everything is optional
 *
 * Deliberately, including fields that are always present today. These are
 * unofficial scrapers of a service that does not owe them stability; a field
 * can vanish in a deploy neither we nor they control. Marking things required
 * would let TypeScript promise a guarantee nothing enforces, and the failure
 * would be a `TypeError` deep in a normalizer rather than a controlled
 * `PROVIDER_CHANGED` (spec §10.2).
 *
 * The type guards in `guards.ts` decide what is *actually* required, and they
 * require very little: an id and an author, essentially. Everything else
 * degrades to null and the card renders without it.
 */

/** The envelope every endpoint wraps its payload in. */
export interface WireEnvelope<T> {
  status?: string;
  code?: number;
  msg?: string;
  data?: T;
  /**
   * Pagination lives at the *top level*, beside `data` rather than inside it.
   * Observed on `/twitter/user/last_tweets`; the spec's §8.6 table implies
   * otherwise, and reading them from `data` yields undefined forever — i.e. a
   * timeline that silently never pages.
   */
  has_next_page?: boolean;
  next_cursor?: string;
}

/** A profile, from `/twitter/user/info` and embedded as a post's `author`. */
export interface WireUser {
  id?: string;
  userName?: string;
  name?: string;
  description?: string;
  location?: string;
  url?: string;
  profilePicture?: string;
  coverPicture?: string;
  followers?: number;
  following?: number;
  statusesCount?: number;
  mediaCount?: number;
  favouritesCount?: number;
  /** ISO-8601 with microseconds here — but see WireTweet.createdAt. */
  createdAt?: string;
  protected?: boolean;
  isVerified?: boolean;
  isBlueVerified?: boolean;
  verifiedType?: string | null;
  canDm?: boolean;
  isAutomated?: boolean;
  pinnedTweetIds?: string[];
  entities?: WireUserEntities;
}

export interface WireUserEntities {
  url?: { urls?: WireUrlEntity[] };
  description?: { urls?: WireUrlEntity[] };
}

export interface WireUrlEntity {
  url?: string;
  expanded_url?: string;
  display_url?: string;
  indices?: number[];
}

export interface WireMentionEntity {
  id_str?: string;
  screen_name?: string;
  name?: string;
  indices?: number[];
}

export interface WireHashtagEntity {
  text?: string;
  indices?: number[];
}

export interface WireEntities {
  user_mentions?: WireMentionEntity[];
  hashtags?: WireHashtagEntity[];
  urls?: WireUrlEntity[];
  symbols?: WireHashtagEntity[];
}

/** One video rendition. `bitrate` is absent on the HLS playlist variant. */
export interface WireVideoVariant {
  content_type?: string;
  bitrate?: number;
  url?: string;
}

/**
 * A media item, from `extendedEntities.media`.
 *
 * Note `sizes` was observed carrying only `large`, and the real pixel
 * dimensions live in `original_info` — not in `sizes` as one would assume.
 */
export interface WireMedia {
  type?: string;
  media_url_https?: string;
  url?: string;
  expanded_url?: string;
  display_url?: string;
  /** Alt text. The key is `ext_alt_text`, not `alt_text`. */
  ext_alt_text?: string;
  /**
   * The real pixel dimensions — not `sizes`, which was observed carrying only a
   * `large` entry. Also carries `focus_rects` (Twitter's suggested crops),
   * which this app has no use for but which must be *allowed* here or the
   * captured fixture stops type-checking.
   */
  original_info?: { width?: number; height?: number; focus_rects?: unknown };
  video_info?: {
    duration_millis?: number;
    aspect_ratio?: number[];
    variants?: WireVideoVariant[];
  };
}

/** A link preview card. */
export interface WireCard {
  url?: string;
  title?: string;
  description?: string;
}

/**
 * A post.
 *
 * `retweeted_tweet` and `quoted_tweet` are snake_case while every sibling is
 * camelCase — an inconsistency in the API, faithfully mirrored here rather than
 * tidied, because tidying is how a wire type stops matching the wire.
 */
export interface WireTweet {
  id?: string;
  url?: string;
  twitterUrl?: string;
  text?: string;
  source?: string;
  lang?: string;
  /**
   * Twitter's legacy format — `Fri Jul 31 22:22:43 +0000 2026` — NOT ISO-8601,
   * and NOT the same format `WireUser.createdAt` uses on the profile endpoint.
   * Two formats in one API; see `normalizeTimestamp`.
   */
  createdAt?: string;
  type?: string;
  isReply?: boolean;
  inReplyToId?: string | null;
  inReplyToUserId?: string | null;
  inReplyToUsername?: string | null;
  conversationId?: string;
  displayTextRange?: number[];
  isLimitedReply?: boolean;
  possiblySensitive?: boolean;
  replyCount?: number;
  retweetCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  bookmarkCount?: number;
  author?: WireUser;
  entities?: WireEntities;
  extendedEntities?: { media?: WireMedia[] };
  card?: WireCard;
  retweeted_tweet?: WireTweet | null;
  quoted_tweet?: WireTweet | null;
}

/** `/twitter/user/last_tweets` and `/twitter/user/tweet_timeline`. */
export interface WireTimelineData {
  tweets?: WireTweet[];
  pin_tweet?: WireTweet | null;
}

/**
 * One account from `/twitter/user/followings`.
 *
 * A **snake_case** shape, unlike `WireUser`'s camelCase — measured 2026-08-01.
 * The same conceptual object arrives with different field names depending on
 * which endpoint returned it (`screen_name` here vs `userName` there,
 * `statuses_count` vs `statusesCount`), so this is a separate type rather than
 * a loosening of `WireUser`. Making one type serve both would mean every field
 * becomes optional and nothing is validated.
 *
 * Notably absent: any last-tweet timestamp. `created_at` is when the *account*
 * was created, which says nothing about whether it is still active — see
 * `TwitterImport` for why liveness costs a request per account.
 */
export interface WireFollowing {
  id?: string;
  /** The handle. Present as both in practice; either may be used. */
  screen_name?: string;
  userName?: string;
  name?: string;
  description?: string;
  profile_image_url_https?: string;
  /** Lifetime tweet count. Zero means never posted. */
  statuses_count?: number;
  followers_count?: number;
  following_count?: number;
  /** Account creation date, NOT last activity. */
  created_at?: string;
  protected?: boolean;
  verified?: boolean;
}
