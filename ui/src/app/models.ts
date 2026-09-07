// Mastodon API object shapes (the subset the UI consumes).

/**
 * Where a timeline item came from. Absent means Mastodon (the primary network).
 * Foreign providers (`providers/`) adapt their content into these same Mastodon
 * shapes and tag it, so the rest of the app renders everything identically.
 */
export type ProviderId =
  | 'mastodon'
  | 'anonymous-mastodon'
  | 'bluesky'
  | 'rss'
  | 'paste'
  | 'blog'
  | 'twitter';

export interface Role {
  id: string;
  name: string;
  permissions: string;
  highlighted: boolean;
}

/** A key/value profile metadata field ("Website", "Pronouns", …). */
export interface AccountField {
  name: string;
  value: string;
  verified_at?: string | null;
}

/** Editable defaults returned in `source` on verify_credentials. */
export interface AccountSource {
  privacy: string;
  sensitive: boolean;
  language: string | null;
  note: string;
  fields: AccountField[];
}

export interface Account {
  id: string;
  username: string;
  acct: string;
  display_name: string;
  note: string;
  url: string;
  avatar: string;
  avatar_static: string;
  header: string;
  header_static?: string;
  followers_count: number;
  following_count: number;
  statuses_count: number;
  last_status_at?: string | null;
  /**
   * When the account joined, ISO. Mastodon sends this on every account entity,
   * including the ones in `/followers` and `/following` pages — which is what
   * makes tenure-adjusted cadence (posts per day since joining) free to compute
   * in {@link ../effective-audience}. Optional because thin account objects
   * synthesised by the non-Mastodon providers don't carry it.
   */
  created_at?: string;
  bot: boolean;
  locked: boolean;
  discoverable?: boolean | null;
  indexable?: boolean | null;
  noindex?: boolean | null;
  fields: AccountField[];
  // Present on verify_credentials (CredentialAccount): the current user's role, or null.
  role?: Role | null;
  source?: AccountSource;
}

export interface MediaAttachment {
  id: string;
  type: string;
  url: string;
  preview_url: string;
  description: string | null;
}

export interface PollOption {
  title: string;
  votes_count: number;
}

export interface Poll {
  id: string;
  expires_at: string | null;
  expired: boolean;
  multiple: boolean;
  votes_count: number;
  voters_count: number;
  options: PollOption[];
  voted: boolean;
  own_votes: number[];
  // hide_totals is not serialized by the mock; totals are always returned.
}

/** A status's quote of another status (Mastodon `Quote` entity). */
export interface Quote {
  // pending | accepted | rejected | revoked | deleted | unauthorized
  state: string;
  // The quoted status, or null when it is not visible (e.g. revoked).
  quoted_status: Status | null;
}

/** `StatusMention` — a resolved @-mention inside a status. */
export interface Mention {
  id: string;
  username: string;
  acct: string;
  url: string;
}

/** Link preview metadata supplied with a Mastodon status. */
export interface PreviewCard {
  url: string;
  title: string;
  description: string;
  type: 'link' | 'photo' | 'video' | 'rich' | string;
  author_name?: string;
  author_url?: string;
  provider_name: string;
  provider_url?: string;
  html?: string;
  width?: number;
  height?: number;
  image: string | null;
  embed_url?: string;
  blurhash?: string | null;
}

export interface Status {
  /** Absent = Mastodon. Foreign statuses use namespaced ids (e.g. "rss:…"). */
  provider?: ProviderId;
  /** Opaque handle the owning provider needs for interactions (uri/cid etc.). */
  providerRef?: unknown;
  id: string;
  created_at: string;
  edited_at: string | null;
  content: string;
  spoiler_text: string;
  visibility: string;
  url: string | null;
  account: Account;
  reblog: Status | null;
  quote: Quote | null;
  in_reply_to_id: string | null;
  /**
   * Who this post replies to. Mastodon sends it alongside `in_reply_to_id`, and
   * it is the only way to know *whom* a reply was to without fetching the parent
   * — which is what makes "top conversation partner" free over a post sample.
   * Optional: foreign providers don't supply it.
   */
  in_reply_to_account_id?: string | null;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  favourited: boolean;
  reblogged: boolean;
  bookmarked: boolean;
  muted: boolean;
  pinned: boolean;
  sensitive: boolean;
  poll: Poll | null;
  quote_approval_policy: string | null;
  /** ISO 639 language code Mastodon detected/declared for the post. Nullable. */
  language?: string | null;
  media_attachments: MediaAttachment[];
  /** Preview card for a link in the post. Absent on providers that do not supply one. */
  card?: PreviewCard | null;
  /** The app the post was made with (nullable; absent on some providers). */
  application?: { name: string; website?: string | null } | null;
  /** Optional: not every provider supplies it, but Mastodon (and the mock) do. */
  mentions?: Mention[];
  /**
   * Hashtags in the post, as `{ name, url }`. Mastodon and the mock both send
   * them, which is why a tag profile costs no extra requests; foreign providers
   * generally don't, so treat absence as "unknown", not "none".
   */
  tags?: { name: string; url: string }[];
  /**
   * The viewer's content filters this status matched, computed by the server
   * (Mastodon 4.0+). Clients must apply them: `warn` collapses the post,
   * `hide` drops it. Absent on foreign providers and older servers.
   */
  filtered?: FilterResult[];
  /**
   * RSS only: whether `content` is the feed's full article body
   * (`content:encoded` / Atom `<content>`) rather than a teaser
   * (`<description>` / `<summary>`). Reader mode uses this to suppress or
   * relabel "Fetch article" — see `providers/article/article-target.ts`.
   * Undefined on every non-RSS provider.
   */
  rssFullContent?: boolean;
}

/** One matched filter on a status (`Status.filtered[]`). */
export interface FilterResult {
  filter: {
    id: string;
    title: string;
    context: FilterContext[];
    expires_at: string | null;
    filter_action: FilterAction;
  };
  keyword_matches: string[] | null;
  status_matches: string[] | null;
}

/** A single edit-history snapshot (`GET /api/v1/statuses/{id}/history`). */
export interface StatusEdit {
  content: string;
  spoiler_text: string;
  sensitive: boolean;
  created_at: string;
  account: Account;
  media_attachments: MediaAttachment[];
  poll: Poll | null;
}

export interface StatusSource {
  id: string;
  text: string;
  spoiler_text: string;
}

/** Result of `POST /api/v1/statuses/{id}/translate`. */
export interface Translation {
  content: string;
  spoiler_text: string;
  detected_source_language: string;
  provider: string;
}

/** Options accepted by the composer's status-create path. */
export interface ComposeOptions {
  inReplyToId?: string;
  /** Quote another status (Mastodon 4.5+ `quoted_status_id`). */
  quotedStatusId?: string;
  visibility?: string;
  spoilerText?: string;
  sensitive?: boolean;
  mediaIds?: string[];
  poll?: PollDraft;
  /** ISO datetime; when ≥ ~5 min out the server schedules instead of posting. */
  scheduledAt?: string;
  /** ISO 639-1 language for the post; omitted lets the server auto-detect. */
  language?: string;
}

/**
 * A status waiting to be published (`/api/v1/scheduled_statuses`). `params`
 * echoes the create-request fields rather than a rendered Status.
 */
export interface ScheduledStatus {
  id: string;
  scheduled_at: string;
  params: {
    text: string;
    visibility?: string;
    spoiler_text?: string | null;
    sensitive?: boolean | null;
    in_reply_to_id?: string | null;
    poll?: { options: string[] } | null;
  };
  media_attachments: MediaAttachment[];
}

/** A poll being composed (UI-side), serialized to `poll[...]` params. */
export interface PollDraft {
  options: string[];
  expiresIn: number;
  multiple: boolean;
}

export interface Context {
  ancestors: Status[];
  descendants: Status[];
}

export interface Relationship {
  id: string;
  following: boolean;
  followed_by: boolean;
  requested: boolean;
  blocking: boolean;
  muting: boolean;
  /** Whether boosts/retweets from this followed account appear in home. */
  showing_reblogs?: boolean;
}

export interface MastodonNotification {
  id: string;
  type: string;
  created_at: string;
  account: Account;
  status?: Status;
}

export interface Hashtag {
  name: string;
  url: string;
  /**
   * Usage history, when the server sends it. `/api/v2/search?type=hashtags`
   * returns Tag entities, which carry history — this type was narrower than
   * the payload. Optional because not every source populates it (the mock
   * returns an empty array, and older servers may omit it entirely).
   */
  history?: TrendingTagHistory[];
}

export interface AnnouncementReaction {
  name: string;
  count: number;
  me: boolean;
  url: string | null;
  static_url: string | null;
}

export interface Announcement {
  id: string;
  content: string;
  // Present on the admin surface; undefined on the public read endpoint.
  published?: boolean;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
  published_at: string | null;
  updated_at: string | null;
  read: boolean;
  reactions: AnnouncementReaction[];
}

export interface TrendingTagHistory {
  day: string;
  uses: string;
  accounts: string;
}

export interface TrendingTag {
  id: string;
  name: string;
  url: string;
  history: TrendingTagHistory[];
}

export interface SearchResults {
  accounts: Account[];
  statuses: Status[];
  hashtags: Hashtag[];
}

export interface UserList {
  id: string;
  title: string;
}

/** A single membership entry inside a Collection (Mastodon 4.6+). */
export interface CollectionItem {
  id: string;
  account_id: string | null;
  state: 'pending' | 'accepted';
  created_at: string;
}

/** A curated collection of accounts a user recommends (Mastodon 4.6+). */
export interface Collection {
  id: string;
  account_id: string;
  name: string;
  description: string;
  discoverable: boolean;
  sensitive: boolean;
  local: boolean;
  item_count: number;
  items: CollectionItem[];
  created_at: string;
  updated_at: string;
  uri: string;
  url?: string | null;
  language?: string | null;
}

/** GET /api/v1/collections/:id — the collection plus full account entities. */
export interface CollectionWithAccounts {
  collection: Collection;
  accounts: Account[];
}

/** Mock-only dev account record used by the login screen. */
export interface DevUser {
  id: string;
  username: string;
  display_name: string;
  role: string;
  access_token: string;
}

/** Per-phase row counts + timings returned by the sample-data generator. */
export interface GenerationReport {
  accounts: number;
  relationships: number;
  statuses: number;
  favourites: number;
  bookmarks: number;
  notifications: number;
  total_rows: number;
  total_seconds: number;
  rows_per_second: number;
}

export interface InstanceRule {
  id: string;
  text: string;
  hint: string;
}

export interface TermsOfService {
  effective_date: string | null;
  effective: boolean;
  content: string;
  succeeded_by: string | null;
}

/** Subset of `GET /api/v2/instance` the explore page renders. */
export interface InstanceInfo {
  domain: string;
  title: string;
  description: string;
  version: string;
  usage: { users: { active_month: number } };
  thumbnail: { url: string | null };
  contact: { email: string; account: Account | null };
  rules: InstanceRule[];
}

/** A trending preview card (`GET /api/v1/trends/links`). */
export interface TrendLink {
  url: string;
  title: string;
  description: string;
  provider_name: string;
}

export interface CustomEmoji {
  shortcode: string;
  url: string;
  static_url: string;
  visible_in_picker: boolean;
  category?: string;
}

// --- Admin / moderation entities ---

export interface AdminAccount {
  id: string;
  username: string;
  domain: string | null;
  email: string;
  created_at: string;
  role: Role;
  confirmed: boolean;
  approved: boolean;
  disabled: boolean;
  silenced: boolean;
  suspended: boolean;
  account: Account;
}

export interface AdminReport {
  id: string;
  action_taken: boolean;
  category: string;
  comment: string;
  created_at: string;
  account: AdminAccount | null;
  target_account: AdminAccount | null;
  assigned_account: AdminAccount | null;
  statuses: Status[];
}

export interface DomainBlock {
  id: string;
  domain: string;
  severity: string;
  reject_media: boolean;
  reject_reports: boolean;
  public_comment: string | null;
  created_at: string;
}

export interface DomainAllow {
  id: string;
  domain: string;
  created_at: string;
}

export interface EmailDomainBlock {
  id: string;
  domain: string;
  created_at: string;
}

export interface CanonicalEmailBlock {
  id: string;
  canonical_email_hash: string;
}

export interface IpBlock {
  id: string;
  ip: string;
  severity: string;
  comment: string;
  created_at: string;
  expires_at: string | null;
}

/** A single zero/empty admin measure (admin/measures). */
export interface AdminMeasure {
  key: string;
  unit: string | null;
  total: string;
  human_value: string;
  previous_total: string;
  data: { date: string; value: string }[];
}

// --- Conversations (DMs) ---

export interface Conversation {
  id: string;
  unread: boolean;
  accounts: Account[];
  last_status: Status | null;
}

// --- Tags ---

/** Full Mastodon `Tag` entity (richer than the search `Hashtag`). */
export interface Tag {
  id: string;
  name: string;
  url: string;
  following: boolean;
  featuring: boolean;
  history: TrendingTagHistory[];
}

export interface FeaturedTag {
  id: string;
  name: string;
  url: string;
  statuses_count: number;
  last_status_at: string | null;
}

// --- Fault injection (mock-only control plane) ---

export interface FaultMatch {
  methods: string[] | null;
  path: string | null;
  path_regex: string | null;
}

export type FaultEffectType = 'status' | 'ratelimit' | 'latency' | 'malformed' | 'timeout';

export interface FaultEffect {
  type: FaultEffectType;
  status: number;
  body: unknown;
  headers: Record<string, string>;
  delay_ms: number;
  truncate: boolean;
}

export interface FaultRule {
  id: string;
  match: FaultMatch;
  effect: FaultEffect;
  remaining: number | null;
}

/** Shape POSTed to create a fault rule (mirrors FaultStore.add's input). */
export interface FaultRuleDraft {
  match: {
    methods?: string[];
    path?: string;
    path_regex?: string;
  };
  effect: {
    type: FaultEffectType;
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
    delay_ms?: number;
    truncate?: boolean;
  };
  count?: number;
}

// --- OAuth (full authorization-code flow) ---

export interface OAuthApp {
  id: string;
  name: string;
  website: string | null;
  redirect_uri: string;
  redirect_uris: string[];
  client_id: string;
  client_secret: string;
  vapid_key: string;
  scopes: string[];
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  created_at: number;
}

// --- Filters (v2) ---

export interface FilterKeyword {
  id: string;
  keyword: string;
  whole_word: boolean;
}

export interface FilterStatus {
  id: string;
  status_id: string;
}

export type FilterContext = 'home' | 'notifications' | 'public' | 'thread' | 'account';
export type FilterAction = 'warn' | 'hide';

export interface ContentFilter {
  id: string;
  title: string;
  context: FilterContext[];
  expires_at: string | null;
  filter_action: FilterAction;
  keywords: FilterKeyword[];
  statuses: FilterStatus[];
}

/** Draft keyword rows sent as `keywords_attributes` when creating a filter. */
export interface FilterKeywordDraft {
  keyword: string;
  whole_word: boolean;
}

// --- Preferences (`/api/v1/preferences`, read-only) ---

export interface Preferences {
  'posting:default:visibility': string;
  'posting:default:sensitive': boolean;
  'posting:default:language': string | null;
  'reading:expand:media': string;
  'reading:expand:spoilers': boolean;
}

// --- Mock-only settings (`/api/v1/_mock/settings` and friends) ---

export interface AppearanceSettings {
  theme: 'auto' | 'light' | 'dark';
  reduce_motion: boolean;
  disable_swiping: boolean;
  expand_spoilers: boolean;
  display_media: 'default' | 'show_all' | 'hide_all';
}

export interface EmailNotificationSettings {
  follow: boolean;
  follow_request: boolean;
  reblog: boolean;
  favourite: boolean;
  mention: boolean;
  report: boolean;
  digest: boolean;
}

export interface PostDeletionSettings {
  enabled: boolean;
  min_age_days: number;
  keep_pinned: boolean;
  keep_favourited: boolean;
  keep_media: boolean;
  keep_polls: boolean;
  min_favourites: number;
  min_reblogs: number;
}

export interface MockSettings {
  appearance: AppearanceSettings;
  email_notifications: EmailNotificationSettings;
  post_deletion: PostDeletionSettings;
}

export interface Invite {
  id: string;
  code: string;
  url: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
  revoked: boolean;
}

export interface AuthorizedApp {
  id: string;
  name: string;
  website: string | null;
  scopes: string[];
  last_used_at: string | null;
}

export interface ImportReport {
  type: string;
  imported: number;
  skipped: string[];
}
