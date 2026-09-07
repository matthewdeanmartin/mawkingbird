/**
 * The inventory of everything this app keeps in `localStorage`, classified by
 * how dangerous it is to let it leave the browser.
 *
 * This exists because settings export is going somewhere specific: a user
 * publishing their Mawkingbird setup as a **public gist** and pointing other
 * people at it. That makes "is this safe to write to a file?" a question with
 * two different answers, not one:
 *
 *   - Would leaking it let someone *act as me*?  → {@link Sensitivity} `secret`
 *   - Would leaking it tell someone *about me*?  → `private`
 *
 * The second is the one that is easy to get wrong. A follow list or a
 * subscribed hashtag is not a credential and never will be, but "subscribed to
 * #diabetesSufferers" published on a gist is a health disclosure the user did
 * not intend to make. Tag subscriptions, muted words, saved searches, and the
 * instance you call home are all in that category.
 *
 * Two export profiles fall out of this (see {@link EXPORT_PROFILES}):
 * `shareable` publishes `setting` only, `personal` adds `private` and
 * `content`. Nothing ever exports `secret` or `cache`.
 */

/** How sensitive one storage key's contents are. */
export type Sensitivity =
  /**
   * A credential. Leaking it lets someone act as the user. Never exported,
   * under any profile, for any reason. Access tokens, JWTs, paste edit keys.
   */
  | 'secret'
  /**
   * Not a credential, but it discloses something about the person: who they
   * follow, what they mute, which tags and feeds they read, which instance
   * they are on. Fine in a personal backup, never in something published.
   */
  | 'private'
  /**
   * Text the user wrote and has not necessarily published: drafts, local
   * posts, DMs, paste bodies. Excluded from a shareable export, and worth its
   * own opt-in even in a personal one because of the bulk.
   */
  | 'content'
  /**
   * A preference with no personal content: theme, fonts, feature flags,
   * layout, retention policy. This is the stuff worth publishing — the actual
   * payload of a "here is my setup" gist.
   */
  | 'setting'
  /**
   * Refetchable data held only to avoid a request. Never exported: it is noise
   * at best, and some of it (feed corpus, instance probes) is derived from
   * `private` data anyway.
   */
  | 'cache';

export interface StorageKeySpec {
  /** The key, or its unsuffixed base when `scoped`. */
  base: string;
  /**
   * Which store it lives in. `session` keys die with the tab and are never
   * exportable regardless of sensitivity; they are inventoried so that "every
   * key is classified" is a claim about all of them, not just the durable ones.
   */
  storage: 'local' | 'session';
  /**
   * How the real key relates to `base`:
   *
   * - `none`     — the key *is* the base.
   * - `account`  — `base + accountScopeSuffix()`. Verified Mastodon scopes use
   *   provider + server origin + server-local account id; Bluesky uses its DID,
   *   and Anonymous has a fixed suffix. Importers still re-derive the suffix for
   *   the destination identity rather than trusting a raw exported key.
   * - `instance` — `base + encodeURIComponent(host)`, one entry per instance.
   *
   * Use {@link matchesKey} rather than reimplementing this comparison; a key
   * that no rule matches is treated as unregistered, and so is never exported.
   */
  suffix: 'none' | 'account' | 'instance';
  sensitivity: Sensitivity;
  /**
   * Which teardown this key belongs to, for "delete my data on the way out".
   *
   * `'anonymous'` marks data that belongs to the browser-local Anonymous session
   * *and nothing else* — so it can be erased while a saved signed-in account keeps
   * working. That is the middle option of the leave dialog, and the one most people
   * on a shared machine actually want.
   *
   * Deliberately narrow. An account-suffixed key like `mockingbird_client_lists` is
   * shared with signed-in sessions and must **not** be marked, or "delete my
   * anonymous data" would quietly take a signed-in user's lists with it. When in
   * doubt leave it unset: the key is still erased by the full wipe, which is the
   * option that promises to take everything.
   */
  group?: 'anonymous';
  /** Why it is classified this way — the part that is not obvious from the name. */
  note: string;
}

/**
 * Every localStorage key the app writes.
 *
 * Adding a key without adding it here is a bug: `storage-registry.spec.ts`
 * scans the source for `localStorage.setItem` and fails on anything unlisted,
 * so an unclassified key can never quietly reach an export.
 */
export const STORAGE_KEYS: readonly StorageKeySpec[] = [
  // ---- secret: credentials, never exported ----
  {
    base: 'mastodon_mock_token',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'Active Mastodon bearer token.',
  },
  {
    base: 'mastodon_mock_session_tokens',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'Bearer token per saved session, keyed by session id. Split out of mastodon_mock_sessions so the account list can be exported.',
  },
  {
    base: 'mockingbird_bsky_credentials',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'secret',
    note: 'Bluesky access + refresh JWTs. Split out of mockingbird_bsky_profile.',
  },
  {
    base: 'mockingbird_bsky_identity_credentials',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'DID-keyed JWT and app-password records for Bluesky-primary accounts. Unscoped because the collection contains the DID used to derive each account scope.',
  },
  {
    base: 'mockingbird_mastodon_connector_token',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'secret',
    note: 'Bearer token for a Mastodon CONNECTOR — Mastodon attached to a Bluesky-primary account, not the identity itself. Split out of mockingbird_mastodon_connector so the server can be exported and the credential cannot. Account-scoped, unlike mastodon_mock_session_tokens: a connector hangs off one identity.',
  },
  {
    base: 'mockingbird_github_credentials',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'secret',
    note: 'GitHub personal access token. Split out of mockingbird_github_user.',
  },
  {
    base: 'mockingbird_raindrop_token',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'Raindrop.io test token. Unscoped: one bookmark drawer per browser, shared by every account. An account-suffixed copy from before that change is adopted on first read and may linger.',
  },
  {
    base: 'mockingbird_mataroa_connection',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'secret',
    note: 'Mataroa API key plus the linked public blog URL and profile-feed opt-in. Account-scoped because the blog is part of one public persona.',
  },
  {
    base: 'mockingbird_hugo_credentials',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'secret',
    note: 'Fine-grained GitHub token with write access to the Hugo blog repository. Deliberately separate from mockingbird_github_credentials, which is read-only.',
  },
  {
    base: 'mockingbird_gist_credentials',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'secret',
    note: 'GitHub token with the gist scope, for publishing pastes as gists. Deliberately separate from mockingbird_github_credentials (read-only) and mockingbird_hugo_credentials (one repo): sharing one token would widen what a single leaked string reaches.',
  },
  {
    base: 'mockingbird_gist_profile',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'The GitHub login the gist token belongs to, so the provider can name itself. Split out of mockingbird_gist_credentials so a settings export can say gists are on without carrying the token.',
  },
  {
    base: 'mockingbird_posse_queue',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Interactions (likes, boosts, replies) waiting to be recorded to the Hugo blog. Holds no credentials — public post URLs and the user’s own reply text. Account-scoped because a POSSE record is a claim by one persona.',
  },
  {
    base: 'mockingbird_hugo_repo',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Hugo blog repository coordinates: owner, repo, branch, content path, public site URL, profile-feed opt-in. Account-scoped because the blog is part of one public persona.',
  },
  {
    base: 'mockingbird_paste_edit_keys',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'Per-paste edit codes. A bearer capability: whoever holds one can rewrite or delete that paste. Split out of mockingbird_pastes.',
  },
  {
    base: 'mockingbird_pastepile_key',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'Optional Pastepile API key plus its revocation secret. Free and account-less; it tags created pastes so they are listable under scope=mine ("My pastes"). Unscoped: it authorises this browser to talk to a pastebin, not one persona — which feeds a persona subscribes to stays per account. Retention-governed like the other pasted tokens.',
  },
  {
    base: 'mockingbird_cors_proxy_key',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'CORS proxy API key, plus the header name a custom proxy wants it in. Billable on a paid plan, so it is retention-governed like the other pasted tokens. Unscoped: the subscription belongs to the human, not to one persona. Split out of mockingbird_cors_proxy so the proxy choice itself stays exportable.',
  },
  {
    // Declared as SECRET_KEY in twitter-settings.ts, deliberately split from
    // CONFIG_KEY (mockingbird_twitter) so the service choice and the probe
    // verdict stay exportable while the credential never is. Same split as
    // mockingbird_cors_proxy / mockingbird_cors_proxy_key.
    base: 'mockingbird_twitter_keys',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: "API keys for the Twitter/X read services (per service, each with its own retention stamp). Billable on a paid plan and able to read on the user's behalf, so it is treated exactly like the other pasted tokens. Unscoped: the subscription belongs to the human, not to one persona.",
  },
  {
    base: 'mockingbird_shortener_keys',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'API keys for the link shorteners (Dub, Short.io, T.LY), one per service, each with its own retention stamp. A key here can create, re-point and delete links on a domain the user publishes under, so it is treated exactly like the other pasted tokens. Unscoped: the subscription belongs to the human, not to one persona. Split out of mockingbird_shortener so the service choice stays exportable.',
  },

  // ---- private: discloses something about the person ----
  {
    base: 'mastodon_mock_sessions',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Which accounts on which instances. Identity, not credentials — the tokens live in mastodon_mock_session_tokens.',
  },
  {
    base: 'mastodon_mock_server',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Home instance. Names where the user is; a niche instance can be identifying on its own.',
  },
  {
    base: 'mockingbird_bsky_profile',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Linked Bluesky handle, DID, display name, avatar, resolved PDS.',
  },
  {
    base: 'mockingbird_bsky_identity_profile',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'DID-keyed profiles for every saved Bluesky-primary account: handle, DID, display name and avatar. Credentials live in the matching secret collection.',
  },
  {
    base: 'mockingbird_bsky_active_identity_did',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Which saved Bluesky-primary DID is currently selected. The account mode separately records that Bluesky is active.',
  },
  {
    base: 'mockingbird_bsky_identity_did',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Deprecated active-DID pointer consumed and removed by the multi-identity migration.',
  },
  {
    base: 'mockingbird_mastodon_connector',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Which Mastodon server a Bluesky-primary account opted into reading, and whether it has credentials there. The token lives in mockingbird_mastodon_connector_token. Private rather than setting: naming the instance you read is a disclosure, same reasoning as mastodon_mock_server.',
  },
  {
    base: 'mockingbird_github_user',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Linked GitHub login and profile.',
  },
  {
    base: 'mockingbird_anonymous_account',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    group: 'anonymous',
    note: 'The browser-local Anonymous profile.',
  },
  {
    base: 'mockingbird_anonymous_follows',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    group: 'anonymous',
    note: 'Who the Anonymous account follows.',
  },
  {
    base: 'mockingbird_anonymous_bookmarks',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    group: 'anonymous',
    note: 'What the Anonymous account saved.',
  },
  {
    base: 'mockingbird_anonymous_lists',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    group: 'anonymous',
    note: 'Anonymous account lists and their members.',
  },
  {
    base: 'mockingbird_anonymous_tags',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    group: 'anonymous',
    note: 'Followed hashtags. The canonical example of privacy-sensitive-but-not-secret: a health or identity tag published in a gist is a disclosure.',
  },
  {
    base: 'mockingbird_rss_feeds',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Subscribed feed URLs — what the user reads. Private feed URLs (Feedbin, Miniflux, Google Alerts) routinely embed an API key in the URL itself; by a decided business rule these are stored as-is and NOT treated as secrets, and no warning is shown — see mawkingbird_profile/docs/01-data-model.md. Real secret storage is future work. Each feed also carries its opt-in flag for the CORS proxy.',
  },
  {
    base: 'mockingbird_rss_read',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Which RSS items have been read, as item id → timestamp. Private for the same reason the subscription list is: it is a record of what the user actually read, item by item, which is more revealing than the feed list it derives from. The timestamp exists for a future 90-day prune.',
  },
  {
    base: 'mockingbird_reader_annotations',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: "The reader's highlights and notes: document id → [{anchor, note, timestamps}]. Private, and the most revealing store in the reader — a note is the user's own writing about a passage they chose to mark. Anchored to the extracted markdown rather than the remote page; see providers/read/reader-annotations.ts. Pruned at two years (longer than the library, because nothing can reconstruct a note) and 5,000 entries, and included in export for the same reason.",
  },
  {
    base: 'mockingbird_article_observed_failures',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Hosts where article expansion has failed on this device: host → {attempts, failures, lastDiagnosis, lastSeen}. Private because it is a record of sites the user tried to read. Only host-attributable verdicts (paywall, bot-check, …) are counted, a single success clears a host, and the map is LRU-bounded at 200. Local only: nothing is sent anywhere. See providers/article/observed-failures.ts.',
  },
  {
    base: 'mockingbird_reader_library',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: "The reader's library: document id → {url, title, shelf, page, timestamps}. Private for the same reason mockingbird_rss_read is, and more so — this is a list of the long-form things someone chose to read, with how far through each they got. Pruned at a year and 2,000 entries; see providers/read/reader-library.ts.",
  },
  {
    base: 'mockingbird_rss_starred',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Starred RSS items, as item id → timestamp. Kept apart from mockingbird_rss_read because starring is a deliberate keep and must not age out with read state.',
  },
  {
    base: 'mockingbird_cors_proxy',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: "Which CORS proxy is selected, and a self-hosted proxy's URL template. Not secret — the key half lives in mockingbird_cors_proxy_key — but a custom template names a host the user runs.",
  },
  {
    base: 'mockingbird_shortener',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Which link shortener is active, and the short domain configured for each. Not secret — the keys live in mockingbird_shortener_keys — but a branded domain names the user, which is rather the point of one.',
  },
  {
    base: 'mockingbird_twitter',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Which Twitter/X read service is selected, and the cached verdict on whether it can be reached from a browser at all. Not secret — the keys live in mockingbird_twitter_keys — but naming the service you read through is a disclosure, same reasoning as mockingbird_cors_proxy.',
  },
  {
    base: 'mockingbird_twitter_follows',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Which Twitter/X accounts are followed into the timeline. A follow list: not a credential, and squarely the kind of thing that should never reach a published gist.',
  },
  {
    base: 'mockingbird_nitter_host',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'The Nitter instance used for Twitter/X reads, replaceable when one dies. Private rather than setting for the same reason as mastodon_mock_server: a niche instance names where the reader goes.',
  },
  {
    base: 'mockingbird_trusted_accounts',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Accounts the reader marked as trusted, and the trust level each was given. A judgement about named people — closer to mockingbird_local_moderation than to a preference, and the kind of list that reads very differently out of context.',
  },
  {
    base: 'mockingbird_proxy_consent',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Which (service, CORS proxy) pairings the user agreed to send an API key through, and when. Supersedes mockingbird_shortener_proxy_consent, which is folded in on first read. Holds no credential itself, but it records a security decision: exporting and re-importing it elsewhere would carry consent the person never gave in that browser.',
  },
  {
    base: 'mockingbird_shortener_proxy_consent',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Which (shortener, CORS proxy) pairings the user agreed to send an API key through, and when. Holds no credential itself, but it records a security decision: exporting it and re-importing elsewhere would carry consent the person never gave in that browser.',
  },
  {
    base: 'mockingbird_paste_feeds',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Subscribed paste feeds — what the user reads, and whether each goes through the CORS proxy. Scoped per account: following a feed as one persona says nothing about what the others want in their timeline. An unscoped list from before that change is adopted by the first account to read it.',
  },
  {
    base: 'mockingbird_saved_searches',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Saved search terms. Reveals interests as directly as a tag subscription does.',
  },
  {
    base: 'mockingbird_recent_searches',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Recent query strings and selected search tabs. Account-scoped and private because search history reveals interests.',
  },
  {
    base: 'mockingbird_local_moderation',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Muted words, accounts and domains. Often discloses more than a follow list.',
  },
  {
    base: 'mockingbird_muted_posts',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Individually hidden posts.',
  },
  {
    base: 'mockingbird_eliza_following',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Whether the local Eliza account is followed.',
  },
  {
    base: 'mockingbird_rail_profile',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'private',
    note: 'Which profile cards are pinned to the rail — named accounts.',
  },
  {
    base: 'mockingbird_chat_read',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Per-conversation read markers; the conversation ids identify correspondents.',
  },
  {
    base: 'mockingbird_dismissed_announcements',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Dismissed announcement ids — server-specific, so it points at the instance.',
  },
  {
    base: 'mockingbird_house_ad_clicks',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    // Not 'setting': it is a record of what the user did, not a preference, so it
    // has no business in a "here is my setup" gist even though it is dull.
    note: 'How many times each right-rail house endorsement was clicked, and when. Local only — never sent anywhere.',
  },
  {
    base: 'mockingbird_route_log',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    // Route shapes only (ids are sanitized out), but "which parts of the app do
    // I use, and for how long" is still a description of the person's habits —
    // exactly the sort of dull-looking thing that has no place in a public gist.
    note: 'Per-route visit counts and time spent, for the Observability page. Paths are sanitized (no ids or queries). Local only — never sent anywhere.',
  },

  // ---- content: text the user wrote ----
  {
    base: 'mockingbird_drafts',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'content',
    note: 'Unpublished drafts scoped by server and account. Unscoped keys are no longer loaded.',
  },
  {
    base: 'mockingbird_compose_autosave',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'content',
    note: 'In-progress composer text scoped by server and account. Unscoped keys are no longer loaded.',
  },
  {
    base: 'mockingbird_pastes',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'content',
    note: 'Paste history including bodies. Edit codes are NOT here — see mockingbird_paste_edit_keys.',
  },
  {
    base: 'mockingbird_short_links',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'content',
    note: 'Short links this browser created: destination, short URL and the provider id needed to edit or delete them. Content rather than private because the destinations are things the user chose to publish. Link passwords are deliberately never stored here.',
  },
  {
    // Replaces mockingbird_eliza_dm and mockingbird_eliza_notifications, which
    // held the same thing under a bot-specific name before conversations became
    // a general store. `content` is inherited from both, and is right for the
    // same reason: these are messages the user wrote, in full.
    base: 'mockingbird_conversations',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'content',
    note: 'Local DM threads with in-app correspondents, message bodies included. Capped per correspondent and per conversation, but the cap is a size limit, not a privacy measure — a truncated private conversation is still a private conversation.',
  },
  {
    base: 'mockingbird_local_posts',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'content',
    note: 'Locally-composed posts.',
  },
  {
    base: 'mockingbird_write_workspace',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'content',
    note: 'The writing board: draft cards, their column placement and split-view layout. Holds draft text, so it is content rather than a setting even though the layout half of it is only a preference.',
  },

  // ---- setting: the publishable payload ----
  {
    base: 'mockingbird_menu_indicator_preferences',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Local-hour menu indicator delivery schedule and chat batching.',
  },
  {
    base: 'mockingbird_menu_indicator_state',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'cache',
    note: 'Acknowledged activity and pending menu indicator batches; never message read state.',
  },
  {
    base: 'mockingbird_client_prefs',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Theme, accent, reader typography, composer behaviour. The bulk of a shareable setup.',
  },
  {
    base: 'mockingbird_house_ads',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Whether right-rail house endorsements show at all, and which ones are switched off individually. Unscoped: an opinion about an endorsement belongs to the person, not to one persona.',
  },
  {
    base: 'mockingbird_default_visibility',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'setting',
    note: 'Default post visibility.',
  },
  {
    base: 'mockingbird_hidden_providers',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'setting',
    note: 'Which providers are hidden from the merged timeline.',
  },
  {
    base: 'mockingbird_just_my_server',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'setting',
    note: 'Whether Home uses the generated same-server friends list.',
  },
  {
    base: 'mockingbird_feature_flags',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Opt-in feature toggles.',
  },
  {
    base: 'mockingbird_credential_lifetime',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'setting',
    note: 'Connector credential retention policy (30d / 90d / never).',
  },
  {
    base: 'mockingbird_pkm_vocabulary',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'setting',
    note: 'The words that mean #NOTE, #TODO and #CAL for this account. Account-scoped because they are language-specific — an English account and a German one want different words, and a global setting would make one of them wrong on every switch.',
  },
  {
    base: 'mockingbird_rss_feed_limit',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'setting',
    // Deliberately NOT private, unlike mockingbird_rss_feeds beside it: a count
    // of how many feeds to fetch says nothing about which ones. Splitting them
    // is what lets the number be shared while the subscriptions are not.
    note: 'How many RSS feeds to pull into the timeline. A number, not a list — the subscriptions themselves are mockingbird_rss_feeds and are private.',
  },
  {
    base: 'mockingbird_anonymous_preferences',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    group: 'anonymous',
    note: 'Preferences for the Anonymous account.',
  },
  {
    base: 'mockingbird_search_server_v1',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Optional separate search instance. Names a host, but choosing one is a config tip worth sharing.',
  },
  {
    base: 'mockingbird_translation_preference',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Which translator the 🌐 button uses: your server, AI via OpenRouter, or ask each time. Absent means the default (your server).',
  },
  {
    base: 'mockingbird_client_lists',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'setting',
    note: 'Browser-local lists of accounts, stored as handles. Works signed out, and unlike server lists does not require following anyone. Treated as cache: a version bump discards it.',
  },
  {
    base: 'mockingbird_tag_bundles',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'setting',
    note: 'Named bundles of hashtags read as one feed, capped at 10 tags each. Works signed out. Treated as cache: a version bump discards it.',
  },
  {
    base: 'mockingbird_translation_usage',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Daily translation counts and limits, held separately for the Mastodon endpoint and OpenRouter. Counts only — never what was translated.',
  },
  {
    base: 'mockingbird_search_server_rejects_v1',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Servers already checked and rejected as search servers, so a hunt does not re-probe the same duds. Clearable from Settings → Server.',
  },
  {
    base: 'mockingbird_follow_nudge_dismissed',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Whether the follow nudge was dismissed.',
  },
  {
    base: 'mastodon_mock_account_mode',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Which kind of account was last active: mastodon, bluesky or anonymous.',
  },

  // ---- cache: refetchable, never exported ----
  {
    base: 'mastodon_mock_server_index',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Curated joinmastodon instance index.',
  },
  {
    base: 'mockingbird_server_about_v1',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Cached instance /about payloads.',
  },
  {
    base: 'mockingbird_feed_capability_v1',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Which feeds (local/federated timelines, the three trends endpoints) each host actually serves, so we stop linking to feeds that answer 404 or 422 there. Keyed by host and by whether we held a token, because those answers genuinely differ. Refetchable, 24h TTL, records no content.',
  },
  {
    base: 'mockingbird_twitter_usage',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    // Same reasoning as mockingbird_cors_proxy_usage below: counters only, no
    // URLs and no handles, so it never records what was read.
    note: "Daily Twitter/X request counts against the reader's own budget, bucketed by local calendar day. Counters only — resetting them loses nothing but the day's tally.",
  },
  {
    base: 'mockingbird_article_quota',
    storage: 'local',
    suffix: 'none',
    // Counts and a date, nothing else. Deliberately *not* a list of what was
    // expanded: which articles someone read is exactly the kind of fact the
    // `private` tier exists for, and not recording it at all is better than
    // classifying it correctly.
    sensitivity: 'cache',
    note: "Daily counts of reader article fetches by free/Plus tier and successful expansions against the free limit, bucketed by local calendar day, plus a lifetime total of articles opened that survives the daily reset. Counters and a date only — resetting them loses today's tally and this browser's running total, not any record of what was read.",
  },
  {
    // The count of local reads a supporter's account has not accepted yet.
    //
    // One integer, never a list. There is nothing to retry individually — the
    // service takes a count — and a queue of what someone read is precisely the
    // reading history this feature refuses to build.
    base: 'mockingbird_reading_tally_unsent',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'How many article reads this browser has not yet reported to a Mawkingbird Plus account. A single number — resetting it loses at most a few reads from the account-wide total and nothing else.',
  },
  {
    base: 'mockingbird_first_run_preview',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'In-flight first-run state: the server the preview seeded from, and which follows already existed so the seed can be removed cleanly. Exists only while the first-run modal is open and is deleted when it closes — a half-finished onboarding is not something to carry to another machine.',
  },
  {
    base: 'mockingbird_cors_proxy_usage',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Counts of proxied requests and failures, for the Observability page. Diagnostics, not settings — resetting them loses nothing. Deliberately counters only: no URLs, so it never records which feeds were read.',
  },
  {
    base: 'mockingbird_search_server_about_v1',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Cached search-instance /about payloads.',
  },
  {
    base: 'mockingbird_instance_status_pages',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Discovered instance status pages.',
  },
  {
    base: 'mockingbird_remote_storage_usage',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Last known remote storage figure from the profile service (bytes used, allowance, tier, when it was read). A cached copy of a server-side number — resetting it only blanks the display until the next sync.',
  },
  {
    base: 'mockingbird_mawkingbird_metrics',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    // Counters only, and deliberately no paths: which endpoint of the account
    // service was called can imply what the person was doing with their
    // account, and a usage tally has no need to know. Same reasoning as
    // mockingbird_cors_proxy_usage.
    note: 'Call counts against Mawkingbird services, split by service and by whether a paid or free token was sent. Diagnostics, not settings — resetting them loses nothing but the tally.',
  },
  {
    base: 'mockingbird_api_metrics:',
    storage: 'local',
    suffix: 'instance',
    sensitivity: 'cache',
    note: 'Local API timing metrics and grouped client-error counts, one entry per instance. The trailing colon is part of the base — keys are `…metrics:<host>`.',
  },
  {
    base: 'mockingbird_api_metrics',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Superseded unscoped metrics blob, replaced by the per-instance keys above. Only ever deleted now; classified so lingering data is still recognised.',
  },
  {
    base: 'mockingbird_anonymous_home_feed',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    group: 'anonymous',
    note: 'Cached Anonymous home timeline. Derived from private follow data.',
  },
  {
    base: 'mockingbird_anonymous_feed_corpus',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    group: 'anonymous',
    note: 'Cached posts backing the Anonymous feed. Derived from private follow data.',
  },
  {
    base: 'mockingbird_raindrop_credentials',
    storage: 'local',
    suffix: 'account',
    sensitivity: 'secret',
    note: 'Legacy key from the superseded Raindrop OAuth flow. Only ever deleted now, never written; listed so it is classified if it lingers.',
  },

  // ---- sessionStorage: dies with the tab, never exported ----
  {
    base: 'mastodon_mock_oauth_app',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'In-flight Mastodon OAuth attempt: client secret, PKCE verifier and state.',
  },
  {
    // Unscoped on purpose, unlike every other credential here. An LLM key
    // belongs to the human, not to a Mastodon persona: it is the same key
    // whether you are signed in as your main, your alt, or Anonymous, so
    // scoping it would only mean reconnecting once per identity. The knock-on
    // is that per-account data deletion (Signed-in accounts) does not remove
    // it — which is the intended behavior, and pinned by a spec.
    base: 'mockingbird_openrouter_key',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'OpenRouter API key from the PKCE flow. Can spend the user’s OpenRouter credits. Shared by every account in this browser.',
  },
  {
    // Not a credential, and deliberately coarse: the platform word from the user
    // agent and nothing else. It exists so a vault conflict can say "your
    // OpenRouter key was updated from Windows" rather than "from another
    // device". Anything more precise would be a fingerprint, and would be no
    // more useful in the one sentence it appears in.
    base: 'mockingbird_vault_device',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'A coarse label for this browser, shown when a stored-connection conflict is resolved. Not a fingerprint and not derived from one.',
  },
  {
    base: 'mockingbird_openrouter_model',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'Chosen OpenRouter model id for the prompt helpers.',
  },
  {
    base: 'mockingbird_openrouter_prompts',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'setting',
    note: 'User-edited prompt templates for the search and tag helpers. Only present for templates edited away from the shipped default.',
  },
  {
    base: 'mockingbird_plus_features',
    storage: 'local',
    suffix: 'none',
    // `setting`, unlike mockingbird_profile_sync below: these are preferences
    // that mean the same thing in every browser ("sync my trust list"), not
    // operational state about one browser's relationship with a server. So they
    // travel with the rest of the settings, and someone who answered the dialog
    // on their desktop does not answer it again on their laptop.
    sensitivity: 'setting',
    note: 'Which Mawkingbird Plus features are switched on (CORS proxy, settings sync, trust list, client lists, RSS OPML list, test-deployment connection-key sync), and whether the one-time post-sign-in dialog has been answered. Cleared on sign-out so the next account decides for itself.',
  },
  {
    base: 'mockingbird_config_sync',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'Remote configuration URL, check cadence, last verified hash, and check timestamp. Operational sync state is never included in a portable config.',
  },
  {
    base: 'mockingbird_profile_sync',
    storage: 'local',
    suffix: 'none',
    // `private` rather than `setting`, for the same reason as
    // mockingbird_config_sync above: it is operational state about one browser's
    // relationship to a server, not a preference. Exporting it would carry an
    // ETag and revision that mean nothing in another browser, and would make
    // that browser think it was up to date while holding different bytes.
    sensitivity: 'private',
    note: 'Mawkingbird Plus settings-sync state: whether sync is on, the last ETag and revision seen, whether local edits are unpushed, and any persistent failure. Never synced itself — a document that described its own sync position would be describing the wrong browser the moment it arrived.',
  },
  {
    base: 'mockingbird_profile_list_copy',
    storage: 'local',
    // Global rather than account-scoped even though its *contents* are account
    // keys. Scoping it would key a record of "which accounts were asked" by a
    // token hash that changes on re-login, which is precisely the instability
    // the Plus account keys exist to avoid — the prompt would then reappear
    // after every sign-in.
    suffix: 'none',
    // `private` rather than `setting`: it names which accounts this browser has
    // seen, so exporting it would leak a list of the user's personas into a
    // config file meant to be shareable.
    sensitivity: 'private',
    note: "Which Mawkingbird accounts have been offered the one-time copy of this browser's client lists to Plus storage. Records only that the question was asked, never the answer — declining keeps the copy available on demand, so a stored 'no' would have nothing to gate.",
  },
  {
    base: 'mockingbird_profile_writer',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'private',
    note: 'A random per-browser id, so a sync conflict can say "your other browser" rather than "someone". Not a fingerprint and not derived from anything: eight random characters, sent only inside the user\'s own settings document.',
  },
  {
    base: 'mockingbird_openrouter_pkce_verifier',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'PKCE verifier for the in-flight OpenRouter authorization.',
  },
  {
    // OpenRouter's authorize step takes no `state` parameter, so ours travels
    // inside callback_url. This is the copy we check the return against.
    base: 'mockingbird_openrouter_oauth_state',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'Anti-CSRF state for the in-flight OpenRouter authorization.',
  },
  {
    base: 'mockingbird_dropbox_token',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'Short-lived Dropbox online access token.',
  },
  {
    base: 'mockingbird_dropbox_pkce_verifier',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'PKCE verifier for the in-flight Dropbox authorization.',
  },
  {
    base: 'mockingbird_dropbox_oauth_state',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'Anti-CSRF state for the in-flight Dropbox authorization.',
  },
  {
    base: 'mockingbird_blogger_token',
    storage: 'session',
    // Account-scoped, unlike the Dropbox token: a blog linked as one persona is
    // not the same person's to publish as another.
    suffix: 'account',
    sensitivity: 'secret',
    note: 'Short-lived Google access token.',
  },
  {
    base: 'mockingbird_blogger_blog',
    // localStorage, not session: which blog you write to and whether it shows
    // on your profile are preferences, not secrets, and re-choosing them every
    // time the tab closes would be busywork. It also lets the public profile
    // feed work with no Google session at all.
    storage: 'local',
    suffix: 'account',
    // `private`, not `setting`: a blog address names the person. It belongs in
    // a personal backup, never in a published "here is my setup" export.
    sensitivity: 'private',
    note: 'Chosen Blogger blog (id, name, address) and the profile-feed opt-in.',
  },
  {
    base: 'mockingbird_blogger_client_id',
    storage: 'local',
    // Unscoped like the OpenRouter key: a Google Cloud project belongs to the
    // human, not to whichever Mastodon persona is signed in.
    suffix: 'none',
    // A client id is public by design — it is in the bundle of every app that
    // ships one — so this is configuration, not a credential.
    sensitivity: 'setting',
    note: "The user's own Google OAuth client id, overriding the build's.",
  },
  {
    base: 'mockingbird_blogger_pkce_verifier',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'PKCE verifier for the in-flight Blogger authorization.',
  },
  {
    base: 'mockingbird_blogger_oauth_state',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'secret',
    note: 'Anti-CSRF state for the in-flight Blogger authorization.',
  },
  {
    base: 'mockingbird.update-recovery',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Reload-attempt bookkeeping for post-deployment chunk recovery.',
  },
  {
    base: 'mockingbird_diagnostic_log',
    storage: 'session',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Privacy-scrubbed diagnostic timeline for this tab (DiagnosticLog). Credentials and tokens are redacted before anything is written; retained only for the session.',
  },
  {
    base: 'mockingbird_has_bookmarks_v1',
    storage: 'local',
    suffix: 'none',
    sensitivity: 'cache',
    note: 'Whether this reader has any bookmarks, so Home can show a "Review bookmarks" button without asking the server on every load. A true is kept indefinitely; a false expires after a day. Holds no bookmark content — only the yes/no and when it was asked.',
  },
];

/** Which sensitivities each export profile includes. */
export const EXPORT_PROFILES = {
  /**
   * Safe to publish — a gist, a dotfiles repo, a link in a post. Preferences
   * only: nothing that names the user, the people they follow, what they read,
   * or anything they wrote.
   */
  shareable: ['setting'],
  /**
   * A personal backup for the user's own machines. Adds the private and
   * authored data. Still never includes a credential: connectors must be
   * re-authorized on the new machine, by design.
   */
  personal: ['setting', 'private', 'content'],
} as const satisfies Record<string, readonly Sensitivity[]>;

export type ExportProfile = keyof typeof EXPORT_PROFILES;

/** Look up a spec by its exact base. */
export function specForKey(base: string): StorageKeySpec | null {
  return STORAGE_KEYS.find((spec) => spec.base === base) ?? null;
}

/** Whether a concrete storage key (suffix and all) is described by `spec`. */
export function matchesKey(spec: StorageKeySpec, key: string): boolean {
  switch (spec.suffix) {
    case 'none':
      return key === spec.base;
    case 'account':
      // `base` alone is the logged-out scope; `base_<hash>` is a signed-in one.
      return key === spec.base || key.startsWith(`${spec.base}_`);
    case 'instance':
      return key.startsWith(spec.base);
  }
}

/**
 * Classify a concrete key as found in `localStorage`, suffix included.
 *
 * This is what an exporter must use when walking storage — never a bare `===`
 * against `base`, which silently misses every account- and instance-scoped key.
 * The longest matching base wins so that overlapping prefixes (for example
 * `mockingbird_anonymous_account` vs a hypothetical `mockingbird_anonymous_`)
 * resolve to the most specific entry.
 */
export function classifyStorageKey(key: string): StorageKeySpec | null {
  let best: StorageKeySpec | null = null;
  for (const spec of STORAGE_KEYS) {
    if (matchesKey(spec, key) && (best === null || spec.base.length > best.base.length)) {
      best = spec;
    }
  }
  return best;
}

/**
 * Whether a concrete storage key belongs in an export of this profile.
 *
 * Unregistered keys are refused — the safe default, and the reason the registry
 * is exhaustive: a key nobody classified must never reach a file the user
 * publishes just because someone forgot to think about it.
 */
export function isKeyExportable(key: string, profile: ExportProfile): boolean {
  const spec = classifyStorageKey(key);
  return (
    spec !== null &&
    spec.storage === 'local' &&
    (EXPORT_PROFILES[profile] as readonly Sensitivity[]).includes(spec.sensitivity)
  );
}

/**
 * Whether a key base may be written to an export of the given profile.
 *
 * Unregistered keys are refused. That is the safe default and the reason the
 * registry is exhaustive: a key nobody classified must never end up in a file
 * the user publishes just because someone forgot to think about it.
 */
export function isExportable(base: string, profile: ExportProfile): boolean {
  const spec = specForKey(base);
  return (
    spec !== null && (EXPORT_PROFILES[profile] as readonly Sensitivity[]).includes(spec.sensitivity)
  );
}

/** Every key base an export of this profile should collect. */
export function exportableKeys(profile: ExportProfile): StorageKeySpec[] {
  return STORAGE_KEYS.filter((spec) =>
    (EXPORT_PROFILES[profile] as readonly Sensitivity[]).includes(spec.sensitivity),
  );
}
