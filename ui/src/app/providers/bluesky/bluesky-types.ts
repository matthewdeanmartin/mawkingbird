// Minimal AT Protocol / app.bsky view shapes — only what the adapter consumes.

export interface BskyAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

/**
 * The viewer's relationship to an actor — `app.bsky.actor.defs#viewerState`.
 *
 * `following` and `followedBy` are not booleans: they are the at-uris of the
 * follow *records*, which is exactly what unfollowing needs (deleteRecord takes
 * the record's uri). Absent means "no such record", so presence is the boolean.
 */
export interface BskyViewerState {
  following?: string;
  followedBy?: string;
  blocking?: string;
  blockedBy?: boolean;
  muted?: boolean;
}

/** `app.bsky.actor.defs#profileViewDetailed` — the fields the rail card shows. */
export interface BskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  viewer?: BskyViewerState;
}

/** The mutable `app.bsky.actor.profile/self` repository record. */
export interface BskyProfileRecord extends Record<string, unknown> {
  $type?: 'app.bsky.actor.profile';
  displayName?: string;
  description?: string;
  avatar?: BskyBlobRef;
  banner?: BskyBlobRef;
}

/** A repository record plus the CID used for optimistic replacement. */
export interface BskyRepoRecord<T extends Record<string, unknown>> {
  uri: string;
  cid: string;
  value: T;
}

export interface BskyFacet {
  index: { byteStart: number; byteEnd: number };
  features: {
    $type: string;
    did?: string; // mention
    uri?: string; // link
    tag?: string; // hashtag
  }[];
}

export interface BskyPostRecord {
  $type: string;
  text: string;
  createdAt: string;
  /**
   * Declared languages, BCP-47. Optional — plenty of clients omit it — and an
   * array because a post may declare several; Mastodon's `language` is a single
   * value, so the adapter takes the first. This is what `lang:` filters on and
   * what the Language facet counts.
   */
  langs?: string[];
  facets?: BskyFacet[];
  reply?: {
    root: { uri: string; cid: string };
    parent: { uri: string; cid: string };
  };
}

export interface BskyImage {
  thumb: string;
  fullsize: string;
  alt: string;
}

/**
 * A blob reference, as `uploadBlob` returns it and as a record must carry it.
 *
 * The `$type: 'blob'` and the `ref.$link` CID are part of the wire format, not
 * decoration — a record embedding a blob without them is rejected. Passed back
 * verbatim rather than reconstructed, so a future lexicon change to the shape
 * does not need a matching change here.
 */
export interface BskyBlobRef {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface BlobUploadResponse {
  blob: BskyBlobRef;
}

/**
 * The write-side images embed: what goes *into* a post record.
 *
 * Distinct from {@link BskyEmbedView}, which is the read-side shape the API
 * returns with a hydrated post — that one carries rendered CDN URLs, this one
 * carries blob references. They are not interchangeable, and conflating them is
 * how an embed that looks right fails to publish.
 */
export interface BskyImagesEmbed {
  $type: 'app.bsky.embed.images';
  images: {
    image: BskyBlobRef;
    /** Alt text. Required by the lexicon — empty string when none was given. */
    alt: string;
    aspectRatio?: { width: number; height: number };
  }[];
}

/** A post embed view; `$type` discriminates (images / external / record / recordWithMedia). */
export interface BskyEmbedView {
  $type: string;
  images?: BskyImage[];
  external?: { uri: string; title: string; description: string; thumb?: string };
  record?: BskyEmbeddedRecord | { record: BskyEmbeddedRecord };
  media?: BskyEmbedView;
}

/** app.bsky.embed.record#viewRecord (or viewNotFound / viewBlocked). */
export interface BskyEmbeddedRecord {
  $type?: string;
  uri?: string;
  cid?: string;
  author?: BskyAuthor;
  value?: BskyPostRecord;
}

export interface BskyPostView {
  uri: string;
  cid: string;
  author: BskyAuthor;
  record: BskyPostRecord;
  embed?: BskyEmbedView;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  indexedAt: string;
  viewer?: { like?: string; repost?: string; bookmarked?: boolean };
}

/** Private bookmark page; blocked/not-found items do not have a post record. */
export interface BskyBookmarks {
  cursor?: string;
  bookmarks: { subject: { uri: string; cid: string }; createdAt?: string; item: unknown }[];
}

/** Narrow an open-union bookmark item to the post view the shared UI can render. */
export function isBskyPostView(item: unknown): item is BskyPostView {
  if (!item || typeof item !== 'object') return false;
  const value = item as Partial<BskyPostView>;
  return (
    typeof value.uri === 'string' &&
    typeof value.cid === 'string' &&
    !!value.author &&
    !!value.record
  );
}

export interface BskyFeedItem {
  post: BskyPostView;
  reason?: { $type: string; by?: BskyAuthor; indexedAt?: string };
}

export interface BskyTimeline {
  feed: BskyFeedItem[];
  cursor?: string;
}

/**
 * How `app.bsky.feed.getAuthorFeed` is filtered.
 *
 * Mastodon's profile has three toggles (boosts, replies, media); Bluesky
 * expresses the same choices as one server-side filter, so the profile page maps
 * its toggles onto these rather than filtering client-side and paging holes.
 */
export type BskyAuthorFeedFilter =
  | 'posts_with_replies'
  | 'posts_no_replies'
  | 'posts_with_media'
  | 'posts_and_author_threads';

/** `app.bsky.feed.getPostThread` node; `post` is absent on notFound/blocked variants. */
export interface BskyThreadNode {
  $type?: string;
  post?: BskyPostView;
  parent?: BskyThreadNode;
  replies?: BskyThreadNode[];
}

// ------------------------------------------------------------- feeds & lists

/**
 * One entry in `savedFeedsPrefV2`.
 *
 * `type` is `feed` (an algorithm), `list` (a curated set of accounts) or
 * `timeline` — the last being the reader's own follows feed, which Mockingbird
 * already contributes as `BlueskyProvider` and must not show again.
 */
export interface BskySavedFeed {
  id: string;
  type: string;
  /** An at-uri for feeds and lists; the literal `following` for `timeline`. */
  value: string;
  pinned: boolean;
}

/** `app.bsky.feed.defs#generatorView` — an algorithmic feed's description. */
export interface BskyGeneratorView {
  uri: string;
  cid: string;
  did: string;
  creator: BskyProfile;
  displayName: string;
  description?: string;
  avatar?: string;
  likeCount?: number;
  indexedAt: string;
}

/** `app.bsky.graph.defs#listView`. `purpose` decides whether it is readable. */
export interface BskyListView {
  uri: string;
  cid: string;
  creator: BskyProfile;
  name: string;
  purpose: string;
  description?: string;
  avatar?: string;
  listItemCount?: number;
  indexedAt: string;
}

/**
 * The only list purpose that belongs in a feeds tab.
 *
 * A `modlist` is a block/mute list and a `referencelist` backs a starter pack —
 * rendering either as a readable feed would be actively misleading. Matching
 * this value specifically (rather than excluding the two known bad ones) stays
 * correct when the enum grows.
 */
export const BSKY_CURATE_LIST = 'app.bsky.graph.defs#curatelist';

/**
 * `app.bsky.graph.getFollowers` output. `subject` is the actor whose followers
 * these are — ignored here, since the profile header already has them.
 */
export interface BskyFollowers {
  subject: BskyProfile;
  followers: BskyProfile[];
  cursor?: string;
}

/** `app.bsky.graph.getFollows` output — the *following* list, not followers. */
export interface BskyFollows {
  subject: BskyProfile;
  follows: BskyProfile[];
  cursor?: string;
}

/**
 * `app.bsky.actor.searchActors` output.
 *
 * Actors are `profileView`: handle, display name, avatar and bio, but **no
 * counts** and — when the call was anonymous — no `viewer` either.
 */
export interface BskySearchActors {
  actors: BskyProfile[];
  cursor?: string;
}

/** `app.bsky.feed.searchPosts` output. Posts are full `postView`s. */
export interface BskySearchPosts {
  posts: BskyPostView[];
  cursor?: string;
  /**
   * Approximate match count. The lexicon says it "may be rounded or
   * incomplete" — a real query returned exactly 10000, which is a ceiling, not
   * a count. Never use it for "page X of Y".
   */
  hitsTotal?: number;
}

// -------------------------------------------------------------- notifications

/**
 * One row of `app.bsky.notification.listNotifications`.
 *
 * `record` is the *notifying* record and varies with `reason`: a like record for
 * `like`, the reply post itself for `reply`, a follow record for `follow`. For
 * the reasons whose record is not the interesting post, `reasonSubject` names
 * the post that is — see {@link BskyNotification.reasonSubject}.
 */
export interface BskyNotification {
  uri: string;
  cid: string;
  author: BskyAuthor;
  /**
   * Why this arrived. `knownValues` in the lexicon, which in AT Protocol means
   * "these are known, others are legal" — so this stays a plain string and the
   * adapter has a default arm. A `repost-via-repost` turned up in the first 20
   * notifications of a test account, so the long tail is not theoretical.
   */
  reason: string;
  /**
   * The post that was liked/reposted/replied to, when the reason implies one.
   * Absent for `follow`. **Not always a post**: a `repost-via-repost` names a
   * repost record, which `getPosts` will not return.
   */
  reasonSubject?: string;
  record?: { $type?: string } & Partial<BskyPostRecord>;
  isRead: boolean;
  indexedAt: string;
}

export interface BskyNotificationPage {
  notifications: BskyNotification[];
  cursor?: string;
  seenAt?: string;
  priority?: boolean;
}

// ---------------------------------------------------------------- chat (DMs)

export interface BskyChatMember {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

/** chat.bsky.convo.defs#messageView (deleted messages arrive with no text). */
export interface BskyMessageView {
  $type?: string;
  id: string;
  rev: string;
  text?: string;
  facets?: BskyFacet[];
  sender: { did: string };
  sentAt: string;
}

export interface BskyConvoView {
  id: string;
  rev: string;
  members: BskyChatMember[];
  lastMessage?: BskyMessageView;
  muted?: boolean;
  unreadCount: number;
}

export interface BskyConvoList {
  convos: BskyConvoView[];
  cursor?: string;
}

/** chat.bsky.convo.getLog entry; `$type` ends in #logCreateMessage etc. */
export interface BskyChatLogEntry {
  $type: string;
  rev: string;
  convoId: string;
  message?: BskyMessageView;
}

/** What the provider stashes in `Status.providerRef` for later interactions. */
export interface BskyRef {
  uri: string;
  cid: string;
  /** at-uri of the viewer's like/repost record, when they exist (needed to undo). */
  likeUri: string | null;
  repostUri: string | null;
  /** The thread root to use when replying to this post. */
  replyRoot: { uri: string; cid: string };
  /**
   * The at-uri of the post this one directly replies to, or null for a
   * top-level post.
   *
   * `Status.in_reply_to_id` carries the same thing, but prefixed and stringly
   * typed; keeping the raw uri here lets thread-position filtering compare it
   * against {@link replyRoot} without re-parsing. Equal uris mean a direct
   * reply to the thread starter; different ones mean a reply further down.
   */
  replyParentUri: string | null;
  /**
   * The external link card's target, when the post carries one.
   *
   * The adapter renders this card into `content` as an anchor, but the
   * "linked domain" facet needs the url as data. Recovering it by re-parsing
   * the rendered HTML would couple a filter to a presentation detail, so it
   * rides here — the place Bluesky-specific post data already lives.
   */
  externalUri: string | null;
}
