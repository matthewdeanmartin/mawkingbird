# Mawkingbird as a Mastodon instance's own web interface

Status: **spec only; not scheduled.** Written 2026-11-17 against the Mastodon
source in `../REFERENCE/mastodon` (`config/routes.rb`, `config/routes/*.rb`,
`config/initializers/cors.rb`, `dist/nginx.conf`). The supported setup today is
a subdomain or a `/mawkingbird/` path next to the instance
(`ops/MASTODON_INSTANCE.md`), built with `MOCKINGBIRD_HOME_SERVER`.

## The question

Could a single-user instance replace Mastodon's React web interface with
Mawkingbird, at the instance's own root (`https://example.social/`), keeping
only "the rump" of Mastodon's Rails app: federation, the API, sign-in,
settings and admin?

Short answer: **possible, and a standing maintenance cost.** Mastodon owns most
of the root namespace, serves different content at the same URL to browsers
and to other servers, and changes its routes between releases. Every
Mastodon upgrade would need a route check, and some Mastodon pages would always
stay Mastodon-styled.

## What Mastodon needs at the root

Grouped from `config/routes.rb` and its `draw` files. **R** = must stay with
Rails; **SPA** = handled today by Mastodon's React app (`home#index`) and
could be served by Mawkingbird instead.

| Group                                        | Paths                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Discovery                                    | `/.well-known/*` (webfinger, host-meta, nodeinfo, oauth-authorization-server), `/nodeinfo/2.0`, `/manifest`, `/robots.txt`, `/health`                                                                                                                                                                                                                                                                                                                           | R                                     |
| Federation (ActivityPub)                     | `/users/:username` and everything under it (actor, inbox, outbox, followers, following, collections, statuses), `/inbox`, `/actor`, `/ap/*`, `/contexts/*`, `/collections/:id`                                                                                                                                                                                                                                                                                  | R                                     |
| **Both, by `Accept` header**                 | `/@:username`, `/@:username/:id` and their sub-pages: HTML to browsers, `application/activity+json` to servers (`AccountsController`, `StatusesController` `respond_to`)                                                                                                                                                                                                                                                                                        | R for JSON, either for HTML           |
| API and OAuth                                | `/api/*`, `/api/v1/streaming` (WebSocket, separate service), `/oauth/*` (Doorkeeper: authorize, token, revoke, authorized applications)                                                                                                                                                                                                                                                                                                                         | R                                     |
| Sign-in and account (Devise and Rails views) | `/auth/*` (sign in/up, password, confirmation, 2FA, setup), `/settings/*`, `/filters`, `/invites`, `/relationships`, `/statuses_cleanup`, `/disputes/*`, `/severed_relationships`, `/backups`, `/redirect/*`, `/email_subscriptions/*`                                                                                                                                                                                                                          | R                                     |
| Admin                                        | `/admin/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | R                                     |
| Interaction helpers                          | `/authorize_interaction`, `/authorize_follow`, `/share`, `/intent`, `/remote_interaction_helper`, `/invite/:code`                                                                                                                                                                                                                                                                                                                                               | R                                     |
| Media and assets                             | `/system/*`, `/media/:id`, `/media_proxy/*`, `/packs/*`, `/assets/*`, `/emoji/*`, `/avatars/*`, `/headers/*`, `/sounds/*`, `/custom.css`, `/css/:id`, `/sw.js`                                                                                                                                                                                                                                                                                                  | R / static                            |
| Public pages                                 | `/about`, `/privacy-policy`, `/terms-of-service(/:date)`, `/terms`, `/tags/:tag`, `/oembed`, `/@:username/:id/embed`                                                                                                                                                                                                                                                                                                                                            | R (Rails HTML, embeds, link previews) |
| Web app (`config/routes/web_app.rb`)         | `/`, `/home`, `/notifications(/*)`, `/notifications_v2/*`, `/explore/*`, `/deck/*`, `/lists/*`, `/bookmarks`, `/favourites`, `/conversations`, `/statuses/*`, `/public(/local\|/remote)`, `/search`, `/directory`, `/start/*`, `/publish`, `/getting-started`, `/keyboard-shortcuts`, `/follow_requests`, `/followed_tags`, `/blocks`, `/mutes`, `/domain_blocks`, `/links/*`, `/collections/*`, `/profile/*`, `/overview(/about)`; `/web/*` redirects to these | **SPA**                               |
| Catch-all                                    | `*unmatched_route` → 404                                                                                                                                                                                                                                                                                                                                                                                                                                        | R                                     |

## Where Mawkingbird collides

Mawkingbird's top-level route segments that Mastodon also uses, with a
different meaning or owner:

| Path                                                                                                                                                                     | Mastodon                           | Mawkingbird                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------- |
| `/oauth/*`                                                                                                                                                               | Its OAuth server (R)               | `/oauth/bluesky/callback`     |
| `/settings/*`                                                                                                                                                            | Account settings (R)               | All of Mawkingbird's settings |
| `/admin/*`                                                                                                                                                               | Admin (R)                          | Mock-only admin pages         |
| `/@user@host`                                                                                                                                                            | Remote account page (R, HTML/JSON) | Copied account deep link      |
| `/about`, `/terms`                                                                                                                                                       | Rails pages (R)                    | About/terms pages             |
| `/invite`, `/invites`                                                                                                                                                    | Invite pages (R)                   | Invite tools                  |
| `/filters`                                                                                                                                                               | Filter editor (R)                  | Filter pages                  |
| `/share`                                                                                                                                                                 | Share intent (R)                   | Web share target              |
| `/tags/:tag`                                                                                                                                                             | Public tag page (R)                | Tag timeline                  |
| `/collections/*`                                                                                                                                                         | AP collections and SPA (mixed)     | Collections                   |
| `/home`, `/notifications`, `/search`, `/lists/*`, `/bookmarks`, `/favourites`, `/conversations`, `/statuses/*`, `/explore`, `/directory`, `/public`, `/blocks`, `/mutes` | SPA                                | Same names, compatible intent |

The last row is the good news: Mawkingbird's main pages already use
Mastodon's web-app names. The rows above it are the work.

## Options

1. **Path or subdomain (supported now).** No collisions. Mastodon's own UI
   stays at `/`. Readers use `/mawkingbird/` or `app.`.
2. **Replace only the SPA.** nginx sends Mastodon's web-app paths (the last
   group in the first table) to Mawkingbird's `index.html` and everything else
   to Rails. Mawkingbird moves its colliding routes out of the way in an
   "instance build". This is the realistic version.
3. **Replace everything a browser sees**, including `/@user`, `/@user/:id`,
   `/tags/:tag` and `/about` as Mawkingbird pages, with ActivityPub JSON still
   going to Rails by `Accept` header. It adds logged-out public pages, link
   previews, embeds and search-engine indexing to Mawkingbird's job. Not
   recommended.

## Option 2 in detail

### Client: an "instance build"

- A build setting beside `MOCKINGBIRD_HOME_SERVER`, e.g.
  `MOCKINGBIRD_INSTANCE_UI=true`, that requires a home server and base `/`.
- **Moves colliding routes** to a Mawkingbird-owned prefix in that build only:
  `/settings/*` → `/app/settings/*`, `/oauth/bluesky/callback` →
  `/app/oauth/bluesky/callback`, `/about`, `/terms`, `/invites`, `/filters`,
  `/share`, `/admin`, the `/@user@host` deep link → under `/app/`. Every
  `routerLink` to them goes through one route-name table, so both builds
  share code. (Mastodon doesn't use `/app`.)
- **Hands Mastodon-owned pages back to Mastodon:** links to account settings,
  filters, invites, admin and sign-up open the Rails pages (full-page
  navigation, not router links).
- **Understands Mastodon's URLs when it owns them:** `/statuses/:id`,
  `/@user/:id` (HTML only, if served), `/notifications`, `/deck/*` → nearest
  Mawkingbird view, so links in Mastodon's emails and other clients land
  somewhere sensible.
- **Sign-in:** the reader signs in to Rails (Devise) once; Mawkingbird then
  runs OAuth against the same origin, which Doorkeeper answers with one
  "Authorize" click (or none, if the app is registered as trusted by the
  admin, below).

### Server: nginx template

- Static Mawkingbird files outside Mastodon's checkout.
- A `location` list (generated, not hand-written) of the web-app paths that
  serve Mawkingbird's `index.html`. Everything else keeps
  `try_files $uri @mastodon`.
- `/` (root) to Mawkingbird for browsers.
- Preserve Mastodon's per-location headers (HSTS) and cache rules.

### Mastodon side: small and optional

- Register Mawkingbird as a first-party application (an admin can create an
  app with a fixed redirect URI and mark it to skip the consent screen via the
  Rails console). Otherwise readers see the normal authorize page once.
- Nothing in Mastodon's code changes. Option 2 must work on a stock
  install, or upgrading it becomes a fork.

## Maintenance cost (why it's a bear)

- **Routes move.** Mastodon adds and renames web-app and Rails paths between
  releases (4.4–4.6 added collections, wrapstodon, `notifications_v2`,
  terms-of-service versions, email subscriptions). Option 2 needs a
  **route manifest check**: parse `config/routes.rb` and the `draw` files of a
  given Mastodon version, compare them with the nginx template and
  Mawkingbird's instance-build route table, and fail on any unclaimed or
  doubly-claimed path. Run it for each Mastodon release the instance moves to.
- **Two looks forever.** Sign-in, settings, filters, invites, admin and
  moderation stay Rails pages. Matching their style means maintaining CSS for
  Mastodon's views (`/custom.css` can carry some of it).
- **Same origin, shared browser state.** Mastodon's service worker (`/sw.js`,
  scope `/`, registered by its web app) controls every page on the origin once
  registered, including Mawkingbird's. Readers who used Mastodon's UI before
  would need it unregistered, or Mawkingbird would need to replace it. Both
  apps also share the origin's localStorage and cookies (their key names don't
  overlap today).
- **Content negotiation is fragile.** `/@user` and `/@user/:id` must reach
  Rails for `Accept: application/activity+json` and
  `application/ld+json; profile=...`. Option 2 avoids it by leaving these to
  Rails; option 3 would put it in nginx (`map $http_accept ...`), and a mistake
  there silently breaks federation.
- **Testing needs a real Mastodon.** The mock server can't prove routing. A
  docker-compose Mastodon (pinned version) behind the nginx template, with
  browser checks of: sign-in round trip, each claimed web-app path, a
  federation fetch of `/@user` with an ActivityPub `Accept` header, and email
  links.
- **Support load.** Every instance's nginx differs (Docker, Yunohost,
  Masto.host, Kubernetes ingress). The template would cover the stock
  `dist/nginx.conf` only.

## If it is ever scheduled

1. Route manifest generator and check (Mastodon routes vs claimed paths), run
   against the version in `../REFERENCE/mastodon`.
2. Instance-build route table and the moved routes; links to Rails pages
   become full navigations.
3. nginx template generated from the manifest; docker-compose Mastodon test
   rig with the browser checks above.
4. Mastodon-URL adapters (`/statuses/:id`, `/deck/*`, email links).
5. Service-worker handover and a "first run on an instance that used
   Mastodon's UI" check.

## Open questions

- Is option 2 worth it over a subdomain for one user? The visible gain is the
  address bar (`example.social/home` rather than `app.example.social/home`).
- Should the instance build hide features that only make sense on a big
  general server (Explore, server directory)?
- Which Mastodon versions to support: latest only, or latest and previous?
