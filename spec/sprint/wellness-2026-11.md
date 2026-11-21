# Wellness (November 2026)

Status: sprints 1–4 implemented and uncommitted · 2026-11-20. Sprints 1–2
looked good to the owner; sprints 3–4 await the manual test. Sprints 5–6 not
started.
Cadence (owner, 2026-11-20): two sprints at a time, lightweight checks
between sprints, a stop every two sprints for the owner to push and test by
hand. The full quality gates (`make test`, build, SEO, design-verify) are
held until the end of the epic or run by the owner on GitHub; they are very
expensive in wall time.

## Why

Mawkingbird should be the social client that leaves people better off than it
found them. Some of this is already baked in (no infinite scroll, feed cap and
cooldown, Calm, thoughtful posting, scheduled notification dots). This epic
gives wellness its own page and adds what other clients have plus several
things none of them have.

Wellness is **not** Zen. Zen (rails hidden, reading zen, writing zen) is a
low-distraction *layout*; wellness is about *what the app measures, shows and
invites*. Zen stays where it is.

## What exists already (inventory, 2026-11-20)

| Protection | Where | Notes |
| --- | --- | --- |
| Feed cap + cooldown, override buried in Settings | Appearance → Feed (`feedMax`, `ignoreFeedCooldown`) | Baked in; "no infinite scroll" |
| Calm mode (rage lexicon, held verdicts) | Algo (`algoCalm`, `feeds/calm-verdicts.ts`) | |
| Thoughtful posting, confirm before post, delayed send | Appearance → Posting, Writing | |
| Auto-refresh off by default | Appearance → Timeline | Mastodon's "Slow mode" |
| Home window today/week/all | Home | |
| Scheduled notification dots + quiet hours | Notification preferences (`shell/menu-indicator-policy.ts`) | Already a digest |
| Grouped notifications, Show images, Feed Doctor | various | |

## Reference survey

| Client | Wellness features |
| --- | --- |
| Tusky / Pachli | "Wellbeing": hide stats on posts; hide stats on profiles; limited notifications (no favourite/boost/follow) |
| Elk | Per-count hides (reply, boost, favourite, quote, followers), grayscale mode, hover cards off, autoplay off |
| Mastodon web | "Show interaction statistics in feeds" (counts stay on the post page), Slow mode, aggregate boosts, hide hover cards, GIF autoplay |
| Phanpy | Catch-up: bounded sessions over followed accounts, grouped by author, with an ending |
| Moshidon | Hide interaction buttons (rejected before: see moshidon_parity.md) |

## Owner decisions (2026-11-20)

| Topic | Decision |
| --- | --- |
| Page | New **Settings → Wellness**. Existing protective controls appear **in both places** (their current page and Wellness), writing the same prefs. |
| Presets | **Off / Gentle / Strong** with individual overrides below. **Off is the default** for new and existing users. Gentle is a nice preset, not a default. |
| Friction | **None** beyond what exists. Wellness switches toggle freely; the feed cooldown keeps its buried override. |
| Counts | When hidden: hidden in feeds, **tap to reveal**: the focused post on its thread page shows its numbers. |
| Analytics | Wellness can **hide analytics entry points** entirely. |
| Blue checks | Hiding profile counts **also hides follower-based checks**. The private self-check stays (it isn't popularity). |
| Algo | Becomes a **dropdown**: Good Stuff / Relationships / Catch-up. When Good Stuff is demoted it leaves the top level but stays reachable in **Feeds** (the big list, which takes intent to open). |
| Discovery windows | Explore + Trends, Good Stuff, local/federated timelines are closed outside a window. Windows: **10 / 20 / 45 min / no limit**, one tap to open. Complex schedules (e.g. "Sundays") deferred. |
| Time-aware | Check-in on open, break reminders, grayscale (manual + after threshold) are in. **Off by default**; Strong turns them on. |
| Grayscale | Starts fading after **45 min** of use in a day, fully gray 15 min later, resets at 04:00 local. |
| Sync | Wellness settings live in the `mockingbird_client_prefs` blob, so they **sync with Plus settings sync** like every other client pref. The usage clock stays per device. |
| Native | Shared UI for everything. Native uses **OS-level activity** (idle/focus) for the usage clock because it is more accurate than tab visibility. OS notifications are out of scope. |
| Tier | Free. Every provider (Mastodon, Bluesky, Misskey, Twitter, RSS). |

## Preset table

| Protection (key) | Off | Gentle | Strong |
| --- | --- | --- | --- |
| Baked in: feed cap, no infinite scroll, auto-refresh off by default | ✔ | ✔ | ✔ |
| `hidePostCounts`: like/boost/reply/quote/reaction counts hidden in feeds | | ✔ | ✔ |
| `noHoverCards`: no profile pop-ups on hover | | ✔ | ✔ |
| `demoteGoodStuff`: Good Stuff off the Algo menu, kept in Feeds | | ✔ | ✔ |
| `hideProfileCounts`: follower/following/post counts + follower-based checks | | | ✔ |
| `limitedNotifications`: no favourite/boost/follow notifications | | | ✔ |
| `hideAnalytics`: analytics entry points hidden | | | ✔ |
| `forceCalm`: Calm mode always on | | | ✔ |
| `discoveryWindows` | | | ✔ |
| `checkIn` | | | ✔ |
| `breakReminders` | | | ✔ |
| `autoGrayscale` | | | ✔ |
| `grayscale` (manual) | | | |

Changing a switch away from the preset shows "Custom (from Strong)"; choosing
a preset clears the overrides.

## Sprint 1 — Foundation and quiet counts

- `wellness/wellness-model.ts` (pure): keys, presets, normalize, effective
  values, root attributes. `wellness/wellness.ts` service.
- Stored as `wellness: { preset, overrides }` inside the client prefs blob
  (synced).
- `/settings/wellness` page: preset picker, switches, and the existing
  protections mirrored (feed cap/cooldown, auto-refresh, Calm, thoughtful
  posting, confirm/delay, show images, notification hours link).
- Post counts hidden in feeds on every provider (`mbActionCount`, count-link
  buttons, Misskey reaction counts); the focused thread post reveals.
- Profile counts hidden (profile header, hover card, account search result);
  follower-based blue checks hidden.
- Hover cards off. (GIF autoplay was dropped: feeds already show still
  previews, the player never autoplays and custom emoji use `static_url`, so
  the switch would do nothing.)

Acceptance: Off changes nothing for anyone; Gentle hides feed counts but a
thread's focused post shows them; Strong hides profile numbers and checks;
the settings blob round-trips through sync unchanged.

## Sprint 2 — Quiet inputs

- Limited notifications: favourite/boost/follow notifications filtered out of
  the notifications page and the menu indicator lane.
- Hide analytics: entry points to post analytics, account analytics, feed
  analytics, reach hidden; direct routes still work (a deliberate URL is
  intent).
- Force Calm: Calm on and its toggle shows "on (Wellness)".

## Sprint 3 — Algo dropdown and Catch-up

- Algo view tabs become a dropdown: Good Stuff / Relationships / Catch-up.
- Catch-up (phanpy_parity.md item 1): a bounded session over followed
  accounts since the last catch-up (or a chosen range), grouped by author,
  with an ending and a record of past sessions.
- `demoteGoodStuff`: Good Stuff leaves the dropdown and appears in the Feeds
  catalogue.

## Sprint 4 — Discovery windows

- Route guards on Explore, Trends, Good Stuff, local/federated timelines.
- "Closed" page with one tap to open a 10 / 20 / 45 min / no-limit window.
- When a window ends, the page finishes the post you're reading; next
  navigation shows a calm "window closed".

## Sprint 5 — Time-aware

- Local per-day usage clock (per device, resets 04:00), built on the existing
  route time tracking, paused when hidden/idle.
- Check-in on open: what are you here for (catch up / post / notifications /
  browse) and optional time budget.
- Break reminders only at natural stops (end of feed batch, end of Catch-up,
  budget reached), non-judgmental copy.
- Grayscale: manual toggle; automatic fade after threshold.

## Sprint 6 — Native activity

See `mawkingbird_native/sprint/17-wellness-activity.md`.

## Deferred

- Discovery schedules ("Sundays only"), daily window allowances.
- OS notification digests in Native.
- Friction/cooldowns before turning protections off.

## Evidence: sprints 1–2 (2026-11-20)

Light checks only, per cadence. Passed: `make test-changed` (860 spec files
compiled as a narrowed program; the two failures it found were fixed and
re-run with `test:subset`: settings-shell's anonymous page list gained
Wellness, and an ngModel disabled-timing test), `check:i18n`, `check:storage`,
`check:dead-code`, `design:inventory-check` (audits updated: new candidate
`settings-wellness.html` reconciled as backlog), prettier and `ng lint` on
every touched file.

Not run (deferred to the end of the epic or the owner's GitHub run): full
`make test` with coverage, `build:mockingbird`, SEO, design-verify browser
suite, integration.

Implementation notes:

- Counts are hidden by global CSS on `html[data-wellness-post-counts]`
  (`styles.css`), matching `[mbActionCount]`, `.count-link` and Misskey
  `.reaction-count` inside any `app-status-card` without `data-counts-shown`.
  The thread page's focused post sets `[revealCounts]`.
- Profile counts: profile header (Following/Followers stay as buttons without
  numbers), hover card, account search result. `people-browser` and analytics
  pages still show counts (analytics is covered by `hideAnalytics`).
- Limited notifications filter the notifications list, its type menu and the
  header dot lanes (Mastodon stream + Bluesky observations). The server's
  unread marker is ignored while on, since it can't tell a like from a mention.
- Analytics hidden: post menu item, Home command bar button, list/tag/starter
  collection tabs, the analytics feed CTA card, observability's link. Direct
  URLs still work.
- Not-yet-shipped switches (Good Stuff demotion, discovery windows, check-in,
  breaks, auto-grayscale) are listed but disabled; manual grayscale works now.

## Evidence: sprints 3–4 (2026-11-20)

Light checks only. Passed: `make test-changed` (863 spec files, all green),
`check:i18n`, `check:storage` (two new keys), `check:dead-code`,
`design:inventory-check` (four new candidates reconciled as backlog),
prettier and `ng lint` on every touched file. Deferred as before: full
`make test`, `build:mockingbird`, SEO, design-verify, integration.

Implementation notes:

- **Algo view picker** (`feeds/algo/algo-view-tabs.ts`) is a native select:
  Good Stuff / Relationships (Native only) / Catch-up (signed in). It hides
  itself with one view. Its old two-tab spec was rewritten for the dropdown.
- **Catch-up** (`/algo/catch-up`, `feeds/catch-up/`): one tap per session,
  range "since last catch-up" (first time 12 h, never past 72 h) or 1–24 h;
  loads through a component-scoped `FeedAggregator` with an explicit cutoff
  (new optional `reset(cutoffMs)`), so every Home network is included. Capped
  at 600 posts and says so. Grouped by person (collapsed rows), filter by
  kind, order by most active / most recent, overlap note, ending card,
  Finish records history (`mockingbird_catch_up`, account-scoped, private).
  Caveat: the aggregator resets the shared provider objects; Home re-runs
  `load()` when it is re-created, so the effect is limited to a Home that
  stayed alive in the background (none today).
- **Demote Good Stuff**: the top-level Algo tab opens Catch-up (Bluesky
  primaries too, instead of Discover); Good Stuff is a row on the Feeds
  landing list and stays listed in the picker only while you're on it.
- **Discovery windows** (`wellness/discovery-*`): `discoveryWindowGuard` on
  `/explore`, `/algo` (Good Stuff only), `/for-you`, `/public`,
  `/feeds/servers/:server/:feed`. Closed routes land on `/discovery-closed`
  with `next`; one tap on 10 / 20 / 45 min / "No limit today" (until 04:00)
  opens and continues. Window end is per device (`mockingbird_discovery_window`,
  cache, not synced). Rails hide trends, Bluesky trends, who-to-follow and
  feed links while closed. A banner above discovery pages counts down and,
  when the window ends, says so without leaving the page. `/explore` is a
  standalone page outside the shell, so it is guarded but has no banner.
