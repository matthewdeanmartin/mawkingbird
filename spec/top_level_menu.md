# Top-level menu: app modes (Mastodon / RSS / Video)

Status: Sprint 1 implemented behind `mode-nav` (canary), uncommitted ·
2026-10-18. Sprints 2 and 3 have not started.

## Problem

The primary nav (`ui/src/app/shell/shell.html`) is a hardcoded list of Mastodon
destinations: Home, Algo, Inbox, Chat, Search, Feeds, plus RSS and Login. RSS
gets one slot and Videos is buried in **More**. Each of those pages then builds
its own second menu out of buttons inside the page (`rss-page.html`,
`videos-page.html`). So outside Mastodon the top bar is wasted space, and every
icon still means something in Mastodon.

## Owner decisions (2026-10-18)

- There are three modes: **Mastodon** (the default), **RSS** and **Video**.
  Video replaces "YouTube", because it covers fediverse video as well as
  YouTube.
- **Home is always the first slot, always goes to `/home`, and always switches
  back to Mastodon mode.**
- The video menu is: Home | Fedi videos | YouTube | Queue | Watch parties |
  switcher. Search is added to it (see Sprint 3).
- Video needs three new screens: a **video search** (like Search, but only for
  video), a **watch queue**, and a **watch-party finder** (like hashtags, but
  tuned for finding parties; opening one goes to the Watch page).
- The menu must be easy to roll back (see Rollback).

## Menus

```
mastodon: Home | Algo  Inbox  Chat  Search  Feeds | [RSS ▾]
rss:      Home | Reader  Starter kits | [Mastodon ▾]
video:    Home | Fedi videos  YouTube  Queue  Parties  Search | [Mastodon ▾]
```

Rules:

1. **Home** comes first, behaves the same in every mode, and sets the mode to
   Mastodon.
2. **The last slot is the mode switcher.** Its icon and label show the mode
   you would most likely go to next: RSS from Mastodon, and Mastodon from
   anywhere else. A caret marks it as a menu. The menu lists all three modes
   as links to each mode's landing page (`/home`, `/rss`, `/videos`), with the
   current mode marked. In RSS and Video modes it also has a "Manage feeds"
   link (`/settings/rss`). The menu is an anchored `MbPopover`. It opens
   above or below the switcher depending on space, which gives a drop-up on
   mobile without any special CSS.
3. **Each mode has its own icons.** An icon path may not appear in two
   modes with different meanings. `mode-nav.spec.ts` enforces this.
4. **Login** (anonymous only) appears in every mode, just before the switcher.
5. **Indicators** (the Inbox and Chat activity dots) belong to Mastodon mode
   only.

## Which mode a page belongs to

Most pages decide the mode. A shared page keeps whatever mode you were in
("sticky").

| Route                                           | Mode                                                            |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `/home`                                         | mastodon (rule 1)                                               |
| `/rss…`, `/settings/rss`                        | rss                                                             |
| `/videos…`                                      | video                                                           |
| `/watch…`                                       | sticky (it plays YouTube and Mastodon video, and hosts parties) |
| `/read/…`, `/statuses/rss:…`, `/accounts/rss:…` | sticky                                                          |
| `/settings…` (other than rss)                   | sticky                                                          |
| everything else                                 | mastodon                                                        |

The mode is kept in `sessionStorage` (`mockingbird_app_mode`, registered in
`storage-registry.ts` as a session-only `setting`). Every access is wrapped in
try/catch. A reload keeps the tab in its mode. A new tab starts in Mastodon.

## Rollback

There are three levels, from cheapest to most thorough:

1. **Per user, right away.** `mode-nav` is a normal `FeatureFlagId`. Anyone
   can switch it off in Settings → Features and get the old nav back, with no
   deploy. **Caveat:** flag overrides are tied to the build's commit SHA
   (`FeatureFlags.load`), so a personal opt-out resets to the default on the
   next deploy. If users need an opt-out that survives deploys, add a saved
   `ClientPrefs` setting that the flag check also consults (with a
   storage-registry row). That is not built yet.
2. **For everyone, with a one-line deploy.** It ships with
   `defaultState: 'canary'`. Promote it to `'production'` when ready. To roll
   back, set it to `'off'`. With the flag off, the shell renders the
   **original nav markup unchanged** (`@else` branch). Rolling back runs the
   same code and CSS that runs today.
3. **Remove it entirely.** Delete the `@if` branch, `app-mode.ts`,
   `shell/mode-nav.ts`, `shell/mode-switch.ts`, the flag entry, the
   storage-registry row and the `shell.modeNav.*` keys. The only state is in
   sessionStorage, so nothing needs migrating.

Guard rails:

- **Page buttons depend on the flag.** Buttons that the mode menu replaces
  (the RSS page's "Videos" cross-link, for example) disappear only while
  `mode-nav` is on. Removing them outright would strand people who turn the
  flag off.
- **New screens stay reachable with the flag off.** Each new Video screen also
  gets a link from `/videos`, so turning the flag off never orphans a feature.
- **Videos stays in the More menu in both branches** until the flag has
  shipped to production.
- **New CSS only uses new class names** (`.mode-switch`, `.primary-nav[data-mode]`),
  so the old branch never matches them.

---

## Sprint 1: mode menu, using pages that already exist

Goal: the mode switcher ships behind the flag. Mastodon and RSS modes are
complete. Video mode shows Home | YouTube only.

- `ui/src/app/app-mode.ts`: `AppMode`, the pure `modeForUrl(url)` (which
  returns `null` for a sticky route), and an `AppModeService` signal that
  follows `NavigationEnd` and is saved to sessionStorage.
- `ui/src/app/shell/mode-nav.ts`: `MODE_NAV` holds each mode's items as data
  (id, label key, icon path, link, query params, an "active" URL pattern,
  visibility needs, an activity source). It also holds the `// i18n`
  declarations.
- `ui/src/app/shell/mode-switch.ts`: the trigger button, styled as a nav tab,
  and the anchored popover listing the modes.
- `feature-flags.ts`: `mode-nav`, canary by default, in the "features" group.
- `shell.html`/`shell.ts`/`shell.css`: the `@if (mode-nav)` branch. The old
  nav is kept unchanged under `@else`.
- RSS starter kits become linkable as `/rss?view=kits`. Opening the kits from
  the page's own toggle writes the parameter, and closing them removes it.
  The RSS page's "Videos" button is hidden while the flag is on.
- Tests: `app-mode.spec.ts` (the route table, sticky routes, storage that
  throws), `mode-nav.spec.ts` (Home is never an item, icon paths are unique
  per meaning, every label key exists), and shell spec cases for both flag
  states plus the switcher. RSS spec: `?view=kits` opens the kits.
- Gates: targeted specs, then `make test`. Re-audit the design inventory
  (the shell line numbers move). Also `npm run build:mockingbird` for the
  bundle budget, `check:i18n` and `check:storage`.

## Sprint 2: Fedi videos and the watch queue

- **Fedi videos** (`/videos/fedi`): the Home timeline filtered to posts with
  video, reusing Home's existing Video view filter (`statusVideo` and the
  video-host discovery list in `spec/media-focus.md`). Explicit paging, as on
  Home. Each card offers Watch and **Queue**. Investigate first whether the
  page can host Home's video view directly. Home views are not routes today
  (see `home.ts`), so routing one must not change how Home behaves.
- **Watch queue** (`/videos/queue`):
  - A new `WatchQueue` service with an account-scoped localStorage key
    (`mockingbird_watch_queue`, registry sensitivity `private`). An entry is
    `{ id, source: youtube | post(+server, attachment), title, thumbnail?,
addedAt }`, with a size cap and de-duplication by source.
  - Queue buttons on YouTube cards (`/videos`), Fedi video cards, and Watch.
  - The queue page lets you play, remove, move up and down, and clear (with
    confirmation).
  - On Watch, "Up next" plays the next queued video and removes the one that
    just played. Auto-advance only if the player exposes an `ended` event;
    otherwise there is an explicit button.
- Video mode becomes Home | Fedi videos | YouTube | Queue.
- `/videos` gets in-page links to Fedi videos and Queue (the guard rail
  above).

## Sprint 3: video search and the watch-party finder

- **Video search** (`/videos/search?q=`): one focused input and a grid of
  video results:
  - Mastodon status search and hashtag timelines, kept only when a post
    carries video (an attachment, or a link to a recognised video host).
  - YouTube results as a second source for Plus subscribers, with the same
    gate and upsell as `/videos` today.
  - Every result has Watch and Queue.
  - The YouTube search now in the `/videos` header moves here once the flag
    reaches production. Until then it stays on `/videos` as well.
- **Watch parties** (`/videos/parties`): parties are hashtags, so this is a
  hashtag browser tuned for parties:
  - Enter a tag, or pick from followed tags, trending tags, and parties you
    have opened before (session-local first; persist only if asked).
  - For each tag, show the recent posts that carry video and how active the
    tag is.
  - **Open party** goes to `/watch?post=…&tags=tag1,tag2`.
- **Watch** learns a `tags` query parameter, which pre-fills the party
  hashtags. It is validated with the existing rules (at most eight tags, valid
  hashtags), and the tags remain for this visit only, as `spec/watch-party.md`
  requires.
- Video mode reaches its final form: Home | Fedi videos | YouTube | Queue |
  Parties | Search.

## Still open

- Should the switcher say "Mastodon" or "Social"? Bluesky shows up in the same
  mode. Sprint 1 uses "Mastodon", and renaming it later is a change to the
  translation strings only.
- Whether to promote the flag to production: decide after canary feedback.
