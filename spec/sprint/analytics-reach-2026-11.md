# Analytics and reach (November 2026)

Status: Sprints 1–2 implemented locally 2026-11-20 (uncommitted; owner pushes
and runs full gates on GHA every two sprints). Sprints 3–6 planned. Owner
decisions: 2026-11-20.

## Progress

### Sprints 1–2 (2026-11-20)

Delivered:

- `ui/src/app/accounts/reach-model.ts`: thread grouping, the net curve, Quick
  and Full potential audience, and per-thread/sample reach. The old
  `REACH_MODEL` folklore in `account-metrics.ts` is deleted; the time buckets
  take a per-post reach lookup and credit each thread's reach to its first post.
- Calibration: `make reach-calibration` / `make reach-calibration-replay`
  (`ui/scripts/reach-calibration.mjs`). The first run took 49 calls and set
  `typicalBoosterAudience` 250 → 268. See
  [../analytics-calibration.md](../analytics-calibration.md).
- Account analytics: the tiles are **Est. reach**, **Est. reach / thread** (with
  the newer vs older trend) and the new **Could have reached**. Each has an
  `MbHelp` (?) explainer, as do favourites, boosts, replies received,
  engagements per post, followers and following. The help text names the
  method in use (quick / full / mixed). The "cheap peek" caveat line is
  removed. Top posts show their thread's net and potential reach.
- `accounts/booster-lookup.ts` (root, session cache): the "Refine reach with
  real boosters (N API calls)" button. One `reblogged_by` page (80) per
  boosted post, most-boosted first, ≤ 40 calls per click, 2 in flight. A 429
  stops the run and keeps what it has; refused posts are skipped and not
  retried. The run can be stopped. Anonymous profiles read from the post's own
  server by raw id (`AnonymousPublicApi.getRebloggedBy`). `Api.rebloggedBy`
  gained an optional `limit`.

Deferred or changed from the plan:

- Web reads **one** booster page per post (FediWings reads up to 10). Extra
  boosters fall back to the constant, which keeps web cheap.
- No 429 wait-and-resume in the browser: the run stops, and clicking again
  continues with the posts not looked up yet.
- Bluesky: Quick reach only and no refine button (`getRepostedBy` not wired).
- "Free if present" boosters from already-loaded reblog notifications are not
  wired; this moves to Sprint 3 (own posts) and Sprint 4 (native archive).
- Removed i18n keys `accountAnalytics.reachEstimated`,
  `tiles.estReachTotal` and `tiles.estReachPerPost` from every locale. The new
  `help.*`, `refine.*`, `tiles.reach*`, `tiles.potentialAudience` and
  `topPosts.reach` keys are English-only until the next translation pass.

Checks run (lightweight, per owner cadence): `make test-changed` (291 files,
3,936 tests green), new specs `reach-model.spec.ts` and `booster-lookup.spec.ts`,
reach specs in `account-analytics.spec.ts`, `check:i18n`, `ng lint` on touched
files, prettier on touched files, `design:inventory-check` (inventory
regenerated and reviewed in `06-consolidation.md`), `test:source-integrity`,
and `build:mockingbird` (green; the reach code is in lazy chunks, not `main`).
**Not run:** full `make test` with coverage, SEO, `design-verify` and
integration. These are left to the owner's push/GHA.

## Why

Our reach number is a guess (`ui/src/app/accounts/account-metrics.ts`
`REACH_MODEL`: 10% of followers + 1.5 per favourite + a flat 250 per boost).
The third-party reference app FediWings (`../REFERENCE/fediwings`, not ours, no
license file: **reimplement the method from its public methodology page, do not
copy code**) produces reach estimates the owner tested on their own account
and found plausible. Native (`mawkingbird_native`) now holds a large post
archive that the shared analytics pages do not read yet.

## Owner decisions

1. **Two reach metrics, not one.**
   - **Quick reach**: zero extra API calls, runs everywhere (web and native),
     computed only from data the page already has. It replaces the current
     `REACH_MODEL` but stays deliberately cheap.
   - **Full reach**: attributes boosters (`/statuses/:id/reblogged_by`) and sums
     their follower counts. API-expensive (up to one call per boosted post).
     It is the default in native, where it is served from the archive. On web
     it runs only after the person clicks an opt-in button.
2. **Web economizes calls.** Full reach on web is a button labelled with its
   cost ("Refine with boosters (N API calls)"), the same consent pattern as the
   existing "Fetch N more pages (N API calls)". Nothing spends booster calls on
   mount.
3. **Native catches up, it does not re-download.** Fetch only posts newer than
   the cache, then recount a recent window (posts younger than about 14 days)
   so like and boost counts stay fresh. Every recount stores a dated count
   snapshot, which gives us growth curves for free.
4. **Single-post analytics gets its own route**: `/statuses/:id/analytics`,
   shareable and anonymous-capable. Link it from the post's action menu and
   from top-post lists on the account page.
5. **Every stat gets a (?) explainer.** Use the existing `mb-help` component
   (`design-system/help`). The text says what the number is and where it
   came from, briefly and factually. These are social-media metrics, not
   audited financials: no paragraphs of caveats and no fearful hedging. One
   line of method and one line of source is the target. Keep the details for
   the methodology page.

## Analytics surfaces (inventory)

| Surface                                                     | Component                                  | Data today                                                                           |
| ----------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Self (`/analytics`) and any account (`/mastodon-analytics`) | `accounts/account-analytics`               | ~100 own posts sampled, followers count                                              |
| Hashtag, list, home, starter collection                     | `feeds/feed-analytics` (`feed-metrics.ts`) | Sampled or already-loaded feed posts                                                 |
| Single post                                                 | **none**: new in Sprint 3                  | n/a                                                                                  |
| Native archive                                              | **not wired** to any analytics page        | `archive_post` counts (overwritten, no history), notifications, actor `profile_json` |

## The two models

Both share one pure module (replace `REACH_MODEL` in `account-metrics.ts`; one
place for constants, unit-tested, no Angular).

**Thread grouping (both).** Connected self-replies are one thread; replies to
other accounts and boosts are not counted as the author's reach. Thread counts
are summed across the parts.

**Net curve (both).** For a thread with potential audience `G`, boosts `B`,
quotes `Q`, likes `L`, replies `R`:

```
net = min(G, max(0.0165 · G · (1 + 2B + 2Q)^0.7314 · (1 + L + R)^0.2214,  L + B + Q))
```

The curve comes from FediWings' published methodology (fit to 510 Instagram
stories, with a boost counted as two shares). We state that in the (?) text and
on the methodology page. If we later calibrate the constants ourselves, they
live in the same object.

**Quick reach: how `G` is found without API calls.**

```
G_quick = F_author + B · A_booster
```

- `F_author`: the account's follower count (already loaded).
- `A_booster`: a typical booster's audience. Do not use a hard-coded 250. It is
  fitted from Full reach runs (see the calibration record below): the median
  booster audience _per boost_, robust to celebrity outliers. It is shipped as
  a constant with its date and sample size.
- **Free-if-present upgrade:** if the page already holds the real boosters for
  a post (for example, reblog notifications loaded this session, or native
  archive actors), use their real follower counts for those posts. This costs
  no calls. The (?) text says which posts used real boosters.

**Full reach.** `G_full = F_author + Σ followers of distinct public boosters`
(deduplicated across the thread). Boosts that cannot be attributed fall back to
`A_booster`. Budget on web: paging follows `Link`, there is a per-run cap
(start at 40 calls, max 2 parallel), 429 waits for the reset, and the run can
be cancelled. Partial results are shown and labelled.

**Potential audience** (the gross `G`) is shown beside net as "could have
reached". It is not the headline.

## Sprints

### Sprint 1: Quick reach v2 and the explainer pattern

- New pure reach module: thread grouping, net curve, `G_quick`, and potential
  audience. Delete `REACH_MODEL`; account analytics tiles, buckets and trend
  use the new model.
- First calibration of `A_booster`: a dev script (Make target) runs the Full
  model on a handful of public accounts the owner names and writes the
  calibration record (`spec/analytics-calibration.md`: date, accounts, sample
  size, fitted value, and quick vs full error per post).
- Explainer pattern: an `mb-help` placed next to each stat tile and bucket
  title, with its text in i18n (`*.help.*` keys). Add it to the reach tiles,
  followers and engagement tiles first.
- Explainer style guide (short, in this file): what it is · how it is
  computed · what data/sample it used. Use the active voice. One "estimate"
  word is enough.

### Sprint 2: Full reach on web (opt-in)

- "Refine with boosters (N API calls)" on account analytics: N is the number of
  boosted threads in the sample, capped. Show progress, allow cancel, keep
  partial results.
- Show net and potential audience per thread; the tile shows Quick until a
  refine finishes, then Full, and the (?) says which.
- In-memory cache of `reblogged_by` results per status for the session, so the
  post page (Sprint 3) reuses them.
- Bluesky: `getRepostedBy` is the equivalent; include it if it fits the
  budget, otherwise Quick only and say so.

### Sprint 3: Single-post analytics page (`/statuses/:id/analytics`)

- Anonymous-capable and prerender-safe like other tool pages; deep-link audit
  (`audit_deep_links.py`) for the new parameterized route.
- Shows the thread's net reach and potential audience, likes/boosts/
  replies/quotes, a booster list sorted by audience (one or two
  `reblogged_by` calls, behind the same button on web; automatic in native),
  and reply count vs. visible replies.
- Boost timeline: only where timestamps exist (your own post, from reblog
  notifications; native archive). Otherwise do not draw one.
- Entry points: the post action menu (your own posts, plus any post on
  native) and the account analytics top-posts list.

### Sprint 4: Native catch-up, count freshness and the archive data source (native)

- `archive_fetch_account_page` newest mode: page with `min_id` = newest cached
  id until overlap, instead of re-reading the newest 40.
- Recount window: re-read posts younger than ~14 days (configurable). It is
  rate-limited and counted in `archive_collector_count`.
- New migration: `archive_post_count_snapshot(identity_id, post_id,
observed_at, replies, reblogs, favourites, quotes)` written on every observe
  whose counts changed. Existing `archive_post` columns stay as "latest".
  Upgrade-compatible migration only.
- Persist `reblogged_by` results (booster actor + their followers at observe
  time) so Full reach in native costs calls once per post, not once per view.
- A narrow typed Rust command feeds the shared `AccountAnalytics` page
  from the archive (the full own history, not a 100-post sample). Web keeps
  its sampler. One Angular client, with a data-source seam. Per the native
  visibility rule, web shows none of this.

### Sprint 5: Native insights from real history (native)

- 30 days vs. the previous 30: net reach, interactions, likes, boosts.
  Incomplete windows are marked.
- Monthly report table plus bar charts (posts, interactions, reach,
  engagement per thread), with export as CSV.
- Follower history from follow notifications plus snapshots of our own
  `followers_count` taken on each catch-up.
- Long-tail view: when boosts arrived (notification and snapshot times) for
  your top posts.
- Engagement growth per post from count snapshots (how fast a post peaked).

### Sprint 6: Explainers everywhere and the methodology page

- (?) on every remaining stat: all `feed-analytics` tiles and sections
  (hashtag, list, home, starter collection), account analytics extras
  (liveliness, cadence, languages, partners, hashtags, link domains, heatmap),
  the post page and native report figures.
- `/analytics/methodology` (or a docs page): the two reach models, the
  formula, the API budget, the constants with their calibration record, and
  what we cannot see (overlapping audiences, hidden boosts). The (?) popovers
  link here instead of carrying caveats.
- Translation pass for the new `*.help.*` keys (UI i18n epic workflow).

## Gates

Shared implementation: follow `AGENTS.md` cadence. Use focused checks within a
sprint and full gates at the end of every second sprint (2, 4, 6): `make test`,
production build, SEO for the new route (Sprint 3), and design inventory check
for the new `mb-help` placements. Native sprints also run the native host
checks (`make check-host`, `make test-host`).

## Open items

- **Large accounts reach the cap.** For accounts with 100K+ followers, the net
  curve exceeds the potential audience, so Est. reach equals Could have
  reached (see the calibration record). Owner decision needed: keep the
  reference method as is, or damp it for large audiences.
- Calibration accounts: named by the owner 2026-11-20 (in `ui/Makefile`
  `REACH_ACCOUNTS`). The calibration is polite by design; never widen it to
  hammer a large server.
- Quotes: `quotes_count` is present only on newer Mastodon versions; treat a
  missing value as 0.
