# Low bandwidth, offline and connection diagnostics

Decisions recorded 2026-11-21 after the owner used Mawkingbird on a shopping
trip where the connection kept switching between okay, slow, flaky and gone.
Until now there has been no low-bandwidth or offline design at all. This plan
covers the web client first; Native comes last and builds on its existing
SQLite archive.

## What exists today (survey, 2026-11-21)

| Area            | State                                                                                                                                    | Gap                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Service worker  | None. Static GitHub Pages site; `boot.js` restores deep links through the shared 404.                                                    | Reloading with no signal shows the browser's offline page.                                                                            |
| Shell size      | `main` is ~22 KB gzip; 788 lazy chunks, 47 MB in total.                                                                                  | Each route you first visit costs chunk downloads, then API JSON, avatars and media.                                                   |
| Failure states  | `ServerHealth`: two status-0 failures within 15 s means the full-screen fail whale. `ServerDegradation` handles non-home roles in place. | Nothing between "fine" and "whale". No "slow but working" state.                                                                      |
| Measurement     | `ApiMetrics` keeps per-endpoint latency histograms, an error ring and time buckets per instance for the Observability page.              | Built for developer forensics, not for "how is my connection right now". Nothing records the connection getting worse before it dies. |
| Timeouts        | About 96 separate `timeout(` call sites.                                                                                                 | No shared timeout or retry policy, and no backoff tied to measured conditions.                                                        |
| Drafts          | localStorage, with durable/non-durable results reported honestly.                                                                        | No outbox: posting while offline just fails.                                                                                          |
| Native          | SQLite archive filled by `observe_read`; typed archive commands.                                                                         | Not used as an offline read source; no persistent outbox.                                                                             |
| Fault injection | Mock-server latency, timeout, 429 and malformed-JSON effects.                                                                            | No named bad-network profiles.                                                                                                        |

## Owner decisions

1. **`/m/` path, not an `m.` subdomain.** Same origin, so sign-in, drafts,
   storage and OAuth redirect URLs carry over. GitHub Pages allows one custom
   domain per repo, so a subdomain would mean a second deploy pipeline.
2. **Lite = `/m/`.** One concept. The full app gets only always-on graceful
   degradation (shared timeouts, retries, media held back when the meter says
   slow). Accepting Lite takes you to the matching `/m/` route. Shared links stay
   full-app URLs; with Lite on, opening one goes to its `/m/` version. `/m/` is
   `noindex`.
3. **Lite is suggested, never forced.** The meter notices sustained slowness or
   flakiness and shows a quiet "switch to Lite?" offer. There's also a manual toggle.
4. **Measurement is passive, with probes only when failing.** Real traffic is
   measured at no extra data cost. A tiny probe runs only when traffic has stopped
   and the last verdict was bad, so recovery is noticed.
5. **Meter first.** Measure before changing behavior, so Lite and offline work
   can respond to real conditions and their effect can be seen.
6. **Outbox: auto-send with an age limit.** A post written offline is queued and
   sent when the connection returns, with Mastodon's `Idempotency-Key` so a resend
   cannot duplicate it. If it waited longer than about 30 minutes, it stays in the
   Outbox and asks "still send this?" first.
7. **`/m/` scope: core Mastodon only.** Home, notifications, thread,
   compose/reply, profile, search, lists, bookmarks, DMs. Simplified video and
   radio: a player and existing playlists, no playlist builder. No forum, Unbird,
   analytics or anything that makes many API calls per screen. Bluesky and Misskey
   stay in the full app for now.
8. **Web read cache: text + small avatars, about 25 MB.** In IndexedDB: the
   last pages of Home and notifications, plus threads and profiles you opened,
   labelled with their age ("cached 14 min ago").
9. **Service worker: shell + visited chunks only.** No prefetching ahead.
10. **Meter UI: a header chip only when the connection is bad, plus a diagnostics
    page** with recent history, an "is it me or the server?" verdict and Copy report.
11. **Meter history persists for about 24 h at one-minute buckets**, bounded, in
    this browser only. It never records location, network names or request contents.
12. **Testing:** named bad-network profiles on the fault-injection page, plus
    Playwright offline/throttling in a few browser tests for the service worker,
    outbox and `/m/`.
13. **Native in scope:** offline reading from the archive, and an outbox kept by
    Rust that survives closing the app.

## Connection quality model

A verdict comes from a rolling window of real requests (the last 2 minutes, or
the last 30 requests if that is fewer), plus browser signals:

| Verdict   | Meaning                    | Rule (initial, tune on field data)                                                             |
| --------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `unknown` | Not enough evidence        | Fewer than 3 samples in the window and the browser says online                                 |
| `good`    | Working normally           | None of the below                                                                              |
| `slow`    | Reliable but slow          | Median of ordinary reads ≥ 1.5 s over ≥ 4 samples, or the browser reports `2g`/`slow-2g`       |
| `flaky`   | Some requests never arrive | ≥ 20% unreachable or abandoned-long requests over ≥ 5 samples                                  |
| `offline` | Nothing gets through       | The browser reports offline, or the last ≥ 3 requests were unreachable with no success in 30 s |

- "Unreachable" means status 0. A 4xx/5xx means the server answered, which is
  evidence that the network works.
- Requests that are slow by design (search, media upload, context fetches) are
  counted for reachability but kept out of the latency median, using the
  existing `latencyFamily` split.
- A request the caller abandons after ≥ 5 s counts as slow evidence at its
  elapsed time. Quick cancellations from navigation are ignored.
- Throughput is measured only when a response exposes `Content-Length` (a
  CORS-safelisted header) and is ≥ 8 KB. Otherwise the browser's
  `navigator.connection` hints are shown when available (Chromium).
- **Is it me or the server?** If the home server fails while other hosts (own
  site, other instances, the proxy) succeed, the verdict names the server.
  If everything fails, it names the connection.

## Roadmap

Two sprints per stop, as usual. English only; new strings join the global
translation pass.

### Sprint 1: connection meter (done 2026-11-21)

Shipped: `platform/network/` (model, history, meter, interceptor), the
`/connection` page, the header chip, `probe.txt`, the storage-registry entry. Manual
plan: [test_plans/low-bandwidth-s1-connection-meter-2026-11.md](test_plans/low-bandwidth-s1-connection-meter-2026-11.md).
Not yet run: production build/bundle check, `make test` with coverage, design-verify (left to GHA).

- `ConnectionMeter` service: passive samples from an interceptor, the
  `online`/`offline` and `navigator.connection` events, a pure classifier,
  and a persisted 24 h ring of one-minute buckets (`mockingbird_connection_history`).
- A probe while failing: a no-store GET for a tiny same-origin file, with
  backoff, only while the tab is visible and the verdict is `flaky`/`offline`.
  Web only for now; Native's own origin is bundled, so it needs a host-side probe later.
- A header chip shown only for `slow`, `flaky` and `offline`, linking to `/connection`.
- A `/connection` page: current verdict and reason, the last hour or day as
  per-minute bars (requests, failure share, median), browser hints, Copy report.

**Exit:** classifier unit tests cover each verdict and the edge cases
(navigation cancels, 5xx, slow-by-design endpoints); the history survives a
reload; the chip stays hidden on a good connection.

### Sprint 1b: speed stats in menus (done 2026-11-21)

The More menu's Observability row carries the typical reply time ("240 ms",
"Offline"); the menu has no room for another row. The Observability page has a
Connection card (verdict, typical reply, the last hour) linking to
`/connection`, the same shape as the storage card.

### Sprint 2: graded states and a shared request policy (done 2026-11-21)

- `ConnectionState` decides what the reader sees. The reader's own connection
  is down: a calm bottom banner ("You're offline. What's already on screen stays
  readable.") with Try now and Details, never the whale. The home server stopped
  answering: one probe of this site settles whose fault it is ("checking"), then
  the whale only if this site answered. Native has no probe, so it keeps the old
  whale behaviour. When the connection comes back, a server marked down while
  offline is rechecked once (an event, not a polling timer).
- `requestPolicyInterceptor` with the opt-in `readPolicy()`: 20 s per attempt
  (doubled while slow or unstable), 2 retries at ~1 s and ~3 s with ±30% jitter,
  `Retry-After` honoured up to 30 s, GET/HEAD only, no retries while offline.
  Adopted by `Api` for the home timeline, notifications, a status and its thread
  context; the notifications page's own 15 s timeout on that read is gone.
- Network profiles (Normal, Slow 3G, Flaky 30%, Blackouts 20 s/min, Offline) on
  the developer fault page. They run in the client inside the meter, so the meter
  and the probe see them as real, and they are session-only.
- **Changed from the plan:** slow and unstable do not get their own inline
  notices. The header chip says it, the read policy retries quietly, and each
  feature keeps its existing error state. A second banner would repeat the chip.

### Sprint 3: graceful degradation in the full app (done 2026-11-21)

- `DataSaver` (Settings → feed: "Pictures in new posts": wait for a tap while
  slow (default) / always wait / always load). Automatic mode is on while the
  connection is bad or the browser asks to save data, and stays on 3 minutes
  after recovery so pictures don't blink in and out.
- The status card reads it once, when created: cards created while saving data
  use the existing images-off rendering (alt-text rows, plain video links, link
  cards without images) plus a "Show them" button; cards that already loaded
  their pictures keep them.
- Chat polling is skipped while offline and runs half as often while saving data.
- `/connection` shows whether pictures in new posts currently wait for a tap.
- **Changed from the plan:** timeline pages are not made smaller. The meter's
  "slow" is about latency, where fewer, larger requests are better; the bytes on
  a bad connection are pictures, which now wait. The "switch to Lite?" offer
  moves to Sprint 6, because there is no `/m/` to offer until then.

### Sprint 4: service worker (done 2026-11-21)

- `ui/public/sw.js`, hand-written with no build step; runbook in
  `ops/engineering/service-worker.md`. Hashed build files are cache-first and
  saved on first use (capped at 600). Navigations are network-first, with the
  saved `index.html` only when the network fails. `boot.js`, translations, icons
  and the manifest are network-first with the saved copy as a fallback. APIs,
  other sites, `probe.txt` and the `/canary/`, `/test/`, `/help/` and `/news/`
  subtrees pass through untouched.
- Registered 5 s after start, scoped to the base href, so each deployment has
  its own worker and caches. Not registered on `ng serve` or Native
  (`BUILD_RUNTIME_POLICY.serviceWorker`).
- Kill switch: `KILL_SWITCH = true` in `sw.js` deletes the caches, unregisters
  and reloads tabs. `check:subpaths` keeps `sw.js`'s subpath list equal to the
  404 shim's.
- Readers see and remove the offline copy on `/connection` (Offline copy).
- Offline, a screen whose code was never saved no longer looks like a new
  deployment: `UpdateRecovery` shows "Not saved for offline use" instead of
  reloading into its loop guard.

### Sprint 5: web read cache and outbox (done 2026-11-21)

- `readCacheInterceptor` with an IndexedDB store (`mawkingbird-read-cache`, 25 MB,
  oldest evicted first): first pages of Home, notifications, lists, bookmarks,
  conversations and profiles' posts, plus single posts, threads, accounts and
  verify_credentials, per account scope. Offline, the saved copy is served at
  once; online, only after the network (and the read policy's retries) got no
  answer. Feeds need no changes; the offline banner says "Showing a copy saved
  N min ago". A signed-out account's saved reads are deleted.
- **Changed from the plan:** no avatars in the cache. Cache Storage charges each
  opaque cross-origin image several MB of quota (Chromium pads them), so 25 MB
  would hold a handful of faces. Avatars rely on the browser's HTTP cache.
- Outbox (`/outbox`, linked from Drafts and the offline banner): a Mastodon post
  or thread whose send fails while the device is offline is queued with its
  compose operation id, so every part keeps its Idempotency-Key. It sends by
  itself when the connection returns, from the writing account only. After 30
  minutes, or when the server refuses it, it is held: Send now, Edit as draft
  (attachments can't go to drafts and the page says so) or Delete. Online, a
  lost response keeps compose's existing retry with the same key. Cross-posts and
  scheduled posts are not queued.

### Sprint 6: `/m/` Lite shell

- A route subtree with a minimal shell (no rails or big menus, a small page
  size, media off by default) that reuses the existing feed, status card, thread,
  compose and profile components, so it improves as they improve.
- Scope as in decision 7; simplified video and radio players.
- A route budget check that fails the build if `/m/` routes pull in heavy features.
- Lite ⇄ full-app route mapping, `noindex`, and an entry from Settings.
- The "switch to Lite?" offer (moved from Sprint 3): after sustained bad
  verdicts, dismissible, remembered per session.

### Sprint 7: Native offline

- Offline reading of Home, notifications, threads and profiles from the SQLite
  archive, with coverage and staleness labels.
- A Rust-side outbox that survives closing the app, sharing semantics with the web outbox.
- A host-side connectivity probe for the meter.

## Risks and open questions

- **Service worker staleness.** A bad service worker can pin users to an old
  build. It needs a tested kill switch (a no-op `sw.js` that unregisters itself)
  before it ships.
- **IndexedDB eviction.** Browsers may clear it under storage pressure; the
  cache is a convenience and must never be the only copy of anything the user wrote.
- **Private data in the cache.** Followers-only posts and DMs in the cache are
  account-scoped and sensitive; clear them on sign-out and never put them in
  exports or diagnostics.
- **Throughput is often not measurable** cross-origin. The meter relies on
  latency and reachability; throughput is a bonus.
- **Misclassification.** A slow home server looks like a slow connection when
  it is the only host being used. The verdict says "slow" without blaming one
  side unless there is evidence from another host.
