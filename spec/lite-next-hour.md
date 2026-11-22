# Lite: the next hour on a weak connection

Owner decisions of 2026-11-21, made after reading the review in
[optimize_m_route.md](optimize_m_route.md). Owner, reviewer and implementer agree
on the core: keep Angular, the shared post card and the full writer; spend the
work on what happens after Lite is open.

## Principle for bringing features back

Features that cost a few kB of JavaScript come back. Features that are expensive
per use (bytes, requests or a large chunk; auto-translate is the example) stay
off in Lite by default, or need a deliberate decision first.

## Decisions

| Topic                        | Decision                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load-control bar             | A compact bar on every Lite screen, Lite only, choices remembered on this device. The full app keeps Settings → data saver.                                                                                                                                                                                            |
| Bar controls                 | Pictures (Off / Tap to load / On), Avatars (initials / images), Video and audio previews (off / on), Auto-refresh (Refresh only / check when stale).                                                                                                                                                                   |
| Lite defaults                | Pictures **Tap to load** (cached ones show at once; others show a placeholder and their description). Avatars **on** (cached first). Video/audio previews **off** until Play. Auto-refresh **check when stale**. Entering Lite is itself the signal to save bytes; the connection meter does not need to notice first. |
| Freshness                    | Saved threads, profiles and feeds show at once. When older than ~5 min (thread, feed) or ~30 min (profile details), check once in the background, coalesced across views, and offer the result without moving the reader. Refresh always forces a check. Thresholds are tuning choices.                                |
| Refresh that finds new posts | New posts go in above; the reader stays on the post they were reading; a pill says "N new posts" and scrolls up when tapped. Older loaded pages are kept.                                                                                                                                                              |
| Outbox                       | Visible from Lite, with draft / queued / sent status after posting so a lost acknowledgement doesn't lead to a second post.                                                                                                                                                                                            |
| Send on reconnect            | One Settings choice: queued posts send automatically on reconnect (today's behaviour, the default) or always wait for review.                                                                                                                                                                                          |
| Reader controls              | Font size, line width and contrast in Lite, from the existing shared preferences. Zero API requests.                                                                                                                                                                                                                   |
| Not in this stop             | "Recently read" with local search (not chosen this round).                                                                                                                                                                                                                                                             |

## Plan: two sprints, one stop

**Sprint A: load control.**

- The Lite bar and its four controls, persisted per device, with the defaults
  above.
- The shared status card honours them inside Lite: picture placeholders with
  descriptions and tap to load, initials avatars when off, posters and player
  origins untouched until Play.
- Reader controls (font size, line width, contrast).
- Outbox entry in Lite, and draft / queued / sent status after posting.
- The send-on-reconnect setting.

**Sprint B: saved first, keep my place.**

- Threads paint the focus post from the feed or saved record immediately and
  fetch context independently.
- Profiles paint the author from the tapped post while the saved timeline
  opens.
- Saved-first reads for threads and profiles across Lite and the full app
  (account-scoped IndexedDB), with saved-at times.
- Stale-only background checks.
- Position-preserving refresh with the "N new posts" pill, and a post-ID scroll
  anchor that survives navigation and tab eviction.

**Acceptance:** the review's journey, full app on Wi-Fi → weak connection →
Lite → an hour of reading, in English and one non-English locale. In
particular: no unsolicited picture previews in Lite, reopening a saved thread or
profile shows text before any response, and three pages plus Refresh keeps the
reader's place.

## Status (2026-11-21): Sprints A and B implemented, not field-tested

- **Sprint A.** `MediaPolicy` (shared, set by Lite's shell while it is open)
  and `LitePrefs` (`mockingbird_lite_prefs`); the bar `lite-bar.ts`. The status
  card follows the override live: pictures off / tap to load (pictures this tab
  already loaded show at once) / on; initials when avatars are off; a Play
  button in place of video, YouTube and external players while previews are
  off. Reader controls (text size by zoom, line width, high contrast) are local
  CSS on the shell. Outbox in the Lite nav while something waits; a "Posted."
  line after the quick composer sends. "When the connection comes back" (send
  automatically / wait for review, `mockingbird_outbox_send`) on the Outbox page
  and in Settings → Writing.
- **Sprint B.** `LiteStore` remembers every post and account it has shown.
  Threads paint the tapped post at once and fetch replies separately; profiles
  paint the author from the tapped post. First visits show the read cache's
  copy on disk and ask the server only when there is nothing to show or it is
  stale (5 min feeds and threads, 30 min profiles), and only with "Updates: when
  out of date". Refresh merges instead of replacing: newer posts go on top only
  while the reader is at the top, otherwise they wait behind a "New posts: N ↑"
  pill; a newest page that does not reach the held posts is marked as a gap.
  Leaving a list records the post in view and coming back returns to it.
- **Review follow-ups.** The live dictionary is versioned per release
  (`?v=<commit>`) and GitHub Pages answers a same-build revalidation with
  **304 and no body**, so the ~191 kB gzip English dictionary costs one download
  per release per device, not per reload. The Lite size check now counts the
  screens Lite's routes load lazily (the reviewer's undercount): Lite measures
  **1,090 kB** beyond startup (budget raised to 1,150 kB with the reason in
  `scripts/report-bundle.mjs`); startup is 975.8 kB of 1 MB.
- All new strings are in all 17 locales (check:i18n Rule 2b).
- Not done: a per-resource coalescing layer beyond "one check per held screen";
  restoring the reading position after the browser evicts the tab (held
  screens live in memory; after eviction the saved first page shows).
- Field plan: [test_plans/lite-next-hour-2026-11.md](test_plans/lite-next-hour-2026-11.md).
