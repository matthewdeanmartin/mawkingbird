# Angular Namespace and Folder Layout

## Recommendation

Reorganize `ui/src/app` around product domains, with shallow top-level folders and local ownership of routes, UI, and domain logic. The goal is to make the owner of a file obvious and make cross-domain dependencies visible, without flattening the tree or adding generic `components/`, `services/`, or `features/` layers everywhere.

Keep the app standalone. This is a file and dependency-boundary refactor: do not introduce NgModules, change public URLs, rename persisted storage keys, or alter behavior as part of the moves.

## Status and revisions (2026-11-11)

Step 1 is done: the app root went from 303 TypeScript files to 9 (`app`,
`app.config`, `app.routes` and its spec, and the four `mock-api`/`mock-routes`
build-replacement files that `angular.json` swaps by path). The other 298 files,
with their specs and JSON data, now live in domain folders. See "Step 1 placement"
below.

Step 2 is done: `pages/` is gone. All 96 route folders (1,263 files) moved under
the domain that owns them; see "Step 2 placement". Folder names are unchanged, so
`pages/home` is now `feeds/home`. `pages/settings`, `pages/forum`,
`pages/invites` and `pages/observability` merged into the top-level folder of
the same name, which had no clashing files. Routes, lazy loaders and URLs did not
change.

Step 3 is done: `providers/` is gone (453 files). Third-party adapters are now
under `connections/<service>`. The Mawkingbird account (sign-in, Plus, profile
sync) is in `accounts/mawkingbird` and Anonymous mode in `accounts/anonymous`.
Article extraction, RSS, video subscriptions and the reader library joined
`reading/`. The cross-source home feeds went to `feeds/` and `external-fetch`
to `platform/http`. See "Step 3 placement".

Step 4 is done: 75 single-purpose top-level folders (384 files) moved under owners.
`src/app` now has 21 top-level folders, down from 94:
`accounts`, `admin`, `chat`, `connections`, `design-system`, `discovery`, `feeds`,
`forum`, `i18n`, `language`, `moderation`, `observability`, `platform`, `posts`,
`public-pages`, `publishing`, `reading`, `settings`, `shell`, `testing` and
`translation`. See "Step 4 placement".

Revisions to the original plan, learned while doing step 1:

- **`platform/` needs sub-namespaces from day one.** It took about 55 files. Flat,
  it would just become the next sock drawer. It is split into `platform/api`
  (the `Api` client, `models`, streaming), `platform/http` (interceptors, the
  server connection and its health), `platform/session` (auth, account scope,
  PKCE, login), `platform/storage` (storage registry, client prefs, portable
  config), `platform/diagnostics` (logs, error handling, bug reports) and
  `platform/build` (build flavor/info, feature flags, plan entitlements).
- **Add a `language/` domain.** Language detection, its corpus and the
  status/trend language filters are used by feeds, publishing, onboarding and
  translation. They have no honest home in the original table. `translation/` is
  a candidate to merge into it in step 4.
- **`i18n/` also owns copy-level helpers.** `terminology` (posts vs. toots),
  `page-language` and the human time/count pipes sit beside the locale code
  instead of in `platform/`.
- **Moves alone cannot satisfy the dependency rules.** The kernel already
  imports product code. After step 1, `platform/**` has 31 import edges into
  non-platform folders, mostly into `providers/*` (external-fetch, Mastodon,
  Bluesky, Misskey, account), plus `publishing`, `accounts`, `language`,
  `moderation`, `shell`, `onboarding`, `pkm` and `status-edit`. Examples:
  `Api` uses `private-media`, `pseudonymity`, `post-link-cleaning` and the
  status editor. `ClientPrefs` reads the reader library and publish wizard.
  `Auth` uses onboarding and local moderation. Files were placed by real
  ownership, not to hide these edges. The step 5 check therefore has to start
  as a **ratchet**: commit a baseline of the existing edges, fail only on new
  ones, and shrink the baseline as edges are fixed. `providers/external-fetch`
  probably belongs in `platform/http` when step 3 splits `providers/`.
- **Move mechanically, and keep tooling in step.** Use a scripted move map
  (git mv plus a rewrite of every relative specifier that resolves to a moved
  file). Do no behavior edits in the same change. Paths are hardcoded in places
  that are easy to miss: `test-manifest.json` (rename its spec paths; never
  regenerate it, so the inventory guard still proves no test was lost), the
  design inventory and reconciliation, about 15 `ui/scripts` generators and
  checkers, `scripts/check-source-import.cjs`, `ui/docs`, and the sibling
  `mawkingbird_starters/scripts/regen_parity.mjs`.
- **Some tooling resolves pages by folder name.** `prepare-seo-index.mjs` mapped
  a focused tool's URL slug to `src/app/pages/<slug>/`. It now looks the folder
  up under the owning domain and fails unless exactly one matches. Storybook
  stories in `design_system/stories` and `ui/integration` import app files
  directly, so a move must rewrite them too (`design:check` and the integration
  tsconfig catch misses). The Feed Builder playbook in `mawkingbird_starters`
  now names `feeds/feed-builder`.
- **Shared tool-page chrome is a cross-domain dependency.** Focused tools now live
  with their owners, but they share `public-pages/focused-apps/focused-page.css`
  and its shell components. That chrome is a candidate for `design-system/`.
- **Platform still reaches into the network adapters.** After step 4 there are
  24 platform-to-feature edges (31 after step 1). Nine go into
  `connections/{mastodon,bluesky,misskey}`: `Auth`, `Server` and
  `account-scope` know each network's identity and connector. Those adapters
  also use `platform/api`, so this is a cycle at folder level. The fix is a small
  network-neutral identity/connector interface in `platform/session` that each
  adapter registers with. Treat that as its own refactor, not a move.
- **Add a `posts/` domain.** The status card and its satellites (embeds, polls,
  preview cards, edit history, lightbox, media download, share and filter
  dialogs, code blocks, word lookup) are used by feeds, reading, discovery,
  accounts and public pages. Under any one of those, every other domain would
  import its private files. `posts/` is the narrowest shared home.
- **`a11y` went to `shell/`, not `design-system/`.** Its page-title strategy
  imports SEO code from `public-pages/`, and the design system must not import
  product code. `confirm-dialog` sits beside `shell/app-dialogs`, which wraps it.
- **Folder names are ordinary words.** `lists`, `learn` and `chat` appear in prose,
  so tooling rewrites must only touch `src/app/<name>` and quoted app-relative
  forms. Even then, one design rule keyed a `design-system/identity` CSS file by a
  bare name (`server-picker`) and had to be put back by hand. The rule tests
  (`design:lint`) catch this.

## Step 1 placement

| Folder | Root modules moved there |
| --- | --- |
| `platform/api` | api, models, people-cursor, streaming |
| `platform/http` | auth/dedupe/health/rate-limit/server interceptors, host-url, server, server-role/-health/-degradation/-availability, instance-status, search-server |
| `platform/session` | auth, auth.guard (+ connector-routing/misskey specs), account-scope, pkce, secure-login, login-destination, session-diagnostics, session-teardown |
| `platform/storage` | storage-registry, client-prefs, portable-config, config-sync |
| `platform/diagnostics` | diagnostic-log, error-log, global-error-handler, page-/build-diagnostics, analytics-/action-tracker, bug-report |
| `platform/build` | build-flavor, build-info, app-mode, feature-flags, feature-flag.guard, plus-benefits, ai-availability, update-recovery |
| `shell` | app-dialogs, hotkeys, rail-/radio-outlet, menu-budget, menu-indicators, menu-indicator-policy, indicator-events, house-ads, house-ad-store |
| `i18n` | terminology, page-language, human-time/-count pipes |
| `accounts` | account-*, follow-state/-trust/-quality, trusted-accounts, private-follows/-likes/-like-button, home-server-link, avatar-fallback, bulk-actions, bulk-follow-confirmation, import-follows, audience-scan, effective-audience, pseudonymity (+ pa-posting spec), rendered-html-links, bluesky-links |
| `feeds` | algo-feed, calm-verdicts, feed-*, feature-use-history, home-*, recent-feeds, other-server-url, just-my-server(.guard), list-collection-converter, reconcile-status, status-sort, sentiment |
| `publishing` | drafts, post-confirmation, post-history, posting-language, publish-wizard, writing-zen, markdown, future-tag-hints, private-media, post-link-cleaning, custom-emojis, custom-emoji.pipe |
| `reading` | reading-zen, radio-handoff, radio-links, media-feed-scan, media-query, external-link, bookmark-presence |
| `language` | language-detect (+ corpus, adversarial and analysis specs), status-language, trend-language-filter |
| `translation` | ai-translate, translation-preference, translation-usage |
| `discovery` | discovery-ways, hashtag, import-tags, tags-pub, mastodon-servers, search-capability, search-server-about/-probe/-rejects, server-about, starter-collection/-kits/-pack-text, starter JSON and generated kits |
| `moderation` | local-moderation, author-moderation, muted-posts, status-visibility |
| `public-pages` | focused-tools(-all, .json), tool-copy, seo, public-page-urls, breadcrumbs |
| `forum` | forum-thread.guard |
| `pages/settings/import-export` | twitter-archive |

## Step 2 placement

Each `pages/<name>` folder kept its name under its new parent.

| Parent | Former `pages/*` folders |
| --- | --- |
| `feeds` | home, algo, feed-builder, feed-doctor, server-feed, list-timeline, lists, client-list, public-timeline, bluesky-feed, misskey-feed, misskey-tag, tag, tag-bundle, link-timeline, other-servers, notifications, turn-off-boosts-mastodon |
| `publishing` | write, drafts, crosspost, schedule-mastodon-posts, pastes, links, message, posse, github-to-mastodon, conversations |
| `reading` | read, bookmarks, rss, radio, videos, watch, favourites, thread, export-mastodon-bookmarks, download-mastodon-images, mastodon-friends-rss-feeds |
| `discovery` | search, network-search, misskey-search, find-friends, explore, directory, offsite-directories, bundled-starter-kits, bluesky-starter-packs, collection, starter-collection, endorsed-list, twitter-to-mastodon, friend-bridge, find-contacts-on-mastodon, mastodon-similar-hashtags |
| `accounts` | profile, analytics, annual-report, mastodon-analytics, anonymous-on-mastodon, mastodon-handle-generator |
| `accounts/sign-in` | login, login-bluesky, login-misskey, login-chooser, bluesky-oauth-callback, entry, anonymous-entry, welcome-back, account-picker, connection-help |
| `moderation` | mastodon-mute-block-amnesty, mastodon-content-warnings |
| `connections` | dropbox-callback, blogger-callback, openrouter-callback (step 3 adds the adapters) |
| `public-pages` | about, credits, funding, plans, docs, terms, server-rules, server-announcements, tools, focused-apps, features, language-landing |
| `shell` | unavailable, fail-whale-demo |
| `observability` | storage-diagnostics, fault-injection; `pages/observability` merged in |
| `settings`, `forum`, `invites` | merged from `pages/settings`, `pages/forum`, `pages/invites` |

## Step 3 placement

| From `providers/` | To |
| --- | --- |
| bluesky, misskey, mastodon, twitter, blogger, dropbox, github, mataroa, raindrop, openrouter, paste, shortener, hugo, cors-proxy, vault | `connections/<same name>` |
| provider, provider-registry, publishing-services, status-actions, credential-lifetime, proxy-consent-store | `connections/` (adapter registration and shared connection plumbing) |
| account | `accounts/mawkingbird` |
| anonymous | `accounts/anonymous` |
| article | `reading/article` |
| rss, videos, read | merged into `reading/rss`, `reading/videos`, `reading/read` (no name clashes) |
| external-fetch | `platform/http` |
| feed-aggregator, other-server-feeds, private-follow-feeds, authenticated-home-feed spec | `feeds/` |

The OAuth callback pages from step 2 moved beside their adapters:
`connections/{dropbox,blogger,openrouter}/<name>-callback`.

## Step 4 placement

| Parent | Former top-level folders |
| --- | --- |
| `posts` | status-card, post-embed, poll-results, preview-card, history-dialog, filter-post-dialog, bookmark-provider-dialog, share-dialog, lightbox, media-download, code-blocks, learn, sign-in-prompt, account-list-dialog |
| `publishing` | compose, status-edit, focal-point, post-permissions, image-describer, emoji-picker, pkm |
| `reading` | video-player, audio-embeds, speech, reader-toolbar, friend-feeds-dialog |
| `accounts` | account-analytics, account-hover-card, account-note-dialog, effective-audience-dialog, follow-button, people-browser, profile-qr, verified-badge, bulk-actions-dialog, bulk-progress, invites, onboarding, first-run |
| `accounts/sign-in` | server-connection-help, unreachable-server-dialog |
| `platform/session` | account-tab-guard |
| `feeds` | feed-analytics, feed-language-picker, feed-members, pinned-server-feeds, command-bar, discovery-card |
| `feeds/lists` | lists (merged), list-dialog, list-settings-dialog, collection-settings-dialog, bulk-add-dialog |
| `discovery` | server-picker, server-discovery, search-server-discovery, similar-hashtags, tag-actions, announcements |
| `moderation` | report-dialog, report-history, bulk-words-dialog, tag-filter-dialog |
| `shell` | app-install, bug-report-dialog, shortcut-help, update-overlay, fail-whale, leave-dialog, confirm-dialog, a11y |
| `i18n` | locale-picker |
| `public-pages` | tool-translations |
| `chat` | eliza |

## What the current layout says

- `src/app` contains about 303 TypeScript files directly at its root (including specs); that root is acting as a miscellaneous bucket for platform concerns and feature logic.
- `pages/` has about 600 TypeScript files and `providers/` about 445. Both have useful internal groupings, but related feature parts are split between these trees and sibling folders such as `compose/`, `forum/`, `lists/`, `translation/`, `status-card/`, and `observability/`.
- The app is already route-lazy and component-standalone. Route composition belongs at the app boundary; feature implementation should not depend on another feature's private files.
- `app.config.ts` imports settings preloading from `pages/settings`. That is an example of app composition depending on a feature-owned implementation detail that should become an explicit feature entry point.

## Target taxonomy

Use domain folders directly under `src/app`; avoid wrapping every domain in another `features/` directory. Keep the number of levels low, and add a nested folder only where it names a cohesive subfeature.

| Namespace | Owns |
| --- | --- |
| app root | Bootstrap, top-level route composition, app-wide configuration, and the few files Angular or build replacements require at stable paths |
| `platform/` | Cross-app runtime infrastructure: HTTP transport, authentication/session primitives, interceptors, error handling, storage infrastructure, app mode/build configuration, and shared diagnostics |
| `design-system/` | Reusable visual primitives and their design-system tests; keep this separate from product features |
| `shell/` | Global navigation and app chrome |
| `accounts/` | Account identity, account selection/scope, profile identity state, follow state and account-level services |
| `feeds/` | Feed assembly, home-feed behavior, feed capabilities, feed analytics, and feed-oriented pages |
| `publishing/` | Compose, post editing, cross-posting, scheduled posts, drafts, and writing helpers |
| `reading/` | Reader, article capture, bookmarks, RSS, radio, media playback, and reading tools |
| `discovery/` | Search, people/server discovery, hashtag exploration, and discovery scans |
| `moderation/` | Filters, reports, muted content, visibility, moderation actions, and moderation settings |
| `connections/` | External service adapters and connection flows, grouped by service where necessary; use this name instead of the ambiguous generic `providers/` for third-party integrations |
| `settings/` | Settings route components and settings-owned state; connection-specific settings may remain under `connections/` when they are part of the connection lifecycle |
| `admin/` | Admin shell, admin routes, admin API, and admin-only pages |
| `public-pages/` | Public, indexable informational pages and standalone public tools that do not belong to an app domain |

Keep component files and their `.html`, `.css`, and `.spec.ts` files together. Keep cohesive subfeatures such as a dialog or a provider-specific adapter in one child directory; do not split a feature into generic `components/`, `services/`, and `models/` children.

## Recommended moves

Move in batches, resolving ownership as part of each batch. These examples show the intended placement; the move should include source, template, style, and spec files together.

### 1. Clear the app root by ownership

- Move account-related root files such as `account-data`, `account-handle`, `account-metrics`, `account-route`, `account-scope`, `account-switcher`, `follow-state`, and `trusted-accounts` into `accounts/`.
- Move feed and home behavior such as `algo-feed`, `feed-capability`, `feed-metrics`, `home-algo-settings`, `home-defaults`, `home-diagnostics`, `home-feed-catalog`, `home-origin`, `home-source`, `home-topics`, and `recent-feeds` into `feeds/`.
- Move writing and publishing logic such as `drafts`, `post-confirmation`, `post-history`, `post-link-cleaning`, `posting-language`, `publish-wizard`, `status-visibility`, and `writing-zen` into `publishing/` or the owning feed/moderation domain where responsibility clearly differs.
- Keep actual app-wide infrastructure in `platform/`; do not use it as a new catchall. In particular, review `api.ts` and `models.ts` incrementally: retain genuinely shared transport/types centrally, but move domain-specific types and operations next to their owner as consumers are migrated.

### 2. Join route pages to the domain they serve

- Move `pages/home`, `pages/feed-builder`, `pages/server-feed`, `pages/list-timeline`, and other feed-oriented routes under `feeds/`.
- Move `pages/write`, `pages/crosspost`, `pages/schedule-mastodon-posts`, and writing-related dialogs/helpers under `publishing/`.
- Move `pages/read`, `pages/bookmarks`, `pages/rss`, `pages/radio`, and media-oriented feature code under `reading/`.
- Move `pages/search`, `pages/network-search`, `pages/find-friends`, and server/people discovery pages under `discovery/`.
- Move settings-owned route components from `pages/settings` to `settings/`, preserving the existing settings subgroups (for example, `connections`, `import-export`, and `notifications`) where those subgroups provide real cohesion.
- Keep genuinely public informational pages and standalone tools in `public-pages/`; do not move a page solely because it is currently under `pages/` if another domain clearly owns its behavior.

### 3. Replace `providers/` with explicit ownership

- Move service adapters for Mastodon, Misskey, Bluesky, Twitter, RSS, Dropbox, GitHub, Blogger, and other third parties under `connections/`, grouped by external service only when that group contains multiple related files.
- Move `providers/account` into `accounts/`; move anonymous-account, feed, and moderation logic to their owning domains when those folders contain product behavior rather than connection mechanics.
- Keep adapter registration and shared transport at the connection boundary. Feature code should call the owning connection API, not reach into unrelated service internals.

### 4. Consolidate existing sibling feature folders

- Bring `compose/` and `status-edit/` together under `publishing/`.
- Place `lists/` under the domain that owns list behavior (feeds or accounts); choose one owner and keep list routes, stores, and dialogs together.
- Move `forum/` under `discovery/` only if it remains a discovery feature; otherwise give it a distinct top-level `forum/` domain. Keep forum routes, scans, and discussion state together.
- Keep `translation/`, `audio-embeds/`, `video-player/`, and `observability/` as separate top-level namespaces only if their code is intentionally consumed across several domains. If usage is confined to one domain, move them beside that owner.
- Keep reusable visual primitives in `design-system/`; product-specific cards, dialogs, and workflows belong with their domain even when several pages use them.

## Dependency rules

- App bootstrap and route composition may depend on feature entry points. Feature implementation must not import from app route composition or app bootstrap.
- `platform/` and `design-system/` may be depended on by domains; they must not import product features.
- A domain may use its own private files freely. Cross-domain imports should go through a small, explicit public entry point owned by the providing domain; do not create broad barrel files that re-export an entire domain.
- Avoid circular runtime imports. Where two domains need the same small primitive, put that primitive in the narrowest genuinely shared namespace rather than making one domain depend on the other.
- Add lightweight automated checks for these direction rules after the first migration batch establishes the final folder names. Start as a ratchet over a committed baseline of existing edges (see revisions above); keep exceptions explicit and shrinking.

## Migration sequence and acceptance

1. Inventory root files and classify each by owner; record exceptions for truly app-wide infrastructure and generated files.
2. Move the most obvious root-level account and feed logic into their owners, updating imports and specs in the same batch. (Done 2026-11-11 for every root module; see Step 1 placement.)
3. Consolidate publishing, reading, discovery, and settings route code with their domain logic; update route imports while preserving lazy loaders and public route configuration. (Done 2026-11-11; see Step 2 placement.)
4. Split `providers/` by responsibility, then consolidate remaining sibling feature folders based on real usage rather than naming alone. (Done 2026-11-11; see Step 3 and Step 4 placement.)
5. Add the lightweight import-direction check and document the rules for future files.

Acceptance criteria:

- New feature work has an obvious domain home; the app root no longer serves as a general-purpose feature folder.
- Routes, UI, and domain behavior are colocated, and imports across unrelated domains are limited and deliberate.
- App bootstrap is the composition boundary; feature code does not import it or another feature's private implementation.
- Public URLs, SEO metadata, Angular lazy-loading behavior, storage keys, mock/admin build replacements, generated data, and test baselines remain unchanged.
- The largest necessary nesting is a domain plus a cohesive subfeature; generic layer folders are not introduced just to categorize file types.

## Verification when implementing

For the eventual client refactor, inspect the applicable workflows and run the required client gates: `cd ui && make test`, `npm run build:mockingbird`, `npm run format:check`, and `npm run lint`. `make test` includes the design inventory check; if moves make that inventory stale, review and reconcile it before rerunning the check. Report which gates passed and which were not run. Step 1 was verified with these gates on 2026-11-11; later steps need the same.
