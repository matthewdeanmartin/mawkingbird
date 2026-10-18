# Top-level menu: app modes (Mastodon / RSS / Video)

Status: in production; the `mode-nav` flag is removed. Sprints 1–2 and the
five-tab menus are committed. Video search, watch parties and the menu cleanup
are implemented and uncommitted · 2026-10-18.

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
- **Symmetry:** every mode has Home, five tabs, then the switcher. Search sits
  in slot 4 wherever a mode has one. Watch parties wait in Sprint 3 for a slot
  or a switcher row.
- **"Saved" synonyms** (private likes, stars, bookmarks, read later, the watch
  queue) are a known muddle, and we are not solving it now. Tab labels reuse
  the words the destination page already uses.
- **Labels are aggressively short** (owner, 2026-10-18): one short word per new
  tab, so the bar fits in long languages too. Mastodon's original tabs and the
  mode names are unchanged, except that the Mastodon mode is labelled **Fedi**
  (Bluesky lives there too) and the fediverse video tab is **Posts**. Internal
  ids (`mastodon`, `/videos/fedi`) are unchanged.

## Menus

```
mastodon: Home | Algo  Inbox  Chat  Search  Feeds | [RSS ▾]
rss:      Home | Read  Later  Shelf  Kits  Manage | [Fedi ▾]
video:    Home | Posts  YouTube  Queue  Search  Saved | [Fedi ▾]
```

| Tab              | Destination                 | Notes                                                                           |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------- |
| RSS Reader       | `/rss`                      |                                                                                 |
| RSS Read later   | `/rss?filter=starred`       | The RSS page calls its starred list "Read later"; the URL keeps the internal id |
| RSS Library      | `/bookmarks?tab=read-later` | The Reader library; named apart from the list above                             |
| RSS Starter kits | `/rss?view=kits`            |                                                                                 |
| RSS Manage feeds | `/settings/rss`             | Was a switcher row                                                              |
| Video Posts      | `/videos/fedi`              | Home locked to its Video view                                                   |
| Video YouTube    | `/videos`                   |                                                                                 |
| Video Queue      | `/videos/queue`             |                                                                                 |
| Video Search     | `/videos/search`            | Stub: Google with `site:youtube.com` prefilled                                  |
| Video Saved      | `/bookmarks?view=video`     | Bookmarks, With video view                                                      |

Rules:

1. **Home** comes first, behaves the same in every mode, and sets the mode to
   Mastodon.
2. **The last slot is the mode switcher.** Its icon and label show the mode
   you would most likely go to next: RSS from Mastodon, and Mastodon from
   anywhere else. A caret marks it as a menu. The menu lists all three modes
   as links to each mode's landing page (`/home`, `/rss`, `/videos`), with the
   current mode marked. The menu is an anchored `MbPopover`. It opens
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
| `/bookmarks…`                                   | sticky (RSS Library and Video Saved live there)                 |
| `/read/…`, `/statuses/rss:…`, `/accounts/rss:…` | sticky                                                          |
| `/settings…` (other than rss)                   | sticky                                                          |
| everything else                                 | mastodon                                                        |

The mode is kept in `sessionStorage` (`mockingbird_app_mode`, registered in
`storage-registry.ts` as a session-only `setting`). Every access is wrapped in
try/catch. A reload keeps the tab in its mode. A new tab starts in Mastodon.

## Rollback (retired)

The `mode-nav` flag shipped to canary and was promoted by the owner on
2026-10-18, then removed with the old nav branch and the flag-off fallback
links. No durable per-user opt-out was wanted. Going back now means reverting
the commits; the only state is the session-only `mockingbird_app_mode` key.

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

### As built (2026-10-18)

- `/videos/fedi` routes to `Home` with `data: { videoOnly: true }`. Home
  applies its Video view on entry, never applies the saved Home default there,
  and hides the view toggles, My tags and the default picker. `/home` is
  unchanged. Like Home's own Video view, entering it turns the reader-mode pref
  off.
- The queue stores **Watch query params**, not media URLs:
  `{ key, title, poster?, params, addedAt }`. The params are validated against
  the shapes Watch accepts (`post`/`server` plus `youtube` or `attachment`,
  or `youtube` alone), and keys are recomputed on read. The cap is 200.
  Storage failures are tolerated.
- Queue appears on every **inline** player (feed posts and `/videos`) beside
  Open Watch, and in the Watch header. An upload with no Watch link cannot be
  queued.
- There is no auto-advance. The player promises never to advance on `ended`
  (`video-player.spec.ts`). Watch shows **Next: <title>**, which removes the
  current video from the queue and opens the next one.

## Sprint 3: video search and the watch-party finder

### As built (2026-10-18)

- **Video search** (`/videos/search?q=`): the form sits in the rail column and
  the results span the centre and right columns. **Fediverse** results combine
  the hashtag timeline for each query word (up to four) with the server's post
  search when signed in, keeping posts with video (`isVideoStatus`), newest
  first. Anonymous visitors get the hashtag half through their public server.
  `site:` operators are stripped, so they do not become hashtags. **YouTube**
  results (videos or channels) are for Plus subscribers, with Watch and
  Subscribe; inline players carry Queue. Google (`site:youtube.com`) and the
  regular post search remain as hand-offs. A newer search discards older
  answers.
- **YouTube search on `/videos` stays.** Removing it would delete protected
  tests in `videos-page.spec.ts`; that is an owner decision.
- **Watch parties** (`/videos/parties?tags=a,b`), reached from the ... menu:
  enter tags, or pick from followed or trending tags (signed in), or the
  anonymous followed tags. Shows the chosen tags' recent public posts that carry
  video, newest first, with a count and the latest time. **Open party** opens
  Watch for that video with `&tags=`. Posts whose video Watch cannot play say
  so instead of offering the link.
- **Watch `tags`**: Watch passes `?tags=` to the party conversation, which joins
  them as each session starts. They are checked with `normalizeHashtag`, capped
  at eight, skipped quietly when invalid, and kept for the visit only. They are
  not part of the queue key.
- **Known rough edges** (the owner expects these: Mastodon has no rooms):
  - A party is only a hashtag, so unrelated posts under a broad tag show up.
  - Results are one page of 40 per tag, with no paging.
  - There are no trending suggestions for Anonymous.
  - Parties opened before are not remembered.
  - Hashtag timelines show only what the reader's server has federated.
  - The visibility limits in `spec/watch-party.md` still apply.

### Menu cleanup (2026-10-18)

- The ... menu drops **Manage RSS feeds** (it is RSS's Manage tab) and
  **Drafts**, and gains **Watch parties**. Videos stays, because a protected
  shell test expects it. Drafts is reachable from Write's new **Manage**
  button beside **New**. While the `write` flag exists, Drafts reappears in
  the menu for anyone who has switched Write off.
- The RSS header loses **Customize** (the Manage tab). The starter-kit toggle
  stays: a protected test expects it, and it is also the way back to the reader.

## Still open

- **Remove the `write` flag** (owner request). This is blocked on three
  protected tests in `app.routes.spec.ts` and `feed-cta-store.spec.ts` that
  assert the flag guard. It needs the owner's go-ahead to retire them.
- **`/feeds/lists` drill-down.** It has always skipped the landing list and
  stacked every list-type section, by design and covered by a protected test.
  It now looks broken because Other servers and Video feeds made the stack
  long. Changing it reverses that decision.
- Dropping the YouTube search box from `/videos` (protected tests).
- `test:audit:update` once the owner accepts the added and retired tests.
