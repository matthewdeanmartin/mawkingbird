# Angular Namespace and Folder Layout

## Recommendation

Reorganize `ui/src/app` around product domains, with shallow top-level folders and local ownership of routes, UI, and domain logic. The goal is to make the owner of a file obvious and make cross-domain dependencies visible, without flattening the tree or adding generic `components/`, `services/`, or `features/` layers everywhere.

Keep the app standalone. This is a file and dependency-boundary refactor: do not introduce NgModules, change public URLs, rename persisted storage keys, or alter behavior as part of the moves.

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
- Add lightweight automated checks for these direction rules after the first migration batch establishes the final folder names. Keep exceptions explicit and few.

## Migration sequence and acceptance

1. Inventory root files and classify each by owner; record exceptions for truly app-wide infrastructure and generated files.
2. Move the most obvious root-level account and feed logic into their owners, updating imports and specs in the same batch.
3. Consolidate publishing, reading, discovery, and settings route code with their domain logic; update route imports while preserving lazy loaders and public route configuration.
4. Split `providers/` by responsibility, then consolidate remaining sibling feature folders based on real usage rather than naming alone.
5. Add the lightweight import-direction check and document the rules for future files.

Acceptance criteria:

- New feature work has an obvious domain home; the app root no longer serves as a general-purpose feature folder.
- Routes, UI, and domain behavior are colocated, and imports across unrelated domains are limited and deliberate.
- App bootstrap is the composition boundary; feature code does not import it or another feature's private implementation.
- Public URLs, SEO metadata, Angular lazy-loading behavior, storage keys, mock/admin build replacements, generated data, and test baselines remain unchanged.
- The largest necessary nesting is a domain plus a cohesive subfeature; generic layer folders are not introduced just to categorize file types.

## Verification when implementing

For the eventual client refactor, inspect the applicable workflows and run the required client gates: `cd ui && make test`, `npm run build:mockingbird`, `npm run format:check`, and `npm run lint`. `make test` includes the design inventory check; if moves make that inventory stale, review and reconcile it before rerunning the check. Report which gates passed and which were not run. No code has been changed as part of this recommendation.
